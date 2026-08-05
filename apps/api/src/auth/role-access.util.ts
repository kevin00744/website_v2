import type { Prisma, Region, Role } from '@prisma/client';
import type { AuthenticatedUser } from './types';

const ADMIN_ROLES: Role[] = ['system_admin', 'admin'];

/** admin 超集邏輯：system_admin / admin 不受區域/分店限制 */
export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * 顧客存取權限判斷：
 * - system_admin / admin：全部
 * - dealer / general_agent：自己負責的區域
 * - manager / staff / accountant：自己所屬的分店
 */
export function canActorAccessCustomer(
  actor: AuthenticatedUser,
  customer: { storeId: number; storeRegion: Region },
): boolean {
  if (isAdminRole(actor.role)) return true;
  if (actor.role === 'dealer' || actor.role === 'general_agent') return customer.storeRegion === actor.region;
  if (actor.role === 'manager' || actor.role === 'staff' || actor.role === 'accountant') {
    return actor.storeId !== null && customer.storeId === actor.storeId;
  }
  return false;
}

/**
 * 顧客查詢條件生成：Prisma where 子句，讓 DB 層就做資料隔離，不只靠 UI 守門。
 */
export function customerVisibilityWhere(actor: AuthenticatedUser): Prisma.CustomerWhereInput {
  if (isAdminRole(actor.role)) return {};
  if (actor.role === 'dealer' || actor.role === 'general_agent') return { store: { region: actor.region ?? undefined } };
  if (actor.role === 'manager' || actor.role === 'staff' || actor.role === 'accountant') {
    return { storeId: actor.storeId ?? -1 };
  }
  return { id: -1 };
}
