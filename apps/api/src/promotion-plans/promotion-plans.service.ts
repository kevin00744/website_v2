import { Injectable } from '@nestjs/common';
import type { PaymentMethod, PromotionPlanType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import { createLedgerEntry, planChanged, type PlanSnapshot } from '../customer-transactions/transaction-ledger';

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
  /** 結帳時調整後的實收金額（不填 = 方案價格） */
  price?: number;
  /** 儲值優惠：調整後的贈送金額（不填 = 方案設定） */
  bonusAmount?: number;
  /** 課程套組：調整後各品項的堂數（只能是方案內的品項；不填 = 方案設定） */
  items?: PlanItemInput[];
  /** 調整備註（選填），例如「9 折」「加贈 2 堂」 */
  adjustNote?: string;
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

    // ── 原方案 vs 結帳時調整後的實際成交內容 ─────────────────────────────
    const original: PlanSnapshot = {
      name: plan.name,
      type: plan.type,
      price: plan.price,
      bonusAmount: plan.type === 'top_up_bonus' ? (plan.bonusAmount ?? 0) : null,
      items: plan.items.map((i) => ({ serviceItemId: i.serviceItem.id, name: i.serviceItem.name, sessions: i.sessions })),
    };
    const actual = this.resolveAdjustedPlan(original, input);

    return this.prisma.$transaction(async (tx) => {
      const ledger = await createLedgerEntry(tx, {
        storeId,
        customerId: input.customerId,
        staffId,
        operatorId: actor.id,
        kind: 'plan_purchase',
        amount: actual.price,
        listAmount: original.price,
        paymentMethod: input.paymentMethod,
        adjustNote: input.adjustNote,
        promotionPlanId: plan.id,
        planOriginal: original,
        planActual: actual,
      });

      // 財務帳本（實收 0 元時不寫）
      if (actual.price > 0) {
        await tx.financialRecord.create({
          data: {
            storeId,
            type: 'income',
            category: plan.type === 'top_up_bonus' ? 'top_up' : 'sales',
            amount: actual.price,
            paymentMethod: input.paymentMethod,
            performedById: staffId,
            description: `購買促銷方案「${plan.name}」（顧客 #${input.customerId}）`,
            transactionId: ledger.id,
          },
        });
        // 現金付款連動備用金
        if (input.paymentMethod === 'cash') {
          await tx.store.update({
            where: { id: storeId },
            data: { pettyCashBalance: { increment: actual.price } },
          });
        }
      }

      if (plan.type === 'top_up_bonus') {
        // 儲值優惠：principal + bonus（依實際成交）
        const bonus = actual.bonusAmount ?? 0;
        await tx.customerWallet.upsert({
          where: { customerId: input.customerId },
          create: { customerId: input.customerId, balance: actual.price, bonusBalance: bonus },
          update: {
            balance: { increment: actual.price },
            bonusBalance: { increment: bonus },
          },
        });
        await tx.walletLog.create({
          data: {
            customerId: input.customerId,
            storeId,
            type: 'top_up',
            amount: actual.price,
            bonusAmount: bonus,
            performedById: staffId,
            note: `購買促銷方案「${plan.name}」`,
            transactionId: ledger.id,
          },
        });
      } else {
        // course_bundle：依實際成交的堂數為每個品項建立 CustomerCourse
        for (const item of actual.items) {
          await tx.customerCourse.create({
            data: {
              customerId: input.customerId,
              serviceItemId: item.serviceItemId,
              storeId,
              totalSessions: item.sessions,
              usedSessions: 0,
              transactionId: ledger.id,
            },
          });
        }
      }

      return {
        planId: plan.id,
        planName: plan.name,
        type: plan.type,
        price: actual.price,
        listPrice: original.price,
        transactionId: ledger.id,
        adjusted: actual.price !== original.price || planChanged(original, actual),
        planOriginal: original,
        planActual: actual,
      };
    });
  }

  /** 結帳時的調整：金額 ≥ 0；贈送金額 ≥ 0；堂數只能調整方案內的品項，每項 ≥ 1 */
  private resolveAdjustedPlan(original: PlanSnapshot, input: PurchasePromotionPlanInput): PlanSnapshot {
    const price = input.price ?? original.price;
    if (!Number.isInteger(price) || price < 0) {
      throw new AppError('PURCHASE_INVALID_PRICE', '實收金額必須為 0 以上的整數', 400);
    }
    let bonusAmount = original.bonusAmount ?? null;
    if (original.type === 'top_up_bonus' && input.bonusAmount !== undefined) {
      if (!Number.isInteger(input.bonusAmount) || input.bonusAmount < 0) {
        throw new AppError('PURCHASE_INVALID_BONUS', '贈送金額必須為 0 以上的整數', 400);
      }
      bonusAmount = input.bonusAmount;
    }
    let items = original.items;
    if (original.type === 'course_bundle' && input.items !== undefined) {
      if (input.items.length === 0) throw new AppError('PURCHASE_INVALID_SESSIONS', '至少要保留一個品項', 400);
      items = input.items.map((i) => {
        const base = original.items.find((o) => o.serviceItemId === i.serviceItemId);
        if (!base) throw new AppError('PURCHASE_ITEM_NOT_IN_PLAN', '只能調整方案內的品項', 400);
        if (!Number.isInteger(i.sessions) || i.sessions < 1 || i.sessions > 999) {
          throw new AppError('PURCHASE_INVALID_SESSIONS', '每個品項的堂數必須為 1 以上的整數', 400);
        }
        return { ...base, sessions: i.sessions };
      });
      const ids = new Set(items.map((i) => i.serviceItemId));
      if (ids.size !== items.length) throw new AppError('PURCHASE_INVALID_SESSIONS', '品項重複', 400);
    }
    return { ...original, price, bonusAmount, items };
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
