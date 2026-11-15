import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { canActorAccessCustomer } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

const ALLOWED_ROLES_MODIFY = ['manager', 'system_admin'] as const;

@Injectable()
export class CustomerCoursesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanModify(actor: AuthenticatedUser) {
    if (!(ALLOWED_ROLES_MODIFY as readonly string[]).includes(actor.role)) {
      throw new AppError('PERMISSION_DENIED', '只有店長或系統管理員可以執行此操作', 403);
    }
  }

  private async getCourseWithAccess(actor: AuthenticatedUser, courseId: number) {
    const course = await this.prisma.customerCourse.findFirst({
      where: { id: courseId },
      include: {
        serviceItem: { select: { id: true, name: true, price: true } },
        customer: { select: { id: true, storeId: true, store: true } },
      },
    });
    if (!course) throw new AppError('COURSE_NOT_FOUND', '找不到此課程', 404);
    if (!canActorAccessCustomer(actor, { storeId: course.customer.storeId })) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }
    return course;
  }

  /**
   * 退課程轉儲值金：將剩餘堂數耗盡，把金額轉入顧客儲值帳戶。
   * calculatedAmount = 系統試算（purchasePrice / totalSessions * refundedSessions）
   * finalAmount = 店員實際決定的入帳金額（可與試算不同）
   */
  async refundToCredit(
    actor: AuthenticatedUser,
    courseId: number,
    input: {
      refundedSessions: number;
      calculatedAmount: number;
      finalAmount: number;
      remark?: string;
    },
  ) {
    this.assertCanModify(actor);

    const course = await this.getCourseWithAccess(actor, courseId);
    const remaining = course.totalSessions - course.usedSessions;

    if (input.refundedSessions <= 0 || input.refundedSessions > remaining) {
      throw new AppError('INVALID_REFUND_SESSIONS', `退回堂數必須介於 1 至 ${remaining} 之間`, 400);
    }
    if (input.finalAmount < 0) {
      throw new AppError('INVALID_REFUND_AMOUNT', '退款金額不可為負數', 400);
    }

    const customerId = course.customer.id;
    const finalAmountDecimal = new Prisma.Decimal(input.finalAmount);

    await this.prisma.$transaction([
      this.prisma.customerCourse.update({
        where: { id: courseId },
        data: { usedSessions: { increment: input.refundedSessions } },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: { storeCredit: { increment: finalAmountDecimal } },
      }),
      this.prisma.courseRefundToCreditLog.create({
        data: {
          customerId,
          customerCourseId: courseId,
          refundedSessions: input.refundedSessions,
          calculatedAmount: new Prisma.Decimal(input.calculatedAmount),
          finalAmount: finalAmountDecimal,
          operatorId: actor.id,
          remark: input.remark,
        },
      }),
    ]);

    const updated = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { storeCredit: true },
    });

    return {
      success: true,
      refundedSessions: input.refundedSessions,
      finalAmount: input.finalAmount,
      newStoreCredit: updated?.storeCredit.toString() ?? '0',
    };
  }

  /**
   * 課程轉換：將舊課程剩餘堂數轉入新課程。
   * 原課程 usedSessions += convertedSessions；建立新 CustomerCourse。
   */
  async convertCourse(
    actor: AuthenticatedUser,
    courseId: number,
    input: {
      newServiceItemId: number;
      newTotalSessions: number;
      newPurchasePrice?: number;
      convertedSessions: number;
      remark?: string;
    },
  ) {
    this.assertCanModify(actor);

    const course = await this.getCourseWithAccess(actor, courseId);
    const remaining = course.totalSessions - course.usedSessions;

    if (input.convertedSessions <= 0 || input.convertedSessions > remaining) {
      throw new AppError('INVALID_CONVERT_SESSIONS', `轉換堂數必須介於 1 至 ${remaining} 之間`, 400);
    }

    const newServiceItem = await this.prisma.serviceItem.findFirst({
      where: { id: input.newServiceItemId, deletedAt: null },
    });
    if (!newServiceItem) throw new AppError('SERVICE_ITEM_NOT_FOUND', '找不到目標課程品項', 404);

    const customerId = course.customer.id;

    let newCourseId: number;
    await this.prisma.$transaction(async (tx) => {
      await tx.customerCourse.update({
        where: { id: courseId },
        data: { usedSessions: { increment: input.convertedSessions } },
      });

      const newCourse = await tx.customerCourse.create({
        data: {
          customerId,
          serviceItemId: input.newServiceItemId,
          storeId: course.storeId,
          totalSessions: input.newTotalSessions,
          usedSessions: 0,
          purchasePrice: input.newPurchasePrice,
        },
      });
      newCourseId = newCourse.id;

      await tx.courseConversionLog.create({
        data: {
          customerId,
          fromCourseId: courseId,
          toCourseId: newCourseId,
          convertedSessions: input.convertedSessions,
          operatorId: actor.id,
          remark: input.remark,
        },
      });
    });

    return {
      success: true,
      fromCourseId: courseId,
      toCourseId: newCourseId!,
      convertedSessions: input.convertedSessions,
    };
  }
}
