import { CustomersService } from './customers.service';
import type { AuthenticatedUser } from '../auth/types';

const manager: AuthenticatedUser = {
  id: 2, username: 'm', email: null, name: 'M', role: 'manager', storeId: 1, storeFeatures: null,
};

function makeService() {
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 1, code: 'S1', name: '店' }) },
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 1, store: { name: '店' } })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 1, store: { name: '店' } })),
    },
  };
  return { prisma, svc: new CustomersService(prisma as never) };
}

describe('customer phone storage is normalized', () => {
  it('quick-create stores digits only and checks duplicates against both spellings', async () => {
    const { prisma, svc } = makeService();
    await svc.createQuickCustomer(manager, { name: '林舜毅', phone: '0981-675-415' }).catch(() => undefined);
    expect(prisma.customer.findFirst.mock.calls[0][0].where.phone).toEqual({ in: ['0981675415', '0981-675-415'] });
    expect(prisma.customer.create.mock.calls[0][0].data.phone).toBe('0981675415');
  });

  it('quick-create rejects a phone that already exists in another format', async () => {
    const { prisma, svc } = makeService();
    prisma.customer.findFirst.mockResolvedValueOnce({ id: 9 });
    await expect(svc.createQuickCustomer(manager, { name: '林舜毅', phone: '0981-675-415' })).rejects.toMatchObject({
      code: 'CUSTOMER_PHONE_EXISTS',
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('update stores digits only', async () => {
    const { prisma, svc } = makeService();
    prisma.customer.findFirst
      .mockResolvedValueOnce({ id: 1, phone: '0981675415', nationalId: null, storeId: 1 }) // existing
      .mockResolvedValueOnce(null); // duplicate check
    await svc.updateCustomer(manager, 1, { phone: '0912-345-678' }).catch(() => undefined);
    expect(prisma.customer.update.mock.calls[0][0].data.phone).toBe('0912345678');
  });

  it('update with the same number in dashed form does not trigger the duplicate check', async () => {
    const { prisma, svc } = makeService();
    prisma.customer.findFirst.mockResolvedValueOnce({ id: 1, phone: '0981675415', nationalId: null, storeId: 1 });
    await svc.updateCustomer(manager, 1, { phone: '0981-675-415' }).catch(() => undefined);
    expect(prisma.customer.findFirst).toHaveBeenCalledTimes(1);
  });
});
