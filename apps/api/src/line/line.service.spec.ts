import { AppError } from '../common/errors/app-error';
import {
  LineService,
  assertBookingTime,
  validateSlotSettings,
  DEFAULT_SLOT_SETTINGS,
  type LineProfile,
} from './line.service';

const profile: LineProfile = { lineUserId: 'U123', displayName: 'Amy', pictureUrl: null };

function makePrisma() {
  return {
    lineAccount: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    customer: { findFirst: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 99 }), findMany: jest.fn().mockResolvedValue([]) },
    appointment: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    lineSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    lineBookingItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(code));
}

beforeEach(() => {
  process.env.LINE_ENABLED = 'true';
  process.env.LINE_STORE_ID = '1';
});

describe('LineService.bind', () => {
  it('looks up the customer by normalized phone, matching both digit and dashed storage', async () => {
    const prisma = makePrisma();
    prisma.lineAccount.findUnique.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue({ id: 7, name: '林舜毅', phone: '0981-675-415' });
    const svc = new LineService(prisma as never);

    await expect(svc.bind(profile, { phone: '0981675415', name: '林 舜毅' })).resolves.toEqual({ bound: true, created: false });
    expect(prisma.customer.findFirst.mock.calls[0][0].where.phone).toEqual({ in: ['0981675415', '0981-675-415'] });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.lineAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineUserId: 'U123', customerId: 7 }),
    });
  });

  it('rejects when the phone exists but the name does not match, without binding', async () => {
    const prisma = makePrisma();
    prisma.lineAccount.findUnique.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue({ id: 7, name: '王小明', phone: '0912345678' });
    const svc = new LineService(prisma as never);

    await expectCode(svc.bind(profile, { phone: '0912345678', name: '陳大文' }), 'LINE_BIND_MISMATCH');
    expect(prisma.lineAccount.create).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('creates a new customer (digits-only phone) under the bot user when the phone is unknown', async () => {
    const prisma = makePrisma();
    prisma.lineAccount.findUnique.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 50 });
    const svc = new LineService(prisma as never);

    await expect(svc.bind(profile, { phone: '+886 912-000-111', name: '新客人' })).resolves.toEqual({ bound: true, created: true });
    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: '新客人', phone: '0912000111', storeId: 1, createdBy: 99, note: 'LINE 自助建檔' }),
      }),
    );
  });

  it('rejects a customer already bound to another LINE account', async () => {
    const prisma = makePrisma();
    prisma.lineAccount.findUnique.mockImplementation(({ where }: { where: { lineUserId?: string; customerId?: number } }) =>
      Promise.resolve(where.customerId === 7 ? { id: 1, customerId: 7, lineUserId: 'Uother' } : null),
    );
    prisma.customer.findFirst.mockResolvedValue({ id: 7, name: '王小明', phone: '0912345678' });
    const svc = new LineService(prisma as never);

    await expectCode(svc.bind(profile, { phone: '0912345678', name: '王小明' }), 'LINE_CUSTOMER_TAKEN');
  });

  it('refuses when LINE is disabled', async () => {
    process.env.LINE_ENABLED = 'false';
    const svc = new LineService(makePrisma() as never);
    await expectCode(svc.bind(profile, { phone: '0912345678', name: 'x' }), 'LINE_DISABLED');
  });
});

describe('slot settings', () => {
  it('validates durations, HH:MM format, order and interval', () => {
    expect(validateSlotSettings({ ...DEFAULT_SLOT_SETTINGS })).toEqual(DEFAULT_SLOT_SETTINGS);
    const bad = [
      { defaultDurationMin: 10 },
      { defaultDurationMin: 62 },
      { firstSlot: '9:00' },
      { lastSlot: '25:00' },
      { firstSlot: '20:00', lastSlot: '10:00' },
      { slotIntervalMin: 20 },
    ];
    for (const patch of bad) {
      expect(() => validateSlotSettings({ ...DEFAULT_SLOT_SETTINGS, ...patch })).toThrow(AppError);
    }
  });
});

