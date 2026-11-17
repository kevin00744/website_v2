import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { canActorAccessCustomer } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import { deductionsOf, type TransactionEffects } from './transaction-ledger';

const LIST_INCLUDE = {
  staff: { select: { id: true, name: true } },
  deletedBy: { select: { id: true, name: true } },
  serviceRecord: {
    select: {
      id: true,
      consumptionType: true,
      sessionsDeducted: true,
      serviceItem: { select: { id: true, name: true } },
    },
  },
  logs: {
    orderBy: { createdAt: 'asc' as const },
    include: { operator: { select: { id: true, name: true } } },
  },
} satisfies Prisma.CustomerTransactionInclude;

type TxnRow = Prisma.CustomerTransactionGetPayload<{ include: typeof LIST_INCLUDE }>;

/** 刪除時實際回溯的明細（寫進歷程，前端顯示「已扣回 12 堂、收入 −$9,000…」） */
export interface ReversalSummary {
  income: number;
  /** 財務支出的變化（刪除退費時為負：支出減少） */
  expense: number;
  pettyCash: number;
  walletBalance: number;
  walletBonus: number;
  sessionsVoided: number;
  sessionsRestored: number;
}

@Injectable()
export class CustomerTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCustomer(actor: AuthenticatedUser, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId },
      select: { storeId: true },
    });
    if (!customer || !canActorAccessCustomer(actor, customer)) {
      throw new AppError('CUSTOMER_NOT_FOUND', undefined, 404);
    }
    const rows = await this.prisma.customerTransaction.findMany({
      where: { customerId },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toDto);
  }

  /** 預覽刪除會回溯哪些項目（確認視窗用），不做任何寫入 */
  async previewDelete(actor: AuthenticatedUser, id: number) {
    this.assertSystemAdmin(actor);
    const txn = await this.loadDeletable(id);
    return this.prisma.$transaction(async (tx) => {
      const summary = await this.reverse(tx, txn, actor.id, true);
      return { summary };
    });
  }

  /**
   * 系統管理員刪除交易：把這筆交易造成的影響全部回溯，
   * 顧客端（堂數、儲值金）與財務端（收入、現金備用金）一起更正。
   * 交易本身標記刪除並寫入歷程，不會從資料庫移除。
   */
  async remove(actor: AuthenticatedUser, id: number, reason: string | undefined) {
    this.assertSystemAdmin(actor);
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError('TRANSACTION_REASON_REQUIRED', undefined, 400);
    const txn = await this.loadDeletable(id);

    await this.prisma.$transaction(async (tx) => {
      // 併發保護：同一筆只能被刪一次
      const claimed = await tx.customerTransaction.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: actor.id, deleteReason: trimmed },
      });
      if (claimed.count === 0) throw new AppError('TRANSACTION_ALREADY_DELETED', undefined, 409);

      const summary = await this.reverse(tx, txn, actor.id, false);
      await tx.customerTransactionLog.create({
        data: {
          transactionId: id,
          action: 'delete',
          operatorId: actor.id,
          reason: trimmed,
          detail: summary as unknown as Prisma.InputJsonValue,
        },
      });
    });

    const row = await this.prisma.customerTransaction.findUniqueOrThrow({ where: { id }, include: LIST_INCLUDE });
    return toDto(row);
  }

  // ── helpers ──────────────────────────────────────────────

  /**
   * 只限 system_admin。RolesGuard 會讓 admin 也通過任何 @Roles，所以在這裡明確檢查。
   */
  private assertSystemAdmin(actor: AuthenticatedUser) {
    if (actor.role !== 'system_admin') {
      throw new AppError('PERMISSION_DENIED', '只有系統管理員可以刪除交易紀錄', 403);
    }
  }

  private async loadDeletable(id: number) {
    const txn = await this.prisma.customerTransaction.findUnique({
      where: { id },
      include: { serviceRecord: true, logs: { where: { action: 'create' } } },
    });
    if (!txn) throw new AppError('TRANSACTION_NOT_FOUND', undefined, 404);
    if (txn.deletedAt) throw new AppError('TRANSACTION_ALREADY_DELETED', undefined, 409);
    if (txn.legacy) throw new AppError('TRANSACTION_LEGACY', undefined, 422);
    return txn;
  }

  /**
   * 反向抵銷一筆交易的所有效果。dryRun=true 時只計算不寫入（呼叫端在 transaction 裡，
   * 這裡也只讀不寫，計算邏輯與正式刪除共用同一份，預覽與實際結果一定一致）。
   */
  private async reverse(
    tx: Prisma.TransactionClient,
    txn: Awaited<ReturnType<CustomerTransactionsService['loadDeletable']>>,
    operatorId: number,
    dryRun: boolean,
  ): Promise<ReversalSummary> {
    const summary: ReversalSummary = { income: 0, expense: 0, pettyCash: 0, walletBalance: 0, walletBonus: 0, sessionsVoided: 0, sessionsRestored: 0 };

    // 1) 方案產生的課程：作廢。已經用掉堂數就不能刪（否則顧客已享受的服務會憑空消失）
    const courses = await tx.customerCourse.findMany({ where: { transactionId: txn.id, voidedAt: null } });
    for (const c of courses) {
      if (c.usedSessions > 0) {
        throw new AppError('TRANSACTION_COURSE_USED', `此方案的課程已使用 ${c.usedSessions} 堂，無法刪除`, 422);
      }
      summary.sessionsVoided += c.totalSessions;
    }

    // 2) 錢包異動：儲值 → 扣回；扣款 → 退回
    const walletLogs = await tx.walletLog.findMany({ where: { transactionId: txn.id } });
    let balanceDelta = 0;
    let bonusDelta = 0;
    for (const w of walletLogs) {
      const sign = w.type === 'top_up' ? -1 : 1;
      balanceDelta += sign * w.amount;
      bonusDelta += sign * w.bonusAmount;
    }
    summary.walletBalance = balanceDelta;
    summary.walletBonus = bonusDelta;
    if (balanceDelta !== 0 || bonusDelta !== 0) {
      const wallet = await tx.customerWallet.findUnique({ where: { customerId: txn.customerId } });
      const balance = wallet?.balance ?? 0;
      const bonus = wallet?.bonusBalance ?? 0;
      if (balance + balanceDelta < 0 || bonus + bonusDelta < 0) {
        throw new AppError(
          'TRANSACTION_WALLET_INSUFFICIENT',
          `顧客儲值金已被使用，餘額不足以扣回（本金 $${balance}、贈送 $${bonus}）`,
          422,
        );
      }
    }

    // 3) 財務紀錄：標記刪除；收入的現金從備用金扣回，支出（退費）的現金加回備用金
    const finRecords = await tx.financialRecord.findMany({ where: { transactionId: txn.id, deletedAt: null } });
    for (const f of finRecords) {
      if (f.type === 'income') {
        summary.income -= f.amount;
        if (f.paymentMethod === 'cash') summary.pettyCash -= f.amount;
      } else {
        summary.expense -= f.amount;
        if (f.paymentMethod === 'cash') summary.pettyCash += f.amount;
      }
    }

    // 4) 把扣掉 / 退掉的堂數加回原本的課程：POS 扣堂（可能跨多份）、課程退費 / 轉儲值
    const effects = ((txn.logs[0]?.detail ?? {}) as { effects?: TransactionEffects }).effects;
    let restores: Array<{ customerCourseId: number; sessions: number }> = [];
    if (txn.serviceRecord?.consumptionType === 'course_deduction' && !txn.serviceRecord.isRolledBack) {
      restores = deductionsOf(effects);
      if (!restores.length) throw new AppError('TRANSACTION_LEGACY', '找不到當初扣堂的課程，無法自動回溯', 422);
    }
    if (effects?.courseRefund) restores = [...restores, effects.courseRefund];
    summary.sessionsRestored = restores.reduce((s, r) => s + r.sessions, 0);

    if (dryRun) return summary;

    if (courses.length) {
      await tx.customerCourse.updateMany({ where: { id: { in: courses.map((c) => c.id) } }, data: { voidedAt: new Date() } });
    }
    if (balanceDelta !== 0 || bonusDelta !== 0) {
      await tx.customerWallet.update({
        where: { customerId: txn.customerId },
        data: { balance: { increment: balanceDelta }, bonusBalance: { increment: bonusDelta } },
      });
      // 補一筆反向的錢包異動，讓錢包明細也看得到這次回溯
      await tx.walletLog.create({
        data: {
          customerId: txn.customerId,
          storeId: txn.storeId,
          type: balanceDelta + bonusDelta < 0 ? 'deduction' : 'top_up',
          amount: Math.abs(balanceDelta),
          bonusAmount: Math.abs(bonusDelta),
          performedById: operatorId,
          note: `系統管理員刪除交易 #${txn.id}（回溯）`,
          transactionId: txn.id,
        },
      });
    }
    if (finRecords.length) {
      await tx.financialRecord.updateMany({ where: { id: { in: finRecords.map((f) => f.id) } }, data: { deletedAt: new Date() } });
    }
    if (summary.pettyCash !== 0) {
      await tx.store.update({ where: { id: txn.storeId }, data: { pettyCashBalance: { increment: summary.pettyCash } } });
    }
    for (const r of restores) {
      await tx.customerCourse.update({
        where: { id: r.customerCourseId },
        data: { usedSessions: { decrement: r.sessions } },
      });
    }
    if (txn.serviceRecord && !txn.serviceRecord.isRolledBack) {
      // 標記為已還原：業績、日報、外包待付都會排除
      await tx.serviceRecord.update({
        where: { id: txn.serviceRecord.id },
        data: { isRolledBack: true, rolledBackAt: new Date(), rollbackOperatorId: operatorId },
      });
    }
    return summary;
  }
}

function toDto(t: TxnRow) {
  return {
    id: t.id,
    kind: t.kind,
    amount: t.amount,
    listAmount: t.listAmount,
    paymentMethod: t.paymentMethod,
    payments: t.payments as Array<{ method: string; amount: number }> | null,
    adjustNote: t.adjustNote,
    note: t.note,
    planOriginal: t.planOriginal,
    planActual: t.planActual,
    legacy: t.legacy,
    service: t.serviceRecord
      ? {
          consumptionType: t.serviceRecord.consumptionType,
          sessionsDeducted: t.serviceRecord.sessionsDeducted,
          serviceItem: t.serviceRecord.serviceItem,
        }
      : null,
    staff: t.staff,
    createdAt: t.createdAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString() ?? null,
    deletedBy: t.deletedBy,
    deleteReason: t.deleteReason,
    logs: t.logs.map((l) => ({
      id: l.id,
      action: l.action,
      operator: l.operator,
      reason: l.reason,
      detail: l.detail,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}
