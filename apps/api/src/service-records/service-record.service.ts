import { Injectable } from '@nestjs/common';
import type { ConsumptionType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import { createLedgerEntry, deductionsOf, effectsOf, recordEffects } from '../customer-transactions/transaction-ledger';

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
}

export interface CreateServiceRecordDto {
  customerId: number;
  staffId?: number;
  serviceItemId: number;
  consumptionType: ConsumptionType;
  amountPaid?: number;
  /** 單一付款方式（向後相容）；若同時有 payments 陣列則 payments 優先 */
  paymentMethod?: PaymentMethod;
  /** 複合付款：多種付款方式組合，總和必須等於 amountPaid（或 serviceItem.price） */
  payments?: PaymentEntry[];
  sessionsDeducted?: number;
  customerSignatureUrl?: string;
  note?: string;
  /** course_deduction 時指定要扣的 CustomerCourse id，避免撿到已用盡的舊課程 */
  customerCourseId?: number;
  /** 結帳時調整金額的備註（選填），例如「9 折」「折價券 −$200」 */
  adjustNote?: string;
}

/** 服務紀錄明細（回傳給前端） */
export interface ServiceRecordDetail {
  id: number;
  customer: { id: number; name: string };
  staff: { id: number; name: string };
  serviceItem: { id: number; name: string; price: number };
  storeId: number;
  consumptionType: ConsumptionType;
  amountPaid: number | null;
  sessionsDeducted: number | null;
  customerSignatureUrl: string | null;
  note: string | null;
  createdAt: string;
}

