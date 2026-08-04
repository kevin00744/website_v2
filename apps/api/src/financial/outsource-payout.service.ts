import { Injectable } from '@nestjs/common';
import type { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

@Injectable()
export class OutsourcePayoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 外包給付：
   * 1. 驗證 ServiceRecord 存在且屬於該分店
   * 2. 驗證該紀錄的 serviceItem.isOutsourced === true
   * 3. 以 serviceItem.outsourceCost 作為給付金額
   * 4. 建立 FinancialRecord (outsource_payout / expense)
   * 5. 在同一 Transaction 內扣除 Store.pettyCashBalance
   */
  async createPayout(
    actor: AuthenticatedUser,
    storeId: number,
    input: { serviceRecordId: number; note?: string },
  ) {
    // 角色守門：只有 manager / admin 能給付（不開放 staff）
    if (!isAdminRole(actor.role) && actor.role !== 'manager') {
      throw new AppError('PERMISSION_DENIED', '只有店長或管理員可以操作外包給付', 403);
    }
    if (actor.role === 'manager' && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能操作自己所屬分店的給付', 403);
    }

    const serviceRecord = await this.prisma.serviceRecord.findFirst({
      where: { id: input.serviceRecordId, storeId },
      include: { serviceItem: true, staff: { select: { name: true } } },
    });
    if (!serviceRecord) {
      throw new AppError('SERVICE_RECORD_NOT_FOUND', '找不到此服務紀錄', 404);
    }
    if (!serviceRecord.serviceItem.isOutsourced) {
      throw new AppError('OUTSOURCE_PAYOUT_NOT_APPLICABLE', '此服務項目不是外包項目，無法進行外包給付', 422);
    }
    const amount = serviceRecord.serviceItem.outsourceCost;
    if (!amount || amount <= 0) {
      throw new AppError('OUTSOURCE_PAYOUT_NO_COST', '此外包項目未設定外包成本，請先至服務品項管理補填', 422);
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    if (store.pettyCashBalance < amount) {
      throw new AppError('PETTY_CASH_INSUFFICIENT', `備用金不足（目前 $${store.pettyCashBalance}，需 $${amount}）`, 422);
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.financialRecord.create({
        data: {
          storeId,
          type: 'expense',
          category: 'outsource_payout',
          amount,
          paymentMethod: 'cash' as PaymentMethod,
          performedById: actor.id,
          description: input.note ?? `外包給付：${serviceRecord.serviceItem.name}（服務紀錄 #${serviceRecord.id}）`,
        },
        include: { performedBy: { select: { id: true, name: true } } },
      });
      await Promise.all([
        tx.store.update({
          where: { id: storeId },
          data: { pettyCashBalance: { decrement: amount } },
        }),
        // 標記服務紀錄外包費用已給付
        tx.serviceRecord.update({
          where: { id: input.serviceRecordId },
          data: { outsourcePaidAt: new Date() },
        }),
      ]);
      return {
        financialRecordId: record.id,
        amount,
        serviceItemName: serviceRecord.serviceItem.name,
        staffName: serviceRecord.staff.name,
        pettyCashBalanceAfter: store.pettyCashBalance - amount,
      };
    });
  }
}
