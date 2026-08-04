import { Injectable } from '@nestjs/common';
import type { PaymentMethod, PromotionPlanType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

export interface PlanItemInput {
  serviceItemId: number;
  sessions: number;
}

export interface CreatePromotionPlanInput {
  name: string;
  type: PromotionPlanType;
  price: number;
  /** top_up_bonus 時必填 */
  bonusAmount?: number;
  /** course_bundle 時必填（至少一個品項） */
  items?: PlanItemInput[];
}

export interface PurchasePromotionPlanInput {
  customerId: number;
  staffId?: number;
  paymentMethod: PaymentMethod;
}

const PLAN_SELECT = {
  id: true,
  storeId: true,
  name: true,
  type: true,
  price: true,
  bonusAmount: true,
  isActive: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      sessions: true,
      serviceItem: { select: { id: true, name: true, price: true } },
    },
  },
} as const;

@Injectable()
export class PromotionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listForStore(actor: AuthenticatedUser, storeId: number) {
    this.assertAccess(actor, storeId);
    return this.prisma.promotionPlan.findMany({
      where: { storeId, deletedAt: null },
      select: PLAN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(actor: AuthenticatedUser, storeId: number, input: CreatePromotionPlanInput) {
    this.assertAccess(actor, storeId);
    this.validateInput(input);

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    // course_bundle 時，驗證所有 serviceItemId 均存在且啟用
    if (input.type === 'course_bundle' && input.items?.length) {
      for (const item of input.items) {
        const svc = await this.prisma.serviceItem.findFirst({
          where: { id: item.serviceItemId, deletedAt: null, isActive: true },
        });
        if (!svc) throw new AppError('SERVICE_ITEM_NOT_FOUND', `找不到服務項目 #${item.serviceItemId}`, 404);
      }
    }

    return this.prisma.promotionPlan.create({
      data: {
        storeId,
        name: input.name.trim(),
        type: input.type,
        price: input.price,
        bonusAmount: input.type === 'top_up_bonus' ? (input.bonusAmount ?? null) : null,
        items:
          input.type === 'course_bundle' && input.items?.length
            ? { create: input.items.map((i) => ({ serviceItemId: i.serviceItemId, sessions: i.sessions })) }
            : undefined,
      },
      select: PLAN_SELECT,
    });
  }

  /**
   * 購買促銷方案：
   * - top_up_bonus → 為顧客儲值（upsert CustomerWallet，寫 WalletLog，寫 FinancialRecord）
   * - course_bundle → 為顧客每個品項建立 CustomerCourse，寫 FinancialRecord
   * 現金付款同步更新 Store.pettyCashBalance。
   */
  async purchase(
    actor: AuthenticatedUser,
    storeId: number,
    planId: number,
    input: PurchasePromotionPlanInput,
  ) {
    this.assertAccess(actor, storeId);

    const plan = await this.prisma.promotionPlan.findFirst({
      where: { id: planId, storeId, deletedAt: null, isActive: true },
      select: PLAN_SELECT,
    });
    if (!plan) throw new AppError('PROMOTION_PLAN_NOT_FOUND', '找不到此促銷方案', 404);

    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (customer.storeId !== storeId) throw new AppError('STORE_MISMATCH', '顧客不屬於此分店', 422);

    const staffId = input.staffId ?? actor.id;

    return this.prisma.$transaction(async (tx) => {
      // 財務帳本（永遠寫入）
      await tx.financialRecord.create({
        data: {
          storeId,
          type: 'income',
          category: plan.type === 'top_up_bonus' ? 'top_up' : 'sales',
          amount: plan.price,
          paymentMethod: input.paymentMethod,
          performedById: staffId,
          description: `購買促銷方案「${plan.name}」（顧客 #${input.customerId}）`,
        },
      });

      // 現金付款連動備用金
      if (input.paymentMethod === 'cash') {
        await tx.store.update({
          where: { id: storeId },
          data: { pettyCashBalance: { increment: plan.price } },
        });
      }

      if (plan.type === 'top_up_bonus') {
        // 儲值優惠：principal + bonus
        await tx.customerWallet.upsert({
          where: { customerId: input.customerId },
          create: { customerId: input.customerId, balance: plan.price, bonusBalance: plan.bonusAmount ?? 0 },
          update: {
            balance: { increment: plan.price },
            bonusBalance: { increment: plan.bonusAmount ?? 0 },
          },
        });
        await tx.walletLog.create({
          data: {
            customerId: input.customerId,
            storeId,
            type: 'top_up',
            amount: plan.price,
            bonusAmount: plan.bonusAmount ?? 0,
            performedById: staffId,
            note: `購買促銷方案「${plan.name}」`,
          },
        });
      } else {
        // course_bundle：為每個品項建立 CustomerCourse
        for (const item of plan.items) {
          await tx.customerCourse.create({
            data: {
              customerId: input.customerId,
              serviceItemId: item.serviceItem.id,
              storeId,
              totalSessions: item.sessions,
              usedSessions: 0,
            },
          });
        }
      }

      return { planId: plan.id, planName: plan.name, type: plan.type, price: plan.price };
    });
  }

  async update(
    actor: AuthenticatedUser,
    storeId: number,
    planId: number,
    input: { name?: string; price?: number; bonusAmount?: number; items?: PlanItemInput[] },
  ) {
    this.assertAccess(actor, storeId);
    const plan = await this.prisma.promotionPlan.findFirst({
      where: { id: planId, storeId, deletedAt: null },
    });
    if (!plan) throw new AppError('PROMOTION_PLAN_NOT_FOUND', '找不到此促銷方案', 404);
    if (input.price !== undefined && (!Number.isInteger(input.price) || input.price <= 0)) {
      throw new AppError('PROMOTION_PLAN_INVALID_PRICE', '售價必須為正整數', 400);
    }

    // course_bundle 時驗證並重建 items
    if (input.items !== undefined) {
      for (const item of input.items) {
        if (!Number.isInteger(item.sessions) || item.sessions <= 0) {
          throw new AppError('PROMOTION_PLAN_INVALID_COURSE_COUNT', '堂數必須為正整數', 400);
        }
        const svc = await this.prisma.serviceItem.findFirst({
          where: { id: item.serviceItemId, deletedAt: null, isActive: true },
        });
        if (!svc) throw new AppError('SERVICE_ITEM_NOT_FOUND', `找不到服務項目 #${item.serviceItemId}`, 404);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.items !== undefined) {
        await tx.promotionPlanItem.deleteMany({ where: { planId } });
        if (input.items.length > 0) {
          await tx.promotionPlanItem.createMany({
            data: input.items.map((i) => ({ planId, serviceItemId: i.serviceItemId, sessions: i.sessions })),
          });
        }
      }
      return tx.promotionPlan.update({
        where: { id: planId },
        data: {
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.bonusAmount !== undefined ? { bonusAmount: input.bonusAmount } : {}),
        },
        select: PLAN_SELECT,
      });
    });
  }

