import { Injectable } from '@nestjs/common';
import type { PettyCashActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

export interface AdjustPettyCashDto {
  action: 'add' | 'remove';
  amount: number;
  note?: string;
}

@Injectable()
export class PettyCashService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManagerAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    if (actor.role !== 'manager') throw new AppError('PERMISSION_DENIED', '需要店長或管理員權限', 403);
    if (actor.storeId !== storeId) throw new AppError('PERMISSION_DENIED', '只能管理自己的分店', 403);
  }

  private assertStoreAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    if (actor.storeId !== storeId) throw new AppError('PERMISSION_DENIED', '無此分店存取權限', 403);
  }

  async getBalance(actor: AuthenticatedUser, storeId: number) {
    this.assertStoreAccess(actor, storeId);
    const store = await this.prisma.store.findUnique({
      where: { id: storeId, deletedAt: null },
      select: { id: true, name: true, pettyCashBalance: true },
    });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    return { storeId: store.id, storeName: store.name, balance: store.pettyCashBalance };
  }

  async listLogs(actor: AuthenticatedUser, storeId: number, from?: string, to?: string) {
    this.assertStoreAccess(actor, storeId);
    const fromDate = from ? (() => { const d = new Date(from); d.setHours(0,0,0,0); return d; })()
      : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    const toDate = to ? (() => { const d = new Date(to); d.setHours(23,59,59,999); return d; })() : new Date();

    return this.prisma.pettyCashLog.findMany({
      where: { storeId, createdAt: { gte: fromDate, lte: toDate } },
      include: { performedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async adjust(actor: AuthenticatedUser, storeId: number, dto: AdjustPettyCashDto) {
    this.assertManagerAccess(actor, storeId);
    if (!Number.isInteger(dto.amount) || dto.amount <= 0) {
      throw new AppError('INVALID_AMOUNT', '金額必須為正整數', 400);
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });

      if (dto.action === 'remove' && store.pettyCashBalance < dto.amount) {
        throw new AppError(
          'PETTY_CASH_INSUFFICIENT',
          `備用金餘額不足（目前 $${store.pettyCashBalance}，需移除 $${dto.amount}）`,
          422,
        );
      }

      const balanceAfter = dto.action === 'add'
        ? store.pettyCashBalance + dto.amount
        : store.pettyCashBalance - dto.amount;

      const [log] = await Promise.all([
        tx.pettyCashLog.create({
          data: {
            storeId,
            action: dto.action as PettyCashActionType,
            amount: dto.amount,
            balanceAfter,
            note: dto.note ?? null,
            performedById: actor.id,
          },
          include: { performedBy: { select: { id: true, name: true } } },
        }),
        tx.store.update({
          where: { id: storeId },
          data: { pettyCashBalance: balanceAfter },
        }),
      ]);

      return { ...log, balanceAfter };
    });
  }

  /** 內部方法：由 FinancialService 呼叫，在 transaction 內寫入扣款 log */
  async writeDeductLog(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    storeId: number,
    performedById: number,
    action: 'outsource_deduct' | 'expense_deduct',
    amount: number,
    currentBalance: number,
    note?: string,
  ) {
    const balanceAfter = currentBalance - amount;
    return tx.pettyCashLog.create({
      data: { storeId, action, amount, balanceAfter, note: note ?? null, performedById },
    });
  }
}
