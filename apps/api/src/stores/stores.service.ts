import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

export interface StoreSummary {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

const STORE_SELECT = {
  id: true, code: true, name: true,
  phone: true, address: true, isActive: true,
} satisfies Prisma.StoreSelect;

type StoreRow = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;

function toSummary(store: StoreRow): StoreSummary {
  return {
    id: store.id,
    code: store.code,
    name: store.name,
    phone: store.phone,
    address: store.address,
    isActive: store.isActive,
  };
}

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listStores(_actor: AuthenticatedUser, includeInactive = false): Promise<StoreSummary[]> {
    const stores = await this.prisma.store.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      select: STORE_SELECT,
    });
    return stores.map(toSummary);
  }

  async createStore(_actor: AuthenticatedUser, input: { name: string; phone?: string; address?: string; note?: string }): Promise<StoreSummary> {
    const name = input.name?.trim();
    if (!name) throw new AppError('STORE_NAME_REQUIRED', 'name is required');

    const count = await this.prisma.store.count({ where: { deletedAt: null } });
    const code = `S${String(count + 1).padStart(2, '0')}`;

    const store = await this.prisma.store.create({
      data: { code, name, phone: input.phone, address: input.address, note: input.note },
      select: STORE_SELECT,
    });
    return toSummary(store);
  }

  async updateStore(id: number, input: { name?: string; phone?: string; address?: string; note?: string }): Promise<StoreSummary> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    const store = await this.prisma.store.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      select: STORE_SELECT,
    });
    return toSummary(store);
  }

  async setActive(id: number, isActive: boolean): Promise<StoreSummary> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    const store = await this.prisma.store.update({ where: { id }, data: { isActive }, select: STORE_SELECT });
    return toSummary(store);
  }

  async toggleStoreActive(id: number): Promise<StoreSummary> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    const store = await this.prisma.store.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: STORE_SELECT,
    });
    return toSummary(store);
  }

  async deleteStore(id: number): Promise<void> {
    const existing = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    const customerCount = await this.prisma.customer.count({ where: { storeId: id, deletedAt: null } });
    const userCount = await this.prisma.user.count({ where: { storeId: id, deletedAt: null } });
    if (customerCount > 0 || userCount > 0) {
      throw new AppError('STORE_HAS_DEPENDENTS', `store ${id} still has ${customerCount} customers and ${userCount} users attached`, 409);
    }
    await this.prisma.store.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async updateStoreFeatures(id: number, features: Record<string, boolean>) {
    const store = await this.prisma.store.findFirst({ where: { id, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);
    await this.prisma.store.update({ where: { id }, data: { features } });
  }

  async createStoreStaff(actor: AuthenticatedUser, storeId: number, input: { name: string; username: string; password: string }) {
    if (!isAdminRole(actor.role) && actor.role !== 'manager') {
      throw new AppError('PERMISSION_DENIED', '只有店長或管理員可以建立員工帳號', 403);
    }
    if (actor.role === 'manager' && actor.storeId !== storeId) {
      throw new AppError('STAFF_STORE_MISMATCH', '只能為自己所屬分店建立員工帳號', 403);
    }

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new AppError('STORE_NOT_FOUND', '找不到此分店', 404);

    const usernameTrimmed = input.username.trim().toLowerCase();
    const existingUsername = await this.prisma.user.findFirst({ where: { username: usernameTrimmed, deletedAt: null } });
    if (existingUsername) throw new AppError('USER_USERNAME_EXISTS', '這個帳號名稱已被使用', 409);

    if (!input.password || input.password.length < 4) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', '密碼至少要 4 個字元', 400);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: usernameTrimmed,
        name: input.name.trim(),
        password: passwordHash,
        role: 'staff',
        storeId,
        parentId: actor.id,
      },
      select: { id: true, username: true, name: true, role: true, storeId: true, isActive: true },
    });
    return user;
  }

  async updateStoreStaff(actor: AuthenticatedUser, storeId: number, staffId: number, input: { name?: string; username?: string; password?: string; isActive?: boolean }) {
    if (!isAdminRole(actor.role) && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能管理自己所屬分店的員工', 403);
    }
    const staff = await this.prisma.user.findFirst({ where: { id: staffId, storeId, deletedAt: null } });
    if (!staff) throw new AppError('USER_NOT_FOUND', '找不到此員工', 404);

    if (input.username) {
      const dup = await this.prisma.user.findFirst({ where: { username: input.username.trim(), deletedAt: null, id: { not: staffId } } });
      if (dup) throw new AppError('USER_USERNAME_EXISTS', '這個帳號名稱已被使用', 409);
    }

    let passwordHash: string | undefined;
    if (input.password) {
      if (input.password.length < 4) throw new AppError('USER_PASSWORD_TOO_SHORT', '密碼至少要 4 個字元', 400);
      passwordHash = await bcrypt.hash(input.password, 10);
    }

    return this.prisma.user.update({
      where: { id: staffId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.username !== undefined ? { username: input.username.trim() } : {}),
        ...(passwordHash !== undefined ? { password: passwordHash } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, username: true, name: true, role: true, storeId: true, isActive: true },
    });
  }

  async deleteStoreStaff(actor: AuthenticatedUser, storeId: number, staffId: number): Promise<void> {
    if (!isAdminRole(actor.role) && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能管理自己所屬分店的員工', 403);
    }
    const staff = await this.prisma.user.findFirst({ where: { id: staffId, storeId, deletedAt: null } });
    if (!staff) throw new AppError('USER_NOT_FOUND', '找不到此員工', 404);
    await this.prisma.user.update({ where: { id: staffId }, data: { deletedAt: new Date(), isActive: false } });
  }

  async listStoreStaff(storeId: number) {
    return this.prisma.user.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, username: true, name: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
