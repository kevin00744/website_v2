import { Injectable } from '@nestjs/common';
import type { ConsumptionType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

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

    if (dto.consumptionType === 'single_purchase' && (!dto.amountPaid || dto.amountPaid <= 0)) {
      throw new AppError('SERVICE_RECORD_MISSING_AMOUNT', '單次消費需填入實付金額', 422);
    }

    // 單次消費實付金額必須等於服務品項定價
    if (dto.consumptionType === 'single_purchase' && dto.amountPaid) {
      const item = await this.prisma.serviceItem.findUnique({ where: { id: dto.serviceItemId }, select: { price: true } });
      if (item && dto.amountPaid !== item.price) {
        throw new AppError(
          'AMOUNT_PRICE_MISMATCH',
          `實付金額 $${dto.amountPaid} 與服務品項定價 $${item.price} 不符，無法結帳`,
          422,
        );
      }
    }

    if (dto.consumptionType === 'wallet_deduction' && (!dto.amountPaid || dto.amountPaid <= 0)) {
      throw new AppError('SERVICE_RECORD_MISSING_AMOUNT', '儲值扣款需填入扣款金額', 422);
    }

    // ── 驗證關聯資料存在且隸屬同一分店 ────────────────────────────────────
    await this.validateEntities(actor, storeId, dto.customerId, staffId, dto.serviceItemId);

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

      switch (dto.consumptionType) {
        case 'wallet_deduction':
          await this.handleWalletDeduction(tx, storeId, dto.customerId, dto.amountPaid!, actor.id);
          // 儲值扣款不自動寫 FinancialRecord（儲值金已在儲值時記為 income）
          break;

        case 'course_deduction':
          await this.handleCourseDeduction(tx, dto.customerId, dto.serviceItemId, sessionsToDeduct, dto.customerCourseId);
          break;

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
      where: { storeId, staffId, createdAt: { gte: fromDate, lte: toDate } },
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
      where: { storeId, createdAt: { gte: todayStart } },
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
  ) {
    // 若前端指定了 courseId，直接用它（避免撿到已用盡的舊課程）；
    // 否則 fallback：依 serviceItemId 找，跳過已用盡的，取最舊的有效課程
    let course: { id: number; totalSessions: number; usedSessions: number } | null = null;

    if (customerCourseId) {
      course = await tx.customerCourse.findFirst({
        where: { id: customerCourseId, customerId },
      });
      if (!course) {
        throw new AppError('COURSE_NOT_FOUND', '找不到指定的課程紀錄', 404);
      }
    } else {
      // 找第一張還有剩餘堂數的課程（先買先用）
      const courses = await tx.customerCourse.findMany({
        where: { customerId, serviceItemId },
        orderBy: { createdAt: 'asc' },
      });
      course = courses.find((c) => c.totalSessions - c.usedSessions > 0) ?? null;
      if (!course) {
        throw new AppError('COURSE_NOT_FOUND', '找不到此顧客持有的課程', 404);
      }
    }

    const remaining = course.totalSessions - course.usedSessions;
    if (remaining < sessions) {
      throw new AppError(
        'COURSE_INSUFFICIENT',
        `課程堂數不足（剩餘 ${remaining} 堂，需扣 ${sessions} 堂）`,
        422,
      );
    }

    await tx.customerCourse.update({
      where: { id: course.id },
      data: { usedSessions: { increment: sessions } },
    });
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

    const course = await this.prisma.customerCourse.findFirst({
      where: {
        customerId: record.customerId,
        serviceItemId: record.serviceItemId,
        storeId: record.storeId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.serviceRecord.update({
        where: { id: recordId },
        data: { isRolledBack: true, rolledBackAt: now, rollbackOperatorId: actor.id },
      }),
      ...(course
        ? [
            this.prisma.customerCourse.update({
              where: { id: course.id },
              data: { usedSessions: { decrement: sessionsToRestore } },
            }),
          ]
        : []),
    ]);

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