@Injectable()
export class ServiceRecordService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POS 結帳核心。整個流程在單一 Prisma Transaction 內完成，確保：
   * - 扣款/扣堂 + 寫入帳本 + 寫入 ServiceRecord 原子性
   * - 不會出現「扣了錢但沒有紀錄」或「有紀錄但沒扣錢」的不一致狀態
   */
  async createServiceRecord(actor: AuthenticatedUser, storeId: number, dto: CreateServiceRecordDto): Promise<ServiceRecordDetail> {
    // ── 前置驗證（在 transaction 外做，減少鎖持有時間）──────────────────────
    const staffId = dto.staffId ?? actor.id;
    const sessionsToDeduct = dto.sessionsDeducted ?? 1;

    if (dto.consumptionType !== 'single_purchase' && !dto.customerSignatureUrl) {
      throw new AppError('MISSING_SIGNATURE', '儲值扣款或課程扣堂需要顧客簽名確認', 422);
    }

    // 單次消費：實付金額可以和定價不同（結帳時打折 / 折價券），差異記在交易歷程；只要求 ≥ 0 的整數
    if (
      dto.consumptionType === 'single_purchase' &&
      (dto.amountPaid == null || !Number.isInteger(dto.amountPaid) || dto.amountPaid < 0)
    ) {
      throw new AppError('SERVICE_RECORD_MISSING_AMOUNT', '單次消費需填入實付金額', 422);
    }

    if (dto.consumptionType === 'wallet_deduction' && (!dto.amountPaid || !Number.isInteger(dto.amountPaid) || dto.amountPaid <= 0)) {
      throw new AppError('SERVICE_RECORD_MISSING_AMOUNT', '儲值扣款需填入扣款金額', 422);
    }

    // ── 驗證關聯資料存在且隸屬同一分店 ────────────────────────────────────
    const serviceItem = await this.validateEntities(actor, storeId, dto.customerId, staffId, dto.serviceItemId);

    // ── Transaction：扣款 + 帳本 + ServiceRecord ────────────────────────────
    return this.prisma.$transaction(async (tx) => {
      // 標準化 payments（在 transaction 外已驗證）
      const normalizedPayments: PaymentEntry[] | null =
        dto.consumptionType === 'single_purchase'
          ? (dto.payments?.length
              ? dto.payments
              : dto.paymentMethod
                ? [{ method: dto.paymentMethod, amount: dto.amountPaid! }]
                : null)
          : null;

      const serviceRecordData: Prisma.ServiceRecordCreateInput = {
        customer: { connect: { id: dto.customerId } },
        store: { connect: { id: storeId } },
        staff: { connect: { id: staffId } },
        serviceItem: { connect: { id: dto.serviceItemId } },
        consumptionType: dto.consumptionType,
        amountPaid: dto.amountPaid ?? null,
        payments: normalizedPayments ? (normalizedPayments as unknown as Prisma.InputJsonValue) : undefined,
        sessionsDeducted: dto.consumptionType === 'course_deduction' ? sessionsToDeduct : null,
        customerSignatureUrl: dto.customerSignatureUrl ?? null,
        signatureAt: dto.customerSignatureUrl ? new Date() : null,
        note: dto.note ?? null,
      };

      // 交易主表：扣堂不涉及金額（0），其餘記下原價（品項定價）與實收 / 實扣
      const isCourse = dto.consumptionType === 'course_deduction';
      const ledger = await createLedgerEntry(tx, {
        storeId,
        customerId: dto.customerId,
        staffId,
        operatorId: actor.id,
        kind: 'service',
        amount: isCourse ? 0 : dto.amountPaid!,
        listAmount: isCourse ? 0 : serviceItem.price,
        paymentMethod: normalizedPayments?.length === 1 ? normalizedPayments[0].method : null,
        payments: normalizedPayments,
        adjustNote: isCourse ? null : dto.adjustNote,
        note: dto.note,
      });

      switch (dto.consumptionType) {
        case 'wallet_deduction':
          await this.handleWalletDeduction(tx, storeId, dto.customerId, dto.amountPaid!, actor.id, ledger.id);
          // 儲值扣款不自動寫 FinancialRecord（儲值金已在儲值時記為 income）
          break;

        case 'course_deduction': {
          const deductions = await this.handleCourseDeduction(tx, dto.customerId, dto.serviceItemId, sessionsToDeduct, dto.customerCourseId);
          await recordEffects(tx, ledger.id, { courseDeductions: deductions });
          break;
        }

        case 'single_purchase': {
          const payments = normalizedPayments ?? [];

          // 複合付款：驗證總和與 amountPaid 一致
          if (payments.length > 1) {
            const total = payments.reduce((s, p) => s + p.amount, 0);
            if (total !== dto.amountPaid) {
              throw new AppError('SPLIT_PAYMENT_MISMATCH', `付款總和 $${total} 與實付金額 $${dto.amountPaid} 不符`, 422);
            }
          }

          // 為每筆付款建立 FinancialRecord，現金部分連動 pettyCashBalance
          let cashTotal = 0;
          for (const payment of payments) {
            await tx.financialRecord.create({
              data: {
                storeId,
                type: 'income',
                category: 'sales',
                amount: payment.amount,
                paymentMethod: payment.method,
                performedById: actor.id,
                description: `POS 收款（服務項目 #${dto.serviceItemId}，顧客 #${dto.customerId}）`,
                transactionId: ledger.id,
              },
            });
            if (payment.method === 'cash') cashTotal += payment.amount;
          }
          if (cashTotal > 0) {
            await tx.store.update({
              where: { id: storeId },
              data: { pettyCashBalance: { increment: cashTotal } },
            });
          }
          break;
        }
      }

      const record = await tx.serviceRecord.create({
        data: serviceRecordData,
        include: {
          customer: { select: { id: true, name: true } },
          staff: { select: { id: true, name: true } },
          serviceItem: { select: { id: true, name: true, price: true } },
        },
      });
      await tx.customerTransaction.update({ where: { id: ledger.id }, data: { serviceRecordId: record.id } });

      return this.toDto(record);
    });
  }

  /** 列出顧客的服務紀錄（店長/admin 可查，staff 只能查自己服務的） */
  async listByCustomer(actor: AuthenticatedUser, storeId: number, customerId: number): Promise<ServiceRecordDetail[]> {
    this.assertStoreAccess(actor, storeId);

    const where: Prisma.ServiceRecordWhereInput = { customerId, storeId };
    // staff 只能看自己服務的紀錄
    if (actor.role === 'staff') where.staffId = actor.id;

    const records = await this.prisma.serviceRecord.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        serviceItem: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return records.map((r) => this.toDto(r));
  }

  /** 依員工 ID 查詢其在分店的服務紀錄（manager 用，含日期範圍篩選） */
  async listByStaff(
    actor: AuthenticatedUser,
    storeId: number,
    staffId: number,
    from?: string,
    to?: string,
  ): Promise<ServiceRecordDetail[]> {
    if ((actor.role === 'manager' || actor.role === 'accountant') && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能查看自己所屬分店的資料', 403);
    }
    const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    const toDate = to ? new Date(to) : new Date();

    const records = await this.prisma.serviceRecord.findMany({
      // 已還原 / 已刪除的結帳不列入業績
      where: { storeId, staffId, isRolledBack: false, createdAt: { gte: fromDate, lte: toDate } },
      include: {
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        serviceItem: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toDto(r));
  }

  /** 當日分店服務結帳列表（店長用） */
  async listDaily(actor: AuthenticatedUser, storeId: number): Promise<ServiceRecordDetail[]> {
    this.assertStoreAccess(actor, storeId);
    if (actor.role === 'staff') throw new AppError('PERMISSION_DENIED', '無此操作權限', 403);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const records = await this.prisma.serviceRecord.findMany({
      where: { storeId, isRolledBack: false, createdAt: { gte: todayStart } },
      include: {
        customer: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        serviceItem: { select: { id: true, name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDto(r));
  }

  // ─── Private: 扣款邏輯 ────────────────────────────────────────────────────

  private async handleWalletDeduction(
    tx: Prisma.TransactionClient,
    storeId: number,
    customerId: number,
    amount: number,
    performedById: number,
    transactionId: number,
  ) {
    const wallet = await tx.customerWallet.findUnique({ where: { customerId } });
    if (!wallet) throw new AppError('WALLET_NOT_FOUND', '找不到顧客的儲值錢包', 404);

    const totalBalance = wallet.balance + wallet.bonusBalance;
    if (totalBalance < amount) {
      throw new AppError(
        'WALLET_INSUFFICIENT',
        `儲值金餘額不足（本金 $${wallet.balance}，贈點 $${wallet.bonusBalance}，合計 $${totalBalance}，需 $${amount}）`,
        422,
      );
    }

    // 優先扣本金，本金不足再扣贈送金
    let balanceDeduct = 0;
    let bonusDeduct = 0;
    if (wallet.balance >= amount) {
      balanceDeduct = amount;
    } else {
      balanceDeduct = wallet.balance;
      bonusDeduct = amount - wallet.balance;
    }

    await Promise.all([
      tx.customerWallet.update({
        where: { customerId },
        data: {
          balance: { decrement: balanceDeduct },
          bonusBalance: { decrement: bonusDeduct },
        },
      }),
      tx.walletLog.create({
        data: {
          customerId,
          storeId,
          type: 'deduction',
          amount: balanceDeduct,
          bonusAmount: bonusDeduct,
          performedById,
          note: 'POS 消費扣款',
          transactionId,
        },
      }),
    ]);
  }

  private async handleCourseDeduction(
    tx: Prisma.TransactionClient,
    customerId: number,
    serviceItemId: number,
    sessions: number,
    customerCourseId?: number,
  ): Promise<Array<{ customerCourseId: number; sessions: number }>> {
    // 指定了 courseId：只扣那一份。否則「先買先用」：同品項的課程依購買時間由舊到新，
    // 舊的扣完不足的部分自動接續扣下一份（例：舊的剩 1、一次扣 3 → 舊的扣 1、新的扣 2）。
    let courses: Array<{ id: number; totalSessions: number; usedSessions: number }>;
    if (customerCourseId) {
      const one = await tx.customerCourse.findFirst({
        where: { id: customerCourseId, customerId, voidedAt: null },
      });
      if (!one) throw new AppError('COURSE_NOT_FOUND', '找不到指定的課程紀錄', 404);
      courses = [one];
    } else {
      courses = await tx.customerCourse.findMany({
        where: { customerId, serviceItemId, voidedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (courses.length === 0) throw new AppError('COURSE_NOT_FOUND', '找不到此顧客持有的課程', 404);
    }

    const totalRemaining = courses.reduce((s, c) => s + Math.max(0, c.totalSessions - c.usedSessions), 0);
    if (totalRemaining < sessions) {
      throw new AppError(
        'COURSE_INSUFFICIENT',
        `課程堂數不足（剩餘 ${totalRemaining} 堂，需扣 ${sessions} 堂）`,
        422,
      );
    }

    const deductions: Array<{ customerCourseId: number; sessions: number }> = [];
    let left = sessions;
    for (const c of courses) {
      if (left === 0) break;
      const take = Math.min(left, Math.max(0, c.totalSessions - c.usedSessions));
      if (take === 0) continue;
      await tx.customerCourse.update({ where: { id: c.id }, data: { usedSessions: { increment: take } } });
      deductions.push({ customerCourseId: c.id, sessions: take });
      left -= take;
    }
    return deductions;
  }

  // ─── Private: 前置驗證 ────────────────────────────────────────────────────

  private async validateEntities(
    actor: AuthenticatedUser,
    storeId: number,
    customerId: number,
    staffId: number,
    serviceItemId: number,
  ) {
    this.assertStoreAccess(actor, storeId);

    const [customer, staff, serviceItem] = await Promise.all([
      this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } }),
      this.prisma.user.findFirst({ where: { id: staffId, deletedAt: null, isActive: true } }),
      this.prisma.serviceItem.findFirst({ where: { id: serviceItemId, deletedAt: null, isActive: true } }),
    ]);

    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);
    if (customer.storeId !== storeId) throw new AppError('STORE_MISMATCH', '顧客不屬於此分店', 422);

    if (!staff) throw new AppError('USER_NOT_FOUND', '找不到服務人員帳號', 404);
    // staff 必須屬於同一分店（admin/dealer 不受限）
    if (!isAdminRole(staff.role) && staff.role !== 'dealer' && staff.storeId !== storeId) {
      throw new AppError('STORE_MISMATCH', '指定的服務人員不屬於此分店', 422);
    }

    if (!serviceItem) throw new AppError('SERVICE_ITEM_NOT_FOUND', '找不到此服務項目', 404);
    // 服務項目必須屬於同一分店或為全域項目（storeId = null）
    if (serviceItem.storeId !== null && serviceItem.storeId !== storeId) {
      throw new AppError('STORE_MISMATCH', '此服務項目不屬於此分店', 422);
    }
    return serviceItem;
  }

  private assertStoreAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    if (actor.role === 'dealer' || actor.role === 'general_agent') return; // dealer/general_agent 可跨分店查看（區域層）
    if (actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '您只能操作所屬分店的資料', 403);
    }
  }

  private toDto(r: {
    id: number;
    customer: { id: number; name: string };
    staff: { id: number; name: string };
    serviceItem: { id: number; name: string; price: number };
    storeId: number;
    consumptionType: ConsumptionType;
    amountPaid: number | null;
    sessionsDeducted: number | null;
    customerSignatureUrl: string | null;
    note: string | null;
    createdAt: Date;
  }): ServiceRecordDetail {
    return {
      id: r.id,
      customer: r.customer,
      staff: r.staff,
      serviceItem: r.serviceItem,
      storeId: r.storeId,
      consumptionType: r.consumptionType,
      amountPaid: r.amountPaid,
      sessionsDeducted: r.sessionsDeducted,
      customerSignatureUrl: r.customerSignatureUrl,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /**
   * 還原課程核銷（店長專屬）：
   * 1. ServiceRecord 標記 isRolledBack
   * 2. CustomerCourse.usedSessions -= sessionsDeducted
   */
  async rollback(actor: AuthenticatedUser, recordId: number) {
    if (actor.role !== 'manager' && !isAdminRole(actor.role)) {
      throw new AppError('PERMISSION_DENIED', '只有店長或系統管理員可以還原核銷紀錄', 403);
    }

    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, consumptionType: 'course_deduction', isRolledBack: false },
    });

    if (!record) {
      throw new AppError('SERVICE_RECORD_NOT_FOUND', '找不到可還原的課程核銷紀錄', 404);
    }

    if (actor.role === 'manager' && actor.storeId !== record.storeId) {
      throw new AppError('PERMISSION_DENIED', '只能還原自己所屬分店的核銷紀錄', 403);
    }

    const sessionsToRestore = record.sessionsDeducted ?? 1;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 有交易歷程明細（先買先用、可能跨多份）就依明細還回原本那幾份課程
      const ledger = await tx.customerTransaction.findUnique({ where: { serviceRecordId: recordId } });
      const restores = ledger ? deductionsOf(await effectsOf(tx, ledger.id)) : [];

      if (restores.length === 0) {
        // 舊紀錄（沒有明細）：沿用原本做法，加回同品項最新的一份
        const course = await tx.customerCourse.findFirst({
          where: { customerId: record.customerId, serviceItemId: record.serviceItemId, storeId: record.storeId, voidedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        if (course) restores.push({ customerCourseId: course.id, sessions: sessionsToRestore });
      }

      await tx.serviceRecord.update({
        where: { id: recordId },
        data: { isRolledBack: true, rolledBackAt: now, rollbackOperatorId: actor.id },
      });
      for (const r of restores) {
        await tx.customerCourse.update({ where: { id: r.customerCourseId }, data: { usedSessions: { decrement: r.sessions } } });
      }
    });

    return { success: true, recordId, restoredSessions: sessionsToRestore, rolledBackAt: now.toISOString() };
  }

  /** 列出顧客的課程核銷紀錄（含還原狀態） */
  async listCourseDeductionsForCustomer(actor: AuthenticatedUser, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { storeId: true },
    });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);

    if (actor.role === 'manager' && actor.storeId !== customer.storeId) {
      throw new AppError('PERMISSION_DENIED', '無權限存取此顧客資料', 403);
    }

    const records = await this.prisma.serviceRecord.findMany({
      where: { customerId, consumptionType: 'course_deduction' },
      include: {
        serviceItem: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        rollbackOperator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      serviceItem: r.serviceItem,
      staff: r.staff,
      sessionsDeducted: r.sessionsDeducted,
      isRolledBack: r.isRolledBack,
      rolledBackAt: r.rolledBackAt?.toISOString() ?? null,
      rollbackOperator: r.rollbackOperator,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
