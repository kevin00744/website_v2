import { Injectable } from '@nestjs/common';
import { Prisma, type AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { canActorAccessCustomer, isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import { LineNotifyService } from '../line/line-notify.service';
import { normalizePhoneOrNull } from '../common/phone.util';

export interface AppointmentInput {
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string | null;
  serviceItemId?: number | null;
  staffId?: number | null;
  startAt?: string;
  endAt?: string;
  status?: AppointmentStatus;
  note?: string | null;
  /** 設 true 時略過「同一服務人員時段重疊」檢查（前端提示後使用者仍堅持排入） */
  allowOverlap?: boolean;
}

const STATUSES: AppointmentStatus[] = ['booked', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'];
/** 不佔用時段的狀態：取消 / 未到不列入撞期檢查 */
const INACTIVE_STATUSES: AppointmentStatus[] = ['cancelled', 'no_show'];
const MAX_RANGE_DAYS = 62;

const APPOINTMENT_SELECT = {
  id: true,
  storeId: true,
  customerId: true,
  customerName: true,
  customerPhone: true,
  serviceItemId: true,
  serviceItem: { select: { id: true, name: true, price: true } },
  staffId: true,
  staff: { select: { id: true, name: true } },
  startAt: true,
  endAt: true,
  status: true,
  source: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotify: LineNotifyService,
  ) {}

  async list(actor: AuthenticatedUser, storeId: number, from?: string, to?: string, customerId?: number) {
    this.assertStoreAccess(actor, storeId);

    const where: Prisma.AppointmentWhereInput = { storeId, deletedAt: null };
    if (customerId) {
      where.customerId = customerId;
    } else {
      const fromDate = parseDate(from, 'from');
      const toDate = parseDate(to, 'to');
      if (toDate <= fromDate) throw new AppError('APPOINTMENT_INVALID_RANGE', 'to must be after from', 400);
      if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_DAYS * 86_400_000) {
        throw new AppError('APPOINTMENT_INVALID_RANGE', 'range too large', 400);
      }
      // 與查詢區間有交集的預約都要回傳（跨日的也算）
      where.startAt = { lt: toDate };
      where.endAt = { gt: fromDate };
    }

    return this.prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SELECT,
      orderBy: customerId ? { startAt: 'desc' } : { startAt: 'asc' },
      take: customerId ? 50 : undefined,
    });
  }

  async create(actor: AuthenticatedUser, storeId: number, input: AppointmentInput) {
    this.assertStoreAccess(actor, storeId);
    const startAt = parseDate(input.startAt, 'startAt');
    const endAt = parseDate(input.endAt, 'endAt');
    this.assertTimeRange(startAt, endAt);

    const snapshot = await this.resolveCustomer(actor, storeId, input.customerId ?? null, input.customerName, input.customerPhone);
    await this.assertServiceItem(storeId, input.serviceItemId ?? null);
    await this.assertStaff(storeId, input.staffId ?? null);
    if (!input.allowOverlap) await this.assertNoOverlap(storeId, input.staffId ?? null, startAt, endAt);

    const status = input.status ?? 'booked';
    if (!STATUSES.includes(status)) throw new AppError('APPOINTMENT_INVALID_STATUS', undefined, 400);

    return this.prisma.appointment.create({
      data: {
        storeId,
        customerId: snapshot.customerId,
        customerName: snapshot.customerName,
        customerPhone: snapshot.customerPhone,
        serviceItemId: input.serviceItemId ?? null,
        staffId: input.staffId ?? null,
        startAt,
        endAt,
        status,
        note: input.note?.trim() || null,
        createdById: actor.id,
      },
      select: APPOINTMENT_SELECT,
    });
  }

  async update(actor: AuthenticatedUser, storeId: number, id: number, input: AppointmentInput) {
    this.assertStoreAccess(actor, storeId);
    const existing = await this.prisma.appointment.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!existing) throw new AppError('APPOINTMENT_NOT_FOUND', undefined, 404);

    const startAt = input.startAt !== undefined ? parseDate(input.startAt, 'startAt') : existing.startAt;
    const endAt = input.endAt !== undefined ? parseDate(input.endAt, 'endAt') : existing.endAt;
    this.assertTimeRange(startAt, endAt);

    const data: Prisma.AppointmentUncheckedUpdateInput = {};
    if (input.startAt !== undefined) data.startAt = startAt;
    if (input.endAt !== undefined) data.endAt = endAt;

    if (input.customerId !== undefined || input.customerName !== undefined || input.customerPhone !== undefined) {
      const customerId = input.customerId !== undefined ? input.customerId : existing.customerId;
      const snapshot = await this.resolveCustomer(
        actor,
        storeId,
        customerId,
        input.customerName ?? existing.customerName,
        input.customerPhone !== undefined ? input.customerPhone : existing.customerPhone,
      );
      Object.assign(data, snapshot);
    }
    if (input.serviceItemId !== undefined) {
      await this.assertServiceItem(storeId, input.serviceItemId);
      data.serviceItemId = input.serviceItemId;
    }
    if (input.staffId !== undefined) {
      await this.assertStaff(storeId, input.staffId);
      data.staffId = input.staffId;
    }
    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status)) throw new AppError('APPOINTMENT_INVALID_STATUS', undefined, 400);
      data.status = input.status;
    }
    if (input.note !== undefined) data.note = input.note?.trim() || null;

    const finalStatus = (data.status as AppointmentStatus | undefined) ?? existing.status;
    const timeOrStaffChanged = input.startAt !== undefined || input.endAt !== undefined || input.staffId !== undefined;
    if (!input.allowOverlap && timeOrStaffChanged && !INACTIVE_STATUSES.includes(finalStatus)) {
      const staffId = input.staffId !== undefined ? input.staffId : existing.staffId;
      await this.assertNoOverlap(storeId, staffId, startAt, endAt, id);
    }

    const updated = await this.prisma.appointment.update({ where: { id }, data, select: APPOINTMENT_SELECT });

    // LINE 來源的預約：狀態改為已確認 / 已取消時通知顧客（失敗不影響更新結果）
    if (updated.source === 'line' && updated.status !== existing.status) {
      await this.lineNotify.notifyAppointmentStatus(id, updated.status).catch(() => undefined);
    }
    return updated;
  }

  async remove(actor: AuthenticatedUser, storeId: number, id: number) {
    this.assertStoreAccess(actor, storeId);
    const existing = await this.prisma.appointment.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!existing) throw new AppError('APPOINTMENT_NOT_FOUND', undefined, 404);
    await this.prisma.appointment.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── helpers ──────────────────────────────────────────────

  private assertStoreAccess(actor: AuthenticatedUser, storeId: number) {
    if (isAdminRole(actor.role)) return;
    if ((actor.role === 'manager' || actor.role === 'staff') && actor.storeId === storeId) return;
    throw new AppError('PERMISSION_DENIED', '只能管理自己所屬分店的預約', 403);
  }

  private assertTimeRange(startAt: Date, endAt: Date) {
    if (endAt <= startAt) throw new AppError('APPOINTMENT_INVALID_TIME', undefined, 400);
    if (endAt.getTime() - startAt.getTime() > 12 * 3_600_000) {
      throw new AppError('APPOINTMENT_INVALID_TIME', 'appointment longer than 12h', 400);
    }
  }

  /** 已建檔顧客：一律以顧客資料覆寫姓名/電話快照；新客：姓名必填 */
  private async resolveCustomer(
    actor: AuthenticatedUser,
    storeId: number,
    customerId: number | null,
    customerName?: string,
    customerPhone?: string | null,
  ) {
    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, name: true, phone: true, storeId: true },
      });
      if (!customer || customer.storeId !== storeId || !canActorAccessCustomer(actor, customer)) {
        throw new AppError('CUSTOMER_NOT_FOUND', undefined, 404);
      }
      return { customerId: customer.id, customerName: customer.name, customerPhone: customer.phone };
    }
    const name = customerName?.trim();
    if (!name) throw new AppError('APPOINTMENT_CUSTOMER_REQUIRED', undefined, 400);
    return { customerId: null, customerName: name, customerPhone: normalizePhoneOrNull(customerPhone) };
  }

  private async assertServiceItem(storeId: number, serviceItemId: number | null) {
    if (!serviceItemId) return;
    const item = await this.prisma.serviceItem.findFirst({
      where: { id: serviceItemId, deletedAt: null, OR: [{ storeId: null }, { storeId }] },
    });
    if (!item) throw new AppError('SERVICE_ITEM_NOT_FOUND', undefined, 404);
  }

  private async assertStaff(storeId: number, staffId: number | null) {
    if (!staffId) return;
    const staff = await this.prisma.user.findFirst({
      where: { id: staffId, storeId, deletedAt: null, isActive: true },
    });
    if (!staff) throw new AppError('APPOINTMENT_STAFF_NOT_FOUND', undefined, 404);
  }

  private async assertNoOverlap(storeId: number, staffId: number | null, startAt: Date, endAt: Date, excludeId?: number) {
    if (!staffId) return;
    const clash = await this.prisma.appointment.findFirst({
      where: {
        storeId,
        staffId,
        deletedAt: null,
        status: { notIn: INACTIVE_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new AppError('APPOINTMENT_STAFF_CONFLICT', undefined, 409);
  }
}

function parseDate(value: string | undefined, field: string): Date {
  const date = value ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new AppError('APPOINTMENT_INVALID_TIME', `invalid ${field}`, 400);
  return date;
}
