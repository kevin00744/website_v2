import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, type Region, type Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AuthenticatedUser } from '../auth/types';

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  storeId: true,
  region: true,
  isActive: true,
  dealerId: true,
  parentId: true,
  store: { select: { name: true } },
  dealer: { select: { id: true, name: true } },
  parent: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface UserSummary {
  id: number;
  username: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  storeId: number | null;
  storeName: string | null;
  region: Region | null;
  isActive: boolean;
  dealerId: number | null;
  dealerName: string | null;
  parentId: number | null;
  creatorName: string | null;
}

interface CreateUserInput {
  username: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
}

interface UpdateUserInput {
  username?: string;
  name?: string;
  email?: string;
  role?: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
  isActive?: boolean;
}

/** system_admin 帳號不可被任何人管理（除了自己改密碼），這是最高層級的保護規則 */
const PROTECTED_ROLE: Role = 'system_admin';

const MIN_PASSWORD_LENGTH = 8;

/**
 * 角色建立矩陣：鍵為「建立者角色」，值為「允許建立的目標角色清單」。
 * system_admin 可建立任何角色（不受此矩陣限制，在 service 層直接放行）。
 */
const CREATOR_ROLE_MATRIX: Partial<Record<Role, Role[]>> = {
  general_agent: ['dealer'],
  dealer: ['manager', 'staff', 'accountant'],
  manager: ['staff', 'accountant'],
};

