import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, type Role } from '@prisma/client';
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
  isActive: true,
  parentId: true,
  store: { select: { name: true } },
  parent: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface UserSummary {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: Role;
  phone: string | null;
  storeId: number | null;
  storeName: string | null;
  isActive: boolean;
  parentId: number | null;
  creatorName: string | null;
}

interface CreateUserInput {
  username: string;
  name: string;
  email?: string;
  password: string;
  role: Role;
  storeId?: number;
  phone?: string;
}

interface UpdateUserInput {
  username?: string;
  name?: string;
  email?: string;
  role?: Role;
  storeId?: number;
  phone?: string;
  isActive?: boolean;
}

/** system_admin 帳號不可被任何人管理（除了自己改密碼） */
const PROTECTED_ROLE: Role = 'system_admin';

const MIN_PASSWORD_LENGTH = 8;

/**
 * 角色建立矩陣：
 * - system_admin / admin：不受限（可建立任何角色）
 * - manager：只能建立 staff
 */
const CREATOR_ROLE_MATRIX: Partial<Record<Role, Role[]>> = {
  admin: ['manager', 'accountant', 'staff'],
  manager: ['accountant', 'staff'],
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(actor: AuthenticatedUser): Promise<UserSummary[]> {
    let where: Prisma.UserWhereInput = { deletedAt: null };

    if (actor.role === 'manager') {
      // 店長只看同一分店的 staff
      where = { deletedAt: null, storeId: actor.storeId ?? -1, role: { in: ['accountant', 'staff'] } };
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

    const username = input.username?.trim();
    if (!username) throw new AppError('USER_USERNAME_REQUIRED', 'username is required');
    const name = input.name?.trim();
    if (!name) throw new AppError('USER_NAME_REQUIRED', 'name is required');
    const email = input.email?.trim() || null;
    if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
    }

    const existingUsername = await this.prisma.user.findFirst({ where: { username, deletedAt: null } });
    if (existingUsername) throw new AppError('USER_USERNAME_EXISTS', `username ${username} already exists`, 409);

    if (email) {
      const existingEmail = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
      if (existingEmail) throw new AppError('USER_EMAIL_EXISTS', `email ${email} already exists`, 409);
    }

    // 單店模式：所有角色一律自動指派到唯一的分店
    const store = await this.prisma.store.findFirst({ where: { deletedAt: null, isActive: true } });
    const storeId = store?.id ?? null;

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username,
        name,
        email,
        password: passwordHash,
        role: input.role,
        storeId,
        phone: input.phone,
        parentId: actor.id,
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

    // 角色變更：只有 system_admin / admin 可以改角色
    if (input.role !== undefined && input.role !== target.role) {
      if (actor.role !== 'system_admin' && actor.role !== 'admin') {
        throw new AppError('PERMISSION_DENIED', 'only admin can change roles', 403);
      }
    }

    // 禁止自己修改自己的 role
    if (input.role !== undefined && actor.id === id) {
      throw new AppError('PERMISSION_DENIED', 'cannot change your own role', 403);
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

    const nextRole = input.role ?? target.role;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: input.username?.trim(),
        name: input.name?.trim(),
        email: input.email?.trim(),
        role: input.role,
        storeId: (nextRole === 'manager' || nextRole === 'staff')
          ? (input.storeId ?? target.storeId)
          : null,
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
    isActive: user.isActive,
    parentId: user.parentId,
    creatorName: user.parent?.name ?? null,
  };
}