  async deactivate(actor: AuthenticatedUser, storeId: number, planId: number) {
    this.assertAccess(actor, storeId);
    const plan = await this.prisma.promotionPlan.findFirst({ where: { id: planId, storeId, deletedAt: null } });
    if (!plan) throw new AppError('PROMOTION_PLAN_NOT_FOUND', '找不到此促銷方案', 404);
    await this.prisma.promotionPlan.update({ where: { id: planId }, data: { deletedAt: new Date() } });
  }

  private assertAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    // manager 和 staff 均限自己所屬的分店
    if (actor.role === 'manager' || actor.role === 'staff') {
      if (actor.storeId !== storeId) {
        throw new AppError('PERMISSION_DENIED', '只能存取自己所屬分店的促銷方案', 403);
      }
      return;
    }
    throw new AppError('PERMISSION_DENIED', '無操作權限', 403);
  }

  private validateInput(input: CreatePromotionPlanInput) {
    if (!input.name.trim()) throw new AppError('PROMOTION_PLAN_NAME_REQUIRED', '方案名稱不能空白', 400);
    if (!Number.isInteger(input.price) || input.price <= 0) {
      throw new AppError('PROMOTION_PLAN_INVALID_PRICE', '售價必須為正整數', 400);
    }
    if (input.type === 'top_up_bonus') {
      if (!input.bonusAmount || !Number.isInteger(input.bonusAmount) || input.bonusAmount <= 0) {
        throw new AppError('PROMOTION_PLAN_INVALID_BONUS', '儲值優惠方案需填入正整數贈送金額', 400);
      }
    }
    if (input.type === 'course_bundle') {
      if (!input.items?.length) {
        throw new AppError('PROMOTION_PLAN_INVALID_COURSE_COUNT', '課程套組至少需要一個課程品項', 400);
      }
      for (const item of input.items) {
        if (!Number.isInteger(item.sessions) || item.sessions <= 0) {
          throw new AppError('PROMOTION_PLAN_INVALID_COURSE_COUNT', '每個課程品項的堂數必須為正整數', 400);
        }
      }
    }
  }
}
