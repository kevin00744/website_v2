import type { ExecutionContext } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { SystemAdminGuard } from '../auth/system-admin.guard';
import type { AuthenticatedUser } from '../auth/types';

const actor = (role: AuthenticatedUser['role']): AuthenticatedUser => ({
  id: 1,
  username: role,
  email: null,
  name: role,
  role,
  storeId: 1,
  storeFeatures: null,
});

function makeService() {
  const prisma = {
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
  };
  const lineNotify = { notifyAppointmentStatus: jest.fn().mockResolvedValue(undefined) };
  return { prisma, lineNotify, svc: new AppointmentsService(prisma as never, lineNotify as never) };
}

describe('LINE appointments are visible to every calendar role', () => {
  const from = '2026-11-01T00:00:00Z';
  const to = '2026-11-30T00:00:00Z';

  it.each(['system_admin', 'admin', 'manager', 'staff'] as const)('%s list is not filtered by source', async (role) => {
    const { prisma, svc } = makeService();
    await svc.list(actor(role), 1, from, to);
    expect(prisma.appointment.findMany.mock.calls[0][0].where.source).toBeUndefined();
  });

  it('update/remove lookups are not filtered by source', async () => {
    const { prisma, svc } = makeService();
    await expect(svc.update(actor('manager'), 1, 9, { status: 'confirmed' })).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    await expect(svc.remove(actor('manager'), 1, 9)).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    for (const call of prisma.appointment.findFirst.mock.calls) {
      expect(call[0].where.source).toBeUndefined();
    }
  });

  it('notifies LINE when a manager confirms a LINE appointment', async () => {
    const { prisma, lineNotify, svc } = makeService();
    const now = new Date();
    prisma.appointment.findFirst.mockResolvedValue({
      id: 9, status: 'booked', source: 'line', startAt: now, endAt: new Date(now.getTime() + 3_600_000), staffId: null,
    });
    prisma.appointment.update.mockResolvedValue({ id: 9, status: 'confirmed', source: 'line' });
    await svc.update(actor('manager'), 1, 9, { status: 'confirmed' });
    expect(lineNotify.notifyAppointmentStatus).toHaveBeenCalledWith(9, 'confirmed');
  });
});

describe('SystemAdminGuard (LINE status block)', () => {
  const ctx = (user?: AuthenticatedUser) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

  it('allows only system_admin (not admin)', () => {
    const guard = new SystemAdminGuard();
    expect(guard.canActivate(ctx(actor('system_admin')))).toBe(true);
    expect(() => guard.canActivate(ctx(actor('admin')))).toThrow();
    expect(() => guard.canActivate(ctx(actor('manager')))).toThrow();
    expect(() => guard.canActivate(ctx(undefined))).toThrow();
  });
});
