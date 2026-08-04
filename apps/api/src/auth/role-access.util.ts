import type { Prisma, Region, Role } from '@prisma/client';
import type { AuthenticatedUser } from './types';

const ADMIN_ROLES: Role[] = ['system_admin', 'admin'];

/** 沿用 Version 1（cms）User::isAdmin()：system_admin 視為 admin 的超集，不受區域/分店限制 */
export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * 沿用 Version 1 User::canViewCustomer()：
 * 管理員看全部，經銷商限自己區域，店長限自己分店，其他角色（如 editor）一律看不到。
 */
export function canActorAccessCustomer(
  actor: AuthenticatedUser,
  customer: { storeId: number; storeRegion: Region },
): boolean {
  if (isAdminRole(actor.role)) return true;
  if (actor.role === 'dealer') return customer.storeRegion === actor.region;
  if (actor.role === 'manager') return actor.storeId !== null && customer.storeId === actor.storeId;
  // staff 限自己所屬分店（POS 結帳、使用紀錄等操作）
  if (actor.role === 'staff') return actor.storeId !== null && customer.storeId === actor.storeId;
  return false;
}

/**
 * 沿用 Version 1 User::visibleCustomersQuery()：回傳 Prisma where 條件做查詢層級的資料隔離，
 * 跟 controller 上的 @Roles guard 是雙重防護，不是只靠前端隱藏 UI 或單靠路由守門。
 */
export function customerVisibilityWhere(actor: AuthenticatedUser): Prisma.CustomerWhereInput {
  if (isAdminRole(actor.role)) return {};
  if (actor.role === 'dealer') return { store: { region: actor.region ?? undefined } };
  if (actor.role === 'manager') return { storeId: actor.storeId ?? -1 };
  if (actor.role === 'staff') return { storeId: actor.storeId ?? -1 };
  return { id: -1 };
}
