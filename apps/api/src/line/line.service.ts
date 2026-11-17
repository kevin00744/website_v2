import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { requireLineConfig } from './line.config';
import { isValidMobile, namesMatch, normalizePhone } from './line.util';
import { phoneVariants } from '../common/phone.util';
import type { CourseSummary, WalletSummary } from './line-flex';

export interface LineProfile {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
}

export interface BindInput {
  phone?: string;
  name?: string;
  email?: string;
}

export interface LineBookingInput {
  serviceItemId?: number | null;
  staffId?: number | null;
  startAt?: string;
  note?: string | null;
}

/** LINE 預約時段設定（未設定時的預設值） */
export interface SlotSettings {
  defaultDurationMin: number;
  firstSlot: string;
  lastSlot: string;
  slotIntervalMin: number;
}

export const DEFAULT_SLOT_SETTINGS: SlotSettings = {
  defaultDurationMin: 60,
  firstSlot: '10:00',
  lastSlot: '19:30',
  slotIntervalMin: 30,
};

export interface BookingSettingsInput extends Partial<SlotSettings> {
  items?: Array<{ serviceItemId: number; durationMin: number; sortOrder?: number }>;
}

const SLOT_INTERVALS = [15, 30, 60];
/** 最多可預約多少天後 */
export const LINE_BOOKING_MAX_DAYS = 60;
/** 同一顧客同時最多幾筆待確認申請 */
export const LINE_BOOKING_MAX_PENDING = 3;

const BOUND_CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  customerCode: true,
  storeId: true,
} satisfies Prisma.CustomerSelect;

const LINE_APPOINTMENT_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  source: true,
  note: true,
  serviceItem: { select: { id: true, name: true } },
  staff: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

