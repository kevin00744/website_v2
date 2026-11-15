import type { Role } from '@prisma/client';

/** JWT 解出來、掛在 req.user 上的身分資訊，所有 service 層的資料隔離判斷都吃這個型別 */
export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  role: Role;
  storeId: number | null;
  storeFeatures: Record<string, boolean> | null;
}
