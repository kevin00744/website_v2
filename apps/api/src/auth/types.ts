import type { Region, Role } from '@prisma/client';

/** JWT 解出來、掛在 req.user 上的身分資訊，所有 service 層的資料隔離判斷都吃這個型別 */
export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
  name: string;
  role: Role;
  storeId: number | null;
  region: Region | null;
  /** 所屬代理 ID；dealer 本身為 null，dealer 底下的 manager/staff/accountant 帶 dealer.id */
  dealerId: number | null;
  /** 登入時從 DB 即時查詢，不存進 JWT（features 會被店長即時更新）。
   * admin/system_admin 不受 features 限制（由前端 hasFeature 超集邏輯保證）。 */
  storeFeatures: Record<string, boolean> | null;
}