@Injectable()
export class LineService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 綁定 ──────────────────────────────────────────────

  /** 依 lineUserId 找已綁定（且未被刪除）的顧客；沒有回 null */
  async findBoundCustomer(lineUserId: string) {
    const account = await this.prisma.lineAccount.findUnique({
      where: { lineUserId },
      select: { customer: { select: { ...BOUND_CUSTOMER_SELECT, deletedAt: true } } },
    });
    if (!account || account.customer.deletedAt) return null;
    const { deletedAt: _deletedAt, ...customer } = account.customer;
    return customer;
  }

  async requireBoundCustomer(lineUserId: string) {
    const customer = await this.findBoundCustomer(lineUserId);
    if (!customer) throw new AppError('LINE_NOT_BOUND', undefined, 403);
    return customer;
  }

  async getMe(profile: LineProfile) {
    const customer = await this.findBoundCustomer(profile.lineUserId);
    return {
      bound: !!customer,
      displayName: profile.displayName,
      customer: customer
        ? { name: customer.name, phoneMasked: maskPhone(customer.phone), customerCode: customer.customerCode }
        : null,
    };
  }

  /**
   * 綁定流程：
   * - 手機在本店找到既有顧客 → 姓名也要一致才綁（避免只憑手機就看到別人的儲值金）
   * - 找不到 → 以 LINE Bot 系統帳號建立新顧客後綁定
   * 不一致時只回 LINE_BIND_MISMATCH，不透露該手機是否存在或對應的姓名。
   */
  async bind(profile: LineProfile, input: BindInput) {
    const config = requireLineConfig();
    const phone = normalizePhone(input.phone);
    const name = input.name?.trim() ?? '';
    if (!isValidMobile(phone)) throw new AppError('CUSTOMER_PHONE_INVALID', 'invalid mobile', 400);
    if (!name) throw new AppError('CUSTOMER_NAME_REQUIRED', undefined, 400);

    const already = await this.prisma.lineAccount.findUnique({ where: { lineUserId: profile.lineUserId } });
    if (already) {
      const bound = await this.findBoundCustomer(profile.lineUserId);
      if (bound) throw new AppError('LINE_ALREADY_BOUND', undefined, 409);
      // 綁定的顧客已被刪除 → 清掉舊綁定，允許重新綁定
      await this.prisma.lineAccount.delete({ where: { id: already.id } });
    }

    const existing = await this.findCustomerByPhone(config.storeId, phone);
    let customerId: number;
    let created = false;

    if (existing) {
      if (!namesMatch(existing.name, name)) throw new AppError('LINE_BIND_MISMATCH', 'name mismatch', 400);
      const taken = await this.prisma.lineAccount.findUnique({ where: { customerId: existing.id } });
      if (taken) throw new AppError('LINE_CUSTOMER_TAKEN', undefined, 409);
      customerId = existing.id;
    } else {
      const botUserId = await this.getBotUserId();
      const customer = await this.prisma.customer.create({
        data: {
          name,
          phone,
          email: input.email?.trim() || null,
          line: profile.displayName,
          note: 'LINE 自助建檔',
          storeId: config.storeId,
          createdBy: botUserId,
          isExosomeUser: false,
        },
        select: { id: true },
      });
      customerId = customer.id;
      created = true;
    }

    try {
      await this.prisma.lineAccount.create({
        data: {
          lineUserId: profile.lineUserId,
          customerId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('LINE_CUSTOMER_TAKEN', 'race on bind', 409);
      }
      throw err;
    }
    return { bound: true, created };
  }

  /**
   * 同店、未刪除、手機相同的顧客（最早建檔的那位）。
   * DB 的電話一律存純數字（見 common/phone.util）；另外比對 0000-000-000 寫法，
   * 涵蓋正規化 migration 之前的舊資料。
   */
  private async findCustomerByPhone(storeId: number, phone: string) {
    return this.prisma.customer.findFirst({
      where: { storeId, deletedAt: null, phone: { in: phoneVariants(phone) } },
      select: { id: true, name: true, phone: true },
      orderBy: { id: 'asc' },
    });
  }

  private async getBotUserId(): Promise<number> {
    const { botUsername } = requireLineConfig();
    const bot = await this.prisma.user.findUnique({ where: { username: botUsername }, select: { id: true } });
    if (!bot) throw new AppError('LINE_NOT_CONFIGURED', `bot user ${botUsername} missing`, 503);
    return bot.id;
  }

  // ── 查詢 ──────────────────────────────────────────────

  async getCourses(customerId: number): Promise<CourseSummary[]> {
    const courses = await this.prisma.customerCourse.findMany({
      where: { customerId, voidedAt: null },
      select: { totalSessions: true, usedSessions: true, serviceItem: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return courses
      .map((c) => ({ name: c.serviceItem.name, total: c.totalSessions, remaining: c.totalSessions - c.usedSessions }))
      .filter((c) => c.remaining > 0);
  }

  async getWallet(customerId: number): Promise<WalletSummary> {
    const [wallet, customer] = await Promise.all([
      this.prisma.customerWallet.findUnique({ where: { customerId }, select: { balance: true, bonusBalance: true } }),
      this.prisma.customer.findUnique({ where: { id: customerId }, select: { storeCredit: true } }),
    ]);
    return {
      balance: wallet?.balance ?? 0,
      bonusBalance: wallet?.bonusBalance ?? 0,
      storeCredit: customer ? Number(customer.storeCredit) : 0,
    };
  }

  async getSummary(lineUserId: string) {
    const customer = await this.requireBoundCustomer(lineUserId);
    const [courses, wallet] = await Promise.all([this.getCourses(customer.id), this.getWallet(customer.id)]);
    return { customerName: customer.name, courses, wallet };
  }

  // ── 預約 ──────────────────────────────────────────────

  async getSlotSettings(storeId: number): Promise<SlotSettings> {
    const row = await this.prisma.lineSetting.findUnique({ where: { storeId } });
    if (!row) return { ...DEFAULT_SLOT_SETTINGS };
    return {
      defaultDurationMin: row.defaultDurationMin,
      firstSlot: row.firstSlot,
      lastSlot: row.lastSlot,
      slotIntervalMin: row.slotIntervalMin,
    };
  }

  /** 已開放 LINE 預約、且仍啟用的服務項目（依排序） */
  private async listOpenItems(storeId: number) {
    const rows = await this.prisma.lineBookingItem.findMany({
      where: { serviceItem: { deletedAt: null, isActive: true, OR: [{ storeId: null }, { storeId }] } },
      select: { durationMin: true, sortOrder: true, serviceItem: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({ id: r.serviceItem.id, name: r.serviceItem.name, durationMin: r.durationMin }));
  }

  /** 可指定的服務人員：本店在職的店長與服務人員 */
  private async listBookableStaff(storeId: number) {
    return this.prisma.user.findMany({
      where: { storeId, deletedAt: null, isActive: true, role: { in: ['manager', 'staff'] } },
      select: { id: true, name: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  /** LIFF 預約頁需要的全部選項 */
  async getBookingOptions() {
    const { storeId } = requireLineConfig();
    const [items, staff, slots] = await Promise.all([
      this.listOpenItems(storeId),
      this.listBookableStaff(storeId),
      this.getSlotSettings(storeId),
    ]);
    return { items, staff, slots };
  }

  // ── 後台：LINE 預約設定 ──

  async getBookingSettings() {
    const { storeId } = requireLineConfig();
    const [serviceItems, openRows, slots] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: { deletedAt: null, isActive: true, OR: [{ storeId: null }, { storeId }] },
        select: { id: true, name: true, price: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.lineBookingItem.findMany({ select: { serviceItemId: true, durationMin: true, sortOrder: true } }),
      this.getSlotSettings(storeId),
    ]);
    const open = new Map(openRows.map((r) => [r.serviceItemId, r]));
    const items = serviceItems
      .map((s) => ({
        serviceItemId: s.id,
        name: s.name,
        price: s.price,
        enabled: open.has(s.id),
        durationMin: open.get(s.id)?.durationMin ?? slots.defaultDurationMin,
        sortOrder: open.get(s.id)?.sortOrder ?? 9999,
      }))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return { items, ...slots };
  }

  async saveBookingSettings(input: BookingSettingsInput) {
    const { storeId } = requireLineConfig();
    const slots = validateSlotSettings({ ...DEFAULT_SLOT_SETTINGS, ...input });
    const items = (input.items ?? []).map((i, idx) => {
      const durationMin = Number(i.durationMin);
      if (!Number.isInteger(Number(i.serviceItemId)) || !isValidDuration(durationMin)) {
        throw new AppError('LINE_SETTINGS_INVALID', `bad item ${i.serviceItemId}`, 400);
      }
      return { serviceItemId: Number(i.serviceItemId), durationMin, sortOrder: Number(i.sortOrder ?? idx) };
    });
    if (new Set(items.map((i) => i.serviceItemId)).size !== items.length) {
      throw new AppError('LINE_SETTINGS_INVALID', 'duplicate items', 400);
    }
    if (items.length) {
      const valid = await this.prisma.serviceItem.count({
        where: { id: { in: items.map((i) => i.serviceItemId) }, deletedAt: null, OR: [{ storeId: null }, { storeId }] },
      });
      if (valid !== items.length) throw new AppError('SERVICE_ITEM_NOT_FOUND', undefined, 404);
    }

    await this.prisma.$transaction([
      this.prisma.lineBookingItem.deleteMany({}),
      ...(items.length ? [this.prisma.lineBookingItem.createMany({ data: items })] : []),
      this.prisma.lineSetting.upsert({ where: { storeId }, create: { storeId, ...slots }, update: slots }),
    ]);
    return this.getBookingSettings();
  }

  async listMyAppointments(lineUserId: string) {
    const customer = await this.requireBoundCustomer(lineUserId);
    return this.prisma.appointment.findMany({
      where: {
        customerId: customer.id,
        deletedAt: null,
        endAt: { gt: new Date() },
        status: { in: ['booked', 'confirmed'] },
      },
      select: LINE_APPOINTMENT_SELECT,
      orderBy: { startAt: 'asc' },
      take: 20,
    });
  }

  async createBooking(lineUserId: string, input: LineBookingInput, now = new Date()) {
    const { storeId } = requireLineConfig();
    const customer = await this.requireBoundCustomer(lineUserId);

    const slots = await this.getSlotSettings(storeId);
    const startAt = input.startAt ? new Date(input.startAt) : new Date(NaN);
    assertBookingTime(startAt, now, slots);

    // 只接受已開放的項目；時長取該項目設定，未選項目用預設時長
    const serviceItemId = input.serviceItemId ? Number(input.serviceItemId) : null;
    let durationMin = slots.defaultDurationMin;
    if (serviceItemId) {
      const item = (await this.listOpenItems(storeId)).find((i) => i.id === serviceItemId);
      if (!item) throw new AppError('SERVICE_ITEM_NOT_FOUND', 'item not open for LINE booking', 404);
      durationMin = item.durationMin;
    }
    const endAt = new Date(startAt.getTime() + durationMin * 60_000);

    // 指定服務人員：必須是本店在職的店長/服務人員；不做撞期檢查（由店家以 LINE 溝通調整）
    const staffId = input.staffId ? Number(input.staffId) : null;
    if (staffId && !(await this.listBookableStaff(storeId)).some((s) => s.id === staffId)) {
      throw new AppError('APPOINTMENT_STAFF_NOT_FOUND', undefined, 404);
    }

    const pending = await this.prisma.appointment.count({
      where: { customerId: customer.id, source: 'line', status: 'booked', deletedAt: null, endAt: { gt: now } },
    });
    if (pending >= LINE_BOOKING_MAX_PENDING) throw new AppError('LINE_BOOKING_TOO_MANY', undefined, 409);

    const botUserId = await this.getBotUserId();
    return this.prisma.appointment.create({
      data: {
        storeId,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        serviceItemId,
        staffId,
        startAt,
        endAt,
        status: 'booked',
        source: 'line',
        note: input.note?.trim().slice(0, 500) || null,
        createdById: botUserId,
      },
      select: LINE_APPOINTMENT_SELECT,
    });
  }

  /** 顧客只能取消自己「待確認」的預約；已確認的請洽店家 */
  async cancelBooking(lineUserId: string, appointmentId: number) {
    const customer = await this.requireBoundCustomer(lineUserId);
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, customerId: customer.id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!appt) throw new AppError('APPOINTMENT_NOT_FOUND', undefined, 404);
    if (appt.status !== 'booked') throw new AppError('LINE_BOOKING_CANNOT_CANCEL', undefined, 409);
    return this.prisma.appointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled' },
      select: LINE_APPOINTMENT_SELECT,
    });
  }

  // ── 後台「LINE」頁 ──────────────────────────

  async listAccounts() {
    const rows = await this.prisma.lineAccount.findMany({
      select: {
        id: true,
        lineUserId: true,
        displayName: true,
        pictureUrl: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phone: true, customerCode: true, deletedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      lineUserId: r.lineUserId,
      displayName: r.displayName,
      pictureUrl: r.pictureUrl,
      createdAt: r.createdAt.toISOString(),
      customer: {
        id: r.customer.id,
        name: r.customer.name,
        phone: r.customer.phone,
        customerCode: r.customer.customerCode,
        deleted: !!r.customer.deletedAt,
      },
    }));
  }

  async findAccount(id: number) {
    const account = await this.prisma.lineAccount.findUnique({ where: { id } });
    if (!account) throw new AppError('LINE_BINDING_NOT_FOUND', undefined, 404);
    return account;
  }

  async getBindingByCustomer(customerId: number) {
    const account = await this.prisma.lineAccount.findUnique({
      where: { customerId },
      select: { id: true, displayName: true, pictureUrl: true, createdAt: true },
    });
    return { bound: !!account, account };
  }

  async unbind(id: number) {
    await this.findAccount(id);
    await this.prisma.lineAccount.delete({ where: { id } });
  }

  async listPendingLineAppointments() {
    return this.prisma.appointment.findMany({
      where: { source: 'line', status: 'booked', deletedAt: null, endAt: { gt: new Date() } },
      select: { ...LINE_APPOINTMENT_SELECT, storeId: true, customerName: true, customerPhone: true, createdAt: true },
      orderBy: { startAt: 'asc' },
      take: 100,
    });
  }
}

/** "HH:MM" → 當日分鐘數；格式錯誤回 NaN */
export function slotToMinutes(slot: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(slot ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function isValidDuration(min: number): boolean {
  return Number.isInteger(min) && min >= 15 && min <= 480 && min % 5 === 0;
}

export function validateSlotSettings(input: SlotSettings): SlotSettings {
  const s = {
    defaultDurationMin: Number(input.defaultDurationMin),
    firstSlot: String(input.firstSlot),
    lastSlot: String(input.lastSlot),
    slotIntervalMin: Number(input.slotIntervalMin),
  };
  const first = slotToMinutes(s.firstSlot);
  const last = slotToMinutes(s.lastSlot);
  if (
    !isValidDuration(s.defaultDurationMin) ||
    Number.isNaN(first) ||
    Number.isNaN(last) ||
    first > last ||
    !SLOT_INTERVALS.includes(s.slotIntervalMin)
  ) {
    throw new AppError('LINE_SETTINGS_INVALID', 'invalid slot settings', 400);
  }
  return s;
}

/**
 * 只能約未來（至少 30 分鐘後）、60 天內；
 * 開始時間（台北時間）需落在 firstSlot～lastSlot 之間，且符合時段間隔。
 */
export function assertBookingTime(startAt: Date, now: Date, slots: SlotSettings = DEFAULT_SLOT_SETTINGS) {
  if (Number.isNaN(startAt.getTime())) throw new AppError('LINE_BOOKING_INVALID_TIME', 'invalid startAt', 400);
  const diff = startAt.getTime() - now.getTime();
  if (diff < 30 * 60_000 || diff > LINE_BOOKING_MAX_DAYS * 86_400_000) {
    throw new AppError('LINE_BOOKING_INVALID_TIME', 'out of range', 400);
  }
  const taipei = new Date(startAt.getTime() + 8 * 3_600_000);
  const minutes = taipei.getUTCHours() * 60 + taipei.getUTCMinutes();
  const first = slotToMinutes(slots.firstSlot);
  const last = slotToMinutes(slots.lastSlot);
  if (
    startAt.getUTCSeconds() !== 0 ||
    startAt.getUTCMilliseconds() !== 0 ||
    minutes < first ||
    minutes > last ||
    (minutes - first) % slots.slotIntervalMin !== 0
  ) {
    throw new AppError('LINE_BOOKING_INVALID_TIME', 'not on a bookable slot', 400);
  }
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}