describe('assertBookingTime', () => {
  const now = new Date('2026-11-16T02:00:00Z'); // 台北 10:00

  it('accepts a future slot within 60 days and business hours', () => {
    expect(() => assertBookingTime(new Date('2026-11-17T06:30:00Z'), now)).not.toThrow(); // 台北 14:30
  });

  it('follows configured hours and interval', () => {
    const slots = { ...DEFAULT_SLOT_SETTINGS, firstSlot: '09:15', lastSlot: '12:00', slotIntervalMin: 15 };
    expect(() => assertBookingTime(new Date('2026-11-17T01:15:00Z'), now, slots)).not.toThrow(); // 09:15
    expect(() => assertBookingTime(new Date('2026-11-17T03:45:00Z'), now, slots)).not.toThrow(); // 11:45
    expect(() => assertBookingTime(new Date('2026-11-17T04:15:00Z'), now, slots)).toThrow(AppError); // 12:15 超過最後時段
  });

  it.each([
    ['past', '2026-11-16T01:00:00Z'],
    ['less than 30 min ahead', '2026-11-16T02:15:00Z'],
    ['more than 60 days ahead', '2027-01-20T02:00:00Z'],
    ['not on a 30-min slot', '2026-11-17T06:10:00Z'],
    ['before first slot (台北 09:00)', '2026-11-17T01:00:00Z'],
    ['after last slot (台北 20:00)', '2026-11-17T12:00:00Z'],
    ['invalid', 'nope'],
  ])('rejects %s', (_label, iso) => {
    expect(() => assertBookingTime(new Date(iso), now)).toThrow(AppError);
  });
});

describe('LineService booking', () => {
  const NOW = new Date('2026-11-16T02:00:00Z');
  const START = '2026-11-17T06:30:00Z';

  function boundPrisma() {
    const prisma = makePrisma();
    prisma.lineAccount.findUnique.mockResolvedValue({
      customer: { id: 7, name: '王小明', phone: '0912345678', email: null, customerCode: null, storeId: 1, deletedAt: null },
    });
    prisma.appointment.count.mockResolvedValue(0);
    prisma.appointment.create.mockResolvedValue({ id: 1 });
    prisma.lineBookingItem.findMany.mockResolvedValue([
      { durationMin: 90, sortOrder: 0, serviceItem: { id: 3, name: '臉部保養' } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 21, name: '小美' }]);
    return prisma;
  }

  it('uses the open item duration and the chosen staff, as a LINE-sourced booked appointment', async () => {
    const prisma = boundPrisma();
    const svc = new LineService(prisma as never);
    await svc.createBooking('U123', { startAt: START, serviceItemId: 3, staffId: 21 }, NOW);
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 7,
          serviceItemId: 3,
          staffId: 21,
          status: 'booked',
          source: 'line',
          createdById: 99,
          endAt: new Date('2026-11-17T08:00:00Z'), // 90 分鐘
        }),
      }),
    );
  });

  it('uses the default duration when no item is chosen', async () => {
    const prisma = boundPrisma();
    const svc = new LineService(prisma as never);
    await svc.createBooking('U123', { startAt: START }, NOW);
    expect(prisma.appointment.create.mock.calls[0][0].data).toMatchObject({
      serviceItemId: null,
      staffId: null,
      endAt: new Date('2026-11-17T07:30:00Z'),
    });
  });

  it('rejects items that are not open for LINE booking', async () => {
    const prisma = boundPrisma();
    const svc = new LineService(prisma as never);
    await expectCode(svc.createBooking('U123', { startAt: START, serviceItemId: 999 }, NOW), 'SERVICE_ITEM_NOT_FOUND');
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects staff that are not bookable', async () => {
    const prisma = boundPrisma();
    const svc = new LineService(prisma as never);
    await expectCode(svc.createBooking('U123', { startAt: START, staffId: 555 }, NOW), 'APPOINTMENT_STAFF_NOT_FOUND');
  });

  it('limits pending LINE requests per customer', async () => {
    const prisma = boundPrisma();
    prisma.appointment.count.mockResolvedValue(3);
    const svc = new LineService(prisma as never);
    await expectCode(svc.createBooking('U123', { startAt: START }, NOW), 'LINE_BOOKING_TOO_MANY');
  });

  it('requires binding before booking', async () => {
    const prisma = makePrisma();
    prisma.lineAccount.findUnique.mockResolvedValue(null);
    const svc = new LineService(prisma as never);
    await expectCode(svc.createBooking('U123', { startAt: START }), 'LINE_NOT_BOUND');
  });

  it("only cancels the customer's own booked appointments", async () => {
    const prisma = boundPrisma();
    const svc = new LineService(prisma as never);

    prisma.appointment.findFirst.mockResolvedValueOnce(null);
    await expectCode(svc.cancelBooking('U123', 5), 'APPOINTMENT_NOT_FOUND');
    expect(prisma.appointment.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 5, customerId: 7 }) }),
    );

    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 5, status: 'confirmed' });
    await expectCode(svc.cancelBooking('U123', 5), 'LINE_BOOKING_CANNOT_CANCEL');

    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 5, status: 'booked' });
    await svc.cancelBooking('U123', 5);
    expect(prisma.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'cancelled' } }));
  });
});
