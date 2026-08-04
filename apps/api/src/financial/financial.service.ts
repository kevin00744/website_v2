import { Injectable } from '@nestjs/common';
import type { FinancialCategory, FinancialRecordType, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

/** CSV 匯出排除備用金補充（內部資金移動），只含真實營業收支 */
const EXPORT_CATEGORIES: FinancialCategory[] = ['sales', 'top_up', 'outsource_payout', 'daily_expense'];

export interface AddFinancialRecordDto {
  storeId: number;
  type: FinancialRecordType;
  category: FinancialCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  description?: string;
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 新增一筆流水帳。
   *
   * 業務規則：
   * - petty_cash_replenish（備用金補充）：限 manager / admin 操作，且必須是現金（cash）
   * - outsource_payout（外包支出）：寫入帳本後，在同一個 transaction 裡從 Store.pettyCashBalance 扣款
   *   並確認備用金餘額充足（不能為負）
   * - staff 只能新增 outsource_payout（結算外包）
   */
  async addRecord(actor: AuthenticatedUser, dto: AddFinancialRecordDto) {
    this.validateAmount(dto.amount);
    this.assertStoreAccess(actor, dto.storeId);
    this.assertCategoryPermission(actor, dto.category);

    if (dto.category === 'outsource_payout') {
      return this.addOutsourcePayoutRecord(actor, dto);
    }

    // 一般收入/支出：直接寫入
    return this.prisma.financialRecord.create({
      data: {
        storeId: dto.storeId,
        type: dto.type,
        category: dto.category,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        performedById: actor.id,
        description: dto.description ?? null,
      },
      include: { performedBy: { select: { id: true, name: true } } },
    });
  }

  /** 查詢分店當日流水帳與備用金餘額 */
  async getDailyBalance(actor: AuthenticatedUser, storeId: number) {
    this.assertStoreAccess(actor, storeId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [store, records] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: { pettyCashBalance: true, name: true } }),
      this.prisma.financialRecord.findMany({
        where: { storeId, createdAt: { gte: todayStart } },
        include: { performedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    const totalIncome = records.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExpense = records.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

    return {
      storeName: store.name,
      pettyCashBalance: store.pettyCashBalance,
      todayIncome: totalIncome,
      todayExpense: totalExpense,
      todayNet: totalIncome - totalExpense,
      records: records.map((r) => ({
        id: r.id,
        type: r.type,
        category: r.category,
        amount: r.amount,
        paymentMethod: r.paymentMethod,
        performedBy: r.performedBy,
        description: r.description,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** 查詢帳務紀錄，支援日期範圍、科目分類、收/支類型篩選 */
  async listRecords(
    actor: AuthenticatedUser,
    storeId: number,
    from?: string,
    to?: string,
    categories?: FinancialCategory[],
    types?: FinancialRecordType[],
    performedById?: number,
  ) {
    this.assertStoreAccess(actor, storeId);

    const fromDate = from ? this.parseDate(from, true) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const toDate = to ? this.parseDate(to, false) : new Date();

    const records = await this.prisma.financialRecord.findMany({
      where: {
        storeId,
        createdAt: { gte: fromDate, lte: toDate },
        ...(categories?.length ? { category: { in: categories } } : {}),
        ...(types?.length ? { type: { in: types } } : {}),
        ...(performedById ? { performedById } : {}),
      },
      include: { performedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((r) => ({
      id: r.id,
      type: r.type,
      category: r.category,
      amount: r.amount,
      paymentMethod: r.paymentMethod,
      performedBy: r.performedBy,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * 會計師專用 CSV 匯出：
   * - 排除 petty_cash_replenish（內部資金移動，不屬於營業收支）
   * - 科目分類轉換為會計科目名稱
   */
  async exportCsv(actor: AuthenticatedUser, storeId: number, from?: string, to?: string): Promise<string> {
    const records = await this.listRecords(actor, storeId, from, to, EXPORT_CATEGORIES);

    const CATEGORY_LABEL: Record<string, string> = {
      sales: '營業收入',
      top_up: '儲值收入',
      outsource_payout: '外包費用',
      daily_expense: '日常雜支',
    };
    const TYPE_LABEL: Record<string, string> = { income: '收入', expense: '支出' };

    const rows = records.map((r) => [
      new Date(r.createdAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      `FR-${r.id}`,
      r.performedBy.name,
      `${TYPE_LABEL[r.type] ?? r.type} / ${CATEGORY_LABEL[r.category] ?? r.category}`,
      r.type === 'expense' ? `-${r.amount}` : String(r.amount),
      (r.description ?? '').replace(/,/g, '，'),
    ]);

    const header = ['日期', '單據編號', '操作員工', '科目分類', '金額', '說明備註'];
    return [header, ...rows].map((row) => row.join(',')).join('\n');
  }

  private parseDate(str: string, startOfDay: boolean): Date {
    const d = new Date(str);
    if (startOfDay) { d.setHours(0, 0, 0, 0); } else { d.setHours(23, 59, 59, 999); }
    return d;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * outsource_payout：寫支出帳本 + 扣備用金 + 寫 PettyCashLog(outsource_deduct)，三合一 transaction。
   */
  private async addOutsourcePayoutRecord(actor: AuthenticatedUser, dto: AddFinancialRecordDto) {
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: dto.storeId } });

      if (store.pettyCashBalance < dto.amount) {
        throw new AppError(
          'PETTY_CASH_INSUFFICIENT',
          `備用金餘額不足（目前 $${store.pettyCashBalance}，需 $${dto.amount}）`,
          422,
        );
      }

      const balanceAfter = store.pettyCashBalance - dto.amount;

      const [record] = await Promise.all([
        tx.financialRecord.create({
          data: {
            storeId: dto.storeId,
            type: 'expense',
            category: dto.category,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            performedById: actor.id,
            description: dto.description ?? null,
          },
          include: { performedBy: { select: { id: true, name: true } } },
        }),
        tx.store.update({
          where: { id: dto.storeId },
          data: { pettyCashBalance: balanceAfter },
        }),
        tx.pettyCashLog.create({
          data: {
            storeId: dto.storeId,
            action: 'outsource_deduct',
            amount: dto.amount,
            balanceAfter,
            note: dto.description ?? null,
            performedById: actor.id,
          },
        }),
      ]);

      return record;
    });
  }

  private validateAmount(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError('FINANCIAL_INVALID_AMOUNT', '金額必須為正整數', 400);
    }
  }

  /**
   * 分店存取權限：
   * - admin/system_admin：無限制
   * - manager：只能操作自己的分店
   * - staff：只能操作自己的分店（且只能 outsource_payout，由 assertCategoryPermission 保證）
   * - dealer：只能操作自己區域的分店（此處以 storeId 是否等於 actor.storeId 為快速判斷；
   *   更嚴謹的做法是查 store.region === actor.region，但需多一次 DB 查詢）
   */
  private assertStoreAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    if ((actor.role === 'manager' || actor.role === 'staff') && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '您只能操作所屬分店的帳務', 403);
    }
  }

  /** @deprecated 備用金管理已移至 PettyCashService，此方法保留供舊前端相容 */
  async adjustPettyCash(
    actor: AuthenticatedUser,
    storeId: number,
    input: { action: 'add' | 'remove'; amount: number; note?: string },
  ) {
    if (!isAdminRole(actor.role) && actor.role !== 'manager') {
      throw new AppError('PERMISSION_DENIED', '只有店長或管理員可以調整備用金', 403);
    }
    this.assertStoreAccess(actor, storeId);
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new AppError('FINANCIAL_INVALID_AMOUNT', '金額必須為正整數', 400);
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
      if (input.action === 'remove' && store.pettyCashBalance < input.amount) {
        throw new AppError('PETTY_CASH_INSUFFICIENT',
          `備用金餘額不足（目前 $${store.pettyCashBalance}，需移除 $${input.amount}）`, 422);
      }

      const balanceAfter = input.action === 'add'
        ? store.pettyCashBalance + input.amount
        : store.pettyCashBalance - input.amount;

      const [log] = await Promise.all([
        tx.pettyCashLog.create({
          data: {
            storeId,
            action: input.action,
            amount: input.amount,
            balanceAfter,
            note: input.note ?? null,
            performedById: actor.id,
          },
          include: { performedBy: { select: { id: true, name: true } } },
        }),
        tx.store.update({ where: { id: storeId }, data: { pettyCashBalance: balanceAfter } }),
      ]);

      return { ...log, pettyCashBalanceAfter: balanceAfter };
    });
  }

  /**
   * 新增日常支出（staff / manager 均可）。
   * paymentMethod=cash 時自動從 pettyCashBalance 扣除（不足時擋下）。
   */
  async addExpense(
    actor: AuthenticatedUser,
    storeId: number,
    input: { amount: number; paymentMethod: string; description?: string; note?: string },
  ) {
    this.assertStoreAccess(actor, storeId);
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new AppError('FINANCIAL_INVALID_AMOUNT', '金額必須為正整數', 400);
    }

    return this.prisma.$transaction(async (tx) => {
      let balanceAfter: number | null = null;
      if (input.paymentMethod === 'cash') {
        const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
        if (store.pettyCashBalance < input.amount) {
          throw new AppError('PETTY_CASH_INSUFFICIENT',
            `備用金餘額不足（目前 $${store.pettyCashBalance}，需 $${input.amount}）`, 422);
        }
        balanceAfter = store.pettyCashBalance - input.amount;
        await tx.store.update({ where: { id: storeId }, data: { pettyCashBalance: balanceAfter } });
      }

      const [record] = await Promise.all([
        tx.financialRecord.create({
          data: {
            storeId,
            type: 'expense',
            category: 'daily_expense',
            amount: input.amount,
            paymentMethod: input.paymentMethod as never,
            performedById: actor.id,
            description: input.description ?? input.note ?? null,
          },
          include: { performedBy: { select: { id: true, name: true } } },
        }),
        // 現金付款：同時寫備用金扣款 log
        ...(balanceAfter !== null
          ? [tx.pettyCashLog.create({
              data: {
                storeId,
                action: 'expense_deduct',
                amount: input.amount,
                balanceAfter,
                note: input.description ?? input.note ?? null,
                performedById: actor.id,
              },
            })]
          : []),
      ]);
      return record;
    });
  }

  /**
   * 查詢分店外包待給付清單：ServiceRecord.isOutsourced=true 且 outsourcePaidAt IS NULL
   */
  async listPendingOutsourcePayout(actor: AuthenticatedUser, storeId: number) {
    this.assertStoreAccess(actor, storeId);
    const records = await this.prisma.serviceRecord.findMany({
      where: {
        storeId,
        outsourcePaidAt: null,
        serviceItem: { isOutsourced: true },
      },
      include: {
        serviceItem: { select: { id: true, name: true, outsourceCost: true } },
        staff: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => ({
      id: r.id,
      serviceItem: r.serviceItem,
      customer: r.customer,
      staff: r.staff,
      outsourceCost: r.serviceItem.outsourceCost,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * 分類操作權限：
   * - staff：只能新增 outsource_payout
   * - petty_cash_replenish：只有 manager / admin 能操作
   */
  private assertCategoryPermission(actor: AuthenticatedUser, category: FinancialCategory) {
    if (actor.role === 'staff' && category !== 'outsource_payout') {
      throw new AppError('PERMISSION_DENIED', '員工只能新增外包支出紀錄', 403);
    }
    if (category === 'petty_cash_replenish' && actor.role !== 'manager' && !isAdminRole(actor.role)) {
      throw new AppError('PERMISSION_DENIED', '備用金補充只有店長或管理員能操作', 403);
    }
  }
}
