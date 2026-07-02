import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, type Region, type Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AuthenticatedUser } from '../auth/types';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  storeId: true,
  region: true,
  isActive: true,
  store: { select: { name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  storeId: number | null;
  storeName: string | null;
  region: Region | null;
  isActive: boolean;
}

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
}

interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
  isActive?: boolean;
}

/** system_admin 是唯一帳號，任何人（包含 admin）都不能新增/編輯/停用它，只有它自己能改自己的密碼 */
const PROTECTED_ROLE: Role = 'system_admin';

/** 可以透過這個模組指派的角色——system_admin 故意不開放，避免從 UI 製造出第二個系統管理員（沿用 Version 1 的 ROLES 限制） */
const ASSIGNABLE_ROLES: Role[] = ['admin', 'editor', 'dealer', 'manager'];

const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 經銷商（dealer）只能看到「自己區域」的店長帳號，不是全部帳號——跟 admin/system_admin
   * 看到的完整清單是兩種不同的視野，這支用 actor.role 分流，不是另開一支 API。
   */
  async listUsers(actor: AuthenticatedUser): Promise<UserSummary[]> {
    const isDealer = actor.role === 'dealer';
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(isDealer ? { role: 'manager', store: { region: actor.region ?? undefined } } : {}),
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: USER_SELECT,
    });
    return users.map(toSummary);
  }

  /**
   * 經銷商開立店長帳號的資格：只能開 role='manager'，且店要在自己負責的區域內——
   * 其他角色（admin/system_admin）呼叫這支沒有這些額外限制，沿用原本「什麼角色都能開」的行為。
   */
  async createUser(actor: AuthenticatedUser, input: CreateUserInput): Promise<UserSummary> {
    this.assertAssignableRole(input.role);
    this.assertRoleFieldsValid(input.role, input.storeId, input.region);

    if (actor.role === 'dealer') {
      if (input.role !== 'manager') {
        throw new AppError('PERMISSION_DENIED', 'dealer can only create manager accounts', 403);
      }
    }

    const name = input.name?.trim();
    if (!name) {
      throw new AppError('USER_NAME_REQUIRED', 'name is required');
    }
    const email = input.email?.trim();
    if (!email) {
      throw new AppError('USER_EMAIL_REQUIRED', 'email is required');
    }
    if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
    }

    const existing = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (existing) {
      throw new AppError('USER_EMAIL_EXISTS', `email ${email} already exists`, 409);
    }

    if (input.role === 'manager' && input.storeId) {
      const store = await this.prisma.store.findFirst({ where: { id: input.storeId, deletedAt: null } });
      if (!store) {
        throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
      }
      // 經銷商只能把店長指派到自己負責區域內的分店，不能跨區開帳號
      if (actor.role === 'dealer' && store.region !== actor.region) {
        throw new AppError('STORE_NOT_IN_REGION', 'selected store is outside dealer\'s region', 403);
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role: input.role,
        storeId: input.role === 'manager' ? input.storeId : null,
        region: input.role === 'dealer' ? input.region : null,
        phone: input.phone,
      },
      select: USER_SELECT,
    });
    return toSummary(user);
  }

  /**
   * 比照 cms User::canManage()：system_admin 帳號本身只能自己改自己（這裡進來的都已經是
   * admin/system_admin，見 controller 的 @Roles('system_admin')），其他帳號都能編。
   */
  async updateUser(actor: AuthenticatedUser, id: number, input: UpdateUserInput): Promise<UserSummary> {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', `user ${id} not found`, 404);
    }
    if (target.role === PROTECTED_ROLE && actor.id !== target.id) {
      throw new AppError('PERMISSION_DENIED', 'system_admin account can only be managed by itself', 403);
    }

    const nextRole = input.role ?? target.role;
    if (input.role) {
      this.assertAssignableRole(input.role);
    }
    this.assertRoleFieldsValid(
      nextRole,
      input.storeId ?? target.storeId ?? undefined,
      input.region ?? target.region ?? undefined,
    );

    const email = input.email?.trim();
    if (email && email !== target.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email, deletedAt: null, id: { not: id } },
      });
      if (existing) {
        throw new AppError('USER_EMAIL_EXISTS', `email ${email} already exists`, 409);
      }
    }

    if (nextRole === 'manager') {
      const storeId = input.storeId ?? target.storeId;
      if (storeId) {
        const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
        if (!store) {
          throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
        }
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        email,
        role: input.role,
        // 角色換成非 manager/dealer 時要把舊的 storeId/region 清掉，避免殘留一個跟現在角色不匹配的歸屬
        storeId: nextRole === 'manager' ? input.storeId ?? target.storeId : null,
        region: nextRole === 'dealer' ? input.region ?? target.region : null,
        phone: input.phone,
        isActive: input.isActive,
      },
      select: USER_SELECT,
    });
    return toSummary(user);
  }

  /** 管理員強制幫其他人重設密碼，不需要驗證舊密碼（自己改密碼走 AuthService.changeOwnPassword） */
  async resetPassword(actor: AuthenticatedUser, id: number, newPassword: string): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', `user ${id} not found`, 404);
    }
    if (target.role === PROTECTED_ROLE && actor.id !== target.id) {
      throw new AppError('PERMISSION_DENIED', 'system_admin account can only be managed by itself', 403);
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { password: passwordHash } });
  }

  /**
   * 軟刪除：只設 deletedAt + isActive=false，不是真的刪掉那一列——這個帳號可能簽過顧客同意書、
   * 留過聊天紀錄、動過庫存，刪掉資料列會讓那些歷史紀錄的關聯斷掉。deletedAt 一設，
   * listUsers()/login() 等查詢的 `deletedAt: null` 篩選就會自動把這個帳號當作不存在。
   * 不能刪自己（會把自己鎖在系統外面），system_admin 帳號一律不能被刪（跟 resetPassword 同一條規則）。
   */
  async deleteUser(actor: AuthenticatedUser, id: number): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', `user ${id} not found`, 404);
    }
    if (actor.id === target.id) {
      throw new AppError('USER_CANNOT_DELETE_SELF', 'cannot delete your own account', 400);
    }
    if (target.role === PROTECTED_ROLE) {
      throw new AppError('PERMISSION_DENIED', 'system_admin account cannot be deleted', 403);
    }

    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  private assertAssignableRole(role: Role) {
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new AppError('USER_ROLE_NOT_ASSIGNABLE', `role ${role} cannot be assigned via this API`, 400);
    }
  }

  /** 對齊 Version 1 的 ROLES_REQUIRING_STORE / ROLES_REQUIRING_REGION：店長必須掛店，經銷商必須掛區域 */
  private assertRoleFieldsValid(role: Role, storeId?: number, region?: Region) {
    if (role === 'manager' && !storeId) {
      throw new AppError('USER_STORE_REQUIRED', 'manager requires a storeId', 400);
    }
    if (role === 'dealer' && !region) {
      throw new AppError('USER_REGION_REQUIRED', 'dealer requires a region', 400);
    }
  }
}

function toSummary(user: UserRow): UserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    storeId: user.storeId,
    storeName: user.store?.name ?? null,
    region: user.region,
    isActive: user.isActive,
  };
}
