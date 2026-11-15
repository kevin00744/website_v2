import type { Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from './types';

const ADMIN_ROLES: Role[] = ['system_admin', 'admin'];

/** admin 超集邏輯：system_admin / admin 不受分店限制 */
export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * 顧客存取權限判斷：
 * - system_admin / admin：全部
 * - manager / staff：自己所屬的分店
 */
export function canActorAccessCustomer(
  actor: AuthenticatedUser,
  customer: { storeId: number },
): boolean {
  if (isAdminRole(actor.role)) return true;
  if (actor.role === 'manager' || actor.role === 'staff') {
    return actor.storeId !== null && customer.storeId === actor.storeId;
  }
  return false;
}

/**
 * 顧客查詢條件生成：Prisma where 子句，讓 DB 層就做資料隔離。
 */
export function customerVisibilityWhere(actor: AuthenticatedUser): Prisma.CustomerWhereInput {
  if (isAdminRole(actor.role)) return {};
  if (actor.role === 'manager' || actor.role === 'staff') {
    return { storeId: actor.storeId ?? -1 };
  }
  return { id: -1 };
}