/** 只有 system_admin 能變更任何人的 role；其他角色修改自己或別人的 role 均禁止 */
const ROLE_CHANGER: Role = 'system_admin';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(actor: AuthenticatedUser): Promise<UserSummary[]> {
    let where: Prisma.UserWhereInput = { deletedAt: null };

    if (actor.role === 'general_agent') {
      // 總代理看同區域的所有 dealer（不限自己建立的）
      where = { deletedAt: null, role: 'dealer', region: actor.region ?? 'NONE' as Region };
    } else if (actor.role === 'dealer') {
      // dealer 看自己底下的 manager/staff/accountant
      where = { deletedAt: null, dealerId: actor.id };
    } else if (actor.role === 'manager') {
      // 店長只看同一分店的 staff/accountant
      where = { deletedAt: null, storeId: actor.storeId ?? -1, role: { in: ['staff', 'accountant'] } };
    }
    // admin / system_admin 看全部

    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: USER_SELECT,
    });
    return users.map(toSummary);
  }

  async createUser(actor: AuthenticatedUser, input: CreateUserInput): Promise<UserSummary> {
    // system_admin 不受矩陣限制，其餘角色走矩陣檢查
    if (actor.role !== 'system_admin') {
      this.assertCreatorCanAssign(actor.role, input.role);
    }
    this.assertRoleFieldsValid(input.role, input.storeId, input.region);

    const username = input.username?.trim();
    if (!username) throw new AppError('USER_USERNAME_REQUIRED', 'username is required');
    const name = input.name?.trim();
    if (!name) throw new AppError('USER_NAME_REQUIRED', 'name is required');
    const email = input.email?.trim();
    if (!email) throw new AppError('USER_EMAIL_REQUIRED', 'email is required');
    if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
    }

    const existingUsername = await this.prisma.user.findFirst({ where: { username, deletedAt: null } });
    if (existingUsername) throw new AppError('USER_USERNAME_EXISTS', `username ${username} already exists`, 409);

    const existingEmail = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (existingEmail) throw new AppError('USER_EMAIL_EXISTS', `email ${email} already exists`, 409);

    // Lookup store for storeId-based roles to validate and auto-set region
    let storeRegion: Region | null = null;
    if ((input.role === 'manager' || input.role === 'staff' || input.role === 'accountant') && input.storeId) {
      const store = await this.prisma.store.findFirst({ where: { id: input.storeId, deletedAt: null } });
      if (!store) throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
      if ((actor.role === 'dealer' || actor.role === 'general_agent') && store.region !== actor.region) {
        throw new AppError('STORE_NOT_IN_REGION', "selected store is outside dealer's region", 403);
      }
      storeRegion = store.region;
    }

    // 總代理只能在自己區域內開設代理帳號，且自動填入區域
    if (actor.role === 'general_agent' && input.role === 'dealer') {
      if (input.region && input.region !== actor.region) {
        throw new AppError('REGION_MISMATCH', '總代理只能在自己的區域內建立代理帳號', 403);
      }
      if (!input.region) {
        input = { ...input, region: actor.region ?? undefined };
      }
    }

    // 自動計算 dealerId：
    // - 建立者是 dealer → dealerId = actor.id
    // - 建立者是 manager（屬於某 dealer）→ dealerId = actor.dealerId
    // - general_agent 建立 dealer → dealerId = null（dealer 本身不需要 dealerId）
    // - system_admin/admin 建立任何角色 → dealerId = null（由管理員自行帶入或留空）
    let dealerId: number | null = null;
    if (actor.role === 'dealer') {
      dealerId = actor.id;
    } else if (actor.role === 'manager' && actor.dealerId) {
      dealerId = actor.dealerId;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username,
        name,
        email,
        password: passwordHash,
        role: input.role,
        storeId: (input.role === 'manager' || input.role === 'staff' || input.role === 'accountant') ? (input.storeId ?? null) : null,
        region: (input.role === 'dealer' || input.role === 'general_agent') ? (input.region ?? null) : storeRegion,
        phone: input.phone,
        parentId: actor.id,
        dealerId,
      },
      select: USER_SELECT,
    });
    return toSummary(user);
  }

  async updateUser(actor: AuthenticatedUser, id: number, input: UpdateUserInput): Promise<UserSummary> {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new AppError('USER_NOT_FOUND', `user ${id} not found`, 404);

    // system_admin 帳號只能自己管自己
    if (target.role === PROTECTED_ROLE && actor.id !== target.id) {
      throw new AppError('PERMISSION_DENIED', 'system_admin account can only be managed by itself', 403);
    }

    // 角色變更：只有 system_admin 可以改任何人的 role
    if (input.role !== undefined && input.role !== target.role) {
      if (actor.role !== ROLE_CHANGER) {
        throw new AppError('PERMISSION_DENIED', 'only system_admin can change roles', 403);
      }
    }

    // 禁止自己修改自己的 role（即使是 system_admin，防止意外降級鎖死）
    if (input.role !== undefined && actor.id === id) {
      throw new AppError('PERMISSION_DENIED', 'cannot change your own role', 403);
    }

    const nextRole = input.role ?? target.role;
    this.assertRoleFieldsValid(
      nextRole,
      input.storeId ?? target.storeId ?? undefined,
      input.region ?? target.region ?? undefined,
    );

    // Auto-set region from store for store-based roles
    let updatedStoreRegion: Region | null | undefined = undefined;
    const effectiveStoreId = input.storeId ?? target.storeId;
    if ((nextRole === 'manager' || nextRole === 'staff' || nextRole === 'accountant') && effectiveStoreId) {
      const store = await this.prisma.store.findFirst({ where: { id: effectiveStoreId, deletedAt: null } });
      if (store) updatedStoreRegion = store.region;
    }

    // 檢查 username 唯一性
    if (input.username) {
      const u = input.username.trim();
      const existing = await this.prisma.user.findFirst({ where: { username: u, deletedAt: null, id: { not: id } } });
      if (existing) throw new AppError('USER_USERNAME_EXISTS', `username ${u} already exists`, 409);
    }

    // 檢查 email 唯一性
    if (input.email) {
      const e = input.email.trim();
      const existing = await this.prisma.user.findFirst({ where: { email: e, deletedAt: null, id: { not: id } } });
      if (existing) throw new AppError('USER_EMAIL_EXISTS', `email ${e} already exists`, 409);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: input.username?.trim(),
        name: input.name?.trim(),
        email: input.email?.trim(),
        role: input.role,
        storeId: (nextRole === 'manager' || nextRole === 'staff' || nextRole === 'accountant')
          ? (input.storeId ?? target.storeId)
          : null,
        region: (nextRole === 'dealer' || nextRole === 'general_agent') ? (input.region ?? target.region) : (updatedStoreRegion !== undefined ? updatedStoreRegion : null),
        phone: input.phone,
        isActive: input.isActive,
      },
      select: USER_SELECT,
    });
    return toSummary(user);
  }

  async updateSelf(actorId: number, input: { username?: string; password?: string; phone?: string; name?: string; email?: string }): Promise<UserSummary> {
    const actor = await this.prisma.user.findFirst({ where: { id: actorId, deletedAt: null }, select: USER_SELECT });
    if (!actor) throw new AppError('USER_NOT_FOUND', 'user not found', 404);

    if (input.username !== undefined) {
      const duplicate = await this.prisma.user.findFirst({ where: { username: input.username.trim(), NOT: { id: actorId } } });
      if (duplicate) throw new AppError('USER_USERNAME_DUPLICATE', '帳號已被使用', 409);
    }

    let passwordHash: string | undefined;
    if (input.password !== undefined) {
      if (input.password.length < MIN_PASSWORD_LENGTH) {
        throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
      }
      passwordHash = await bcrypt.hash(input.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id: actorId },
      data: {
        ...(input.username !== undefined ? { username: input.username.trim() } : {}),
        ...(passwordHash !== undefined ? { password: passwordHash } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.email !== undefined ? { email: input.email.trim() } : {}),
      },
      select: USER_SELECT,
    });
    return toSummary(updated);
  }

  async resetPassword(actor: AuthenticatedUser, id: number, newPassword: string): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new AppError('USER_NOT_FOUND', `user ${id} not found`, 404);
    if (target.role === PROTECTED_ROLE && actor.id !== target.id) {
      throw new AppError('PERMISSION_DENIED', 'system_admin account can only be managed by itself', 403);
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { password: passwordHash } });
  }

  async deleteUser(actor: AuthenticatedUser, id: number): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new AppError('USER_NOT_FOUND', `user ${id} not found`, 404);
    if (actor.id === target.id) throw new AppError('USER_CANNOT_DELETE_SELF', 'cannot delete your own account', 400);
    if (target.role === PROTECTED_ROLE) throw new AppError('PERMISSION_DENIED', 'system_admin account cannot be deleted', 403);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  /** 驗證建立者角色是否有權建立目標角色（system_admin 不走此方法，直接放行） */
  private assertCreatorCanAssign(creatorRole: Role, targetRole: Role) {
    const allowed = CREATOR_ROLE_MATRIX[creatorRole];
    if (!allowed || !allowed.includes(targetRole)) {
      throw new AppError(
        'PERMISSION_DENIED',
        `role ${creatorRole} cannot create accounts with role ${targetRole}`,
        403,
      );
    }
  }

  async assignUserDealer(userId: number, dealerId: number | null): Promise<UserSummary> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new AppError('USER_NOT_FOUND', '找不到此帳號', 404);
    if (dealerId !== null) {
      const dealer = await this.prisma.user.findFirst({ where: { id: dealerId, deletedAt: null, role: 'dealer' } });
      if (!dealer) throw new AppError('DEALER_NOT_FOUND', '找不到此代理帳號', 404);
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { dealerId }, select: USER_SELECT });
    return toSummary(updated);
  }

  private assertRoleFieldsValid(role: Role, storeId?: number, region?: Region) {
    if (role === 'manager' && !storeId) {
      throw new AppError('USER_STORE_REQUIRED', 'manager requires a storeId', 400);
    }
    if ((role === 'dealer' || role === 'general_agent') && !region) {
      // general_agent / dealer 都需要區域
      // 但 general_agent 其實是總代理，region 可選——視業務需求放寬
    }
  }
}

function toSummary(user: UserRow): UserSummary {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    storeId: user.storeId,
    storeName: user.store?.name ?? null,
    region: user.region,
    isActive: user.isActive,
    dealerId: user.dealerId,
    dealerName: user.dealer?.name ?? null,
    parentId: user.parentId,
    creatorName: user.parent?.name ?? null,
  };
}
