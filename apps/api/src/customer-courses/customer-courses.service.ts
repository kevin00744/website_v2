import { Injectable } from '@nestjs/common';
import { Prisma, type PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { canActorAccessCustomer } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import { createLedgerEntry, recordEffects } from '../customer-transactions/transaction-ledger';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer', 'line_pay', 'credit_card'];

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
      where: { id: courseId, voidedAt: null },
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
   * 退費試算用的單堂價（前端可再修改）：
   * 1. 課程來自交易（購買方案）：實收 ÷ 這筆交易所有品項的堂數合計 → 依顧客實際付的錢等比例退
   * 2. 沒有交易但有購買價：purchasePrice ÷ totalSessions
   * 3. 都沒有：品項單次定價
   */
  async refundQuote(actor: AuthenticatedUser, courseId: number) {
    const course = await this.getCourseWithAccess(actor, courseId);
    const remaining = course.totalSessions - course.usedSessions;

    let unitPrice = course.serviceItem.price;
    let basis = `品項單次定價 $${course.serviceItem.price.toLocaleString()}`;
    const txn = course.transactionId
      ? await this.prisma.customerTransaction.findUnique({ where: { id: course.transactionId } })
      : null;
    const actual = txn?.planActual as { price?: number; items?: Array<{ sessions: number }> } | null | undefined;
    const planSessions = actual?.items?.reduce((s, i) => s + (i.sessions || 0), 0) ?? 0;
    const paid = typeof actual?.price === 'number' ? actual.price : txn?.amount;
    if (txn && planSessions > 0 && typeof paid === 'number') {
      unitPrice = Math.round(paid / planSessions);
      basis = `購買實收 $${paid.toLocaleString()} ÷ ${planSessions} 堂`;
    } else if (course.purchasePrice != null && course.totalSessions > 0) {
      unitPrice = Math.round(course.purchasePrice / course.totalSessions);
      basis = `購買價 $${course.purchasePrice.toLocaleString()} ÷ ${course.totalSessions} 堂`;
    }

    return {
      courseId: course.id,
      serviceItem: course.serviceItem,
      totalSessions: course.totalSessions,
      usedSessions: course.usedSessions,
      remaining,
      unitPrice,
      basis,
    };
  }

  private validateRefund(remaining: number, input: { refundedSessions: number; calculatedAmount: number; finalAmount: number }) {
    if (!Number.isInteger(input.refundedSessions) || input.refundedSessions <= 0 || input.refundedSessions > remaining) {
      throw new AppError('INVALID_REFUND_SESSIONS', `退回堂數必須介於 1 至 ${remaining} 之間`, 400);
    }
    if (!Number.isInteger(input.finalAmount) || input.finalAmount < 0) {
      throw new AppError('INVALID_REFUND_AMOUNT', '退款金額必須為 0 以上的整數', 400);
    }
    if (!Number.isInteger(input.calculatedAmount) || input.calculatedAmount < 0) {
      throw new AppError('INVALID_REFUND_AMOUNT', '試算金額必須為 0 以上的整數', 400);
    }
  }

  /**
   * 課程退費（退現金 / 轉帳 / LINE Pay / 信用卡）：
   * 剩餘堂數扣除、財務記一筆退費支出、現金退款時從備用金扣；整筆記在交易紀錄，系統管理員可刪除回溯。
   */
  async refund(
    actor: AuthenticatedUser,
    courseId: number,
    input: {
      refundedSessions: number;
      calculatedAmount: number;
      finalAmount: number;
      paymentMethod: PaymentMethod;
      adjustNote?: string;
    },
  ) {
    this.assertCanModify(actor);
    const course = await this.getCourseWithAccess(actor, courseId);
    const remaining = course.totalSessions - course.usedSessions;
    this.validateRefund(remaining, input);
    if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
      throw new AppError('INVALID_PAYMENT_METHOD', '退款方式不正確', 400);
    }
    const storeId = course.storeId;

    return this.prisma.$transaction(async (tx) => {
      if (input.paymentMethod === 'cash' && input.finalAmount > 0) {
        const store = await tx.store.findUnique({ where: { id: storeId }, select: { pettyCashBalance: true } });
        if ((store?.pettyCashBalance ?? 0) < input.finalAmount) {
          throw new AppError(
            'REFUND_PETTY_CASH_INSUFFICIENT',
            `備用金不足（目前 $${store?.pettyCashBalance ?? 0}），無法以現金退款 $${input.finalAmount}`,
            422,
          );
        }
      }

      const ledger = await createLedgerEntry(tx, {
        storeId,
        customerId: course.customer.id,
        staffId: actor.id,
        operatorId: actor.id,
        kind: 'refund',
        amount: input.finalAmount,
        listAmount: input.calculatedAmount,
        paymentMethod: input.paymentMethod,
        adjustNote: input.adjustNote,
        note: `${course.serviceItem.name} 退 ${input.refundedSessions} 堂`,
      });
      await recordEffects(tx, ledger.id, { courseRefund: { customerCourseId: courseId, sessions: input.refundedSessions } });

      await tx.customerCourse.update({
        where: { id: courseId },
        data: { usedSessions: { increment: input.refundedSessions } },
      });

      if (input.finalAmount > 0) {
        await tx.financialRecord.create({
          data: {
            storeId,
            type: 'expense',
            category: 'refund',
            amount: input.finalAmount,
            paymentMethod: input.paymentMethod,
            performedById: actor.id,
            description: `課程退費：${course.serviceItem.name} ${input.refundedSessions} 堂（顧客 #${course.customer.id}）`,
            transactionId: ledger.id,
          },
        });
        if (input.paymentMethod === 'cash') {
          await tx.store.update({ where: { id: storeId }, data: { pettyCashBalance: { decrement: input.finalAmount } } });
        }
      }

      return { success: true, transactionId: ledger.id, refundedSessions: input.refundedSessions, finalAmount: input.finalAmount };
    });
  }

  /**
   * 退課程轉儲值金：剩餘堂數扣除，金額存進顧客的儲值金錢包（POS「扣儲值」用的同一個錢包），
   * 整筆記在交易紀錄，系統管理員可刪除回溯。
   * calculatedAmount = 試算（單堂價 × 退回堂數）；finalAmount = 實際入帳金額（可打折或自行填寫）
   */
  async refundToCredit(
    actor: AuthenticatedUser,
    courseId: number,
    input: {
      refundedSessions: number;
      calculatedAmount: number;
      finalAmount: number;
      remark?: string;
      adjustNote?: string;
    },
  ) {
    this.assertCanModify(actor);
    const course = await this.getCourseWithAccess(actor, courseId);
    const remaining = course.totalSessions - course.usedSessions;
    this.validateRefund(remaining, input);
    const customerId = course.customer.id;
    const storeId = course.storeId;

    return this.prisma.$transaction(async (tx) => {
      const ledger = await createLedgerEntry(tx, {
        storeId,
        customerId,
        staffId: actor.id,
        operatorId: actor.id,
        kind: 'refund_to_credit',
        amount: input.finalAmount,
        listAmount: input.calculatedAmount,
        adjustNote: input.adjustNote ?? input.remark,
        note: `${course.serviceItem.name} 退 ${input.refundedSessions} 堂轉儲值`,
      });
      await recordEffects(tx, ledger.id, { courseRefund: { customerCourseId: courseId, sessions: input.refundedSessions } });

      await tx.customerCourse.update({
        where: { id: courseId },
        data: { usedSessions: { increment: input.refundedSessions } },
      });
      const wallet = await tx.customerWallet.upsert({
        where: { customerId },
        create: { customerId, balance: input.finalAmount, bonusBalance: 0 },
        update: { balance: { increment: input.finalAmount } },
      });
      if (input.finalAmount > 0) {
        await tx.walletLog.create({
          data: {
            customerId,
            storeId,
            type: 'top_up',
            amount: input.finalAmount,
            bonusAmount: 0,
            performedById: actor.id,
            note: `退課轉儲值：${course.serviceItem.name} ${input.refundedSessions} 堂`,
            transactionId: ledger.id,
          },
        });
      }
      await tx.courseRefundToCreditLog.create({
        data: {
          customerId,
          customerCourseId: courseId,
          refundedSessions: input.refundedSessions,
          calculatedAmount: new Prisma.Decimal(input.calculatedAmount),
          finalAmount: new Prisma.Decimal(input.finalAmount),
          operatorId: actor.id,
          remark: input.remark ?? input.adjustNote,
        },
      });

      return {
        success: true,
        transactionId: ledger.id,
        refundedSessions: input.refundedSessions,
        finalAmount: input.finalAmount,
        walletBalance: wallet.balance,
        walletBonusBalance: wallet.bonusBalance,
      };
    });
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
