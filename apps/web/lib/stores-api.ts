import type { CreateStoreInput, StoreSummary } from '@website-v2/shared-types';
import { apiRequest } from './api-client';

/** all=true 只有 admin/system_admin 才會真的拿到停用中的分店，其他角色後端會忽略這個參數 */
export function listStores(includeInactive = false): Promise<StoreSummary[]> {
  const params = includeInactive ? '?all=true' : '';
  return apiRequest<StoreSummary[]>(`/stores${params}`);
}

export function createStore(input: CreateStoreInput): Promise<StoreSummary> {
  return apiRequest<StoreSummary>('/stores', { method: 'POST', json: input });
}

/** 更新商店基本資訊（限 admin/system_admin） */
export function updateStore(
  id: number,
  input: { name?: string; phone?: string; address?: string; note?: string },
): Promise<StoreSummary> {
  return apiRequest<StoreSummary>(`/stores/${id}`, { method: 'PATCH', json: input });
}

export function setStoreStatus(id: number, isActive: boolean): Promise<StoreSummary> {
  return apiRequest<StoreSummary>(`/stores/${id}/status`, { method: 'PATCH', json: { isActive } });
}

/** 軟刪除，只有 admin/system_admin 能用；分店底下還有顧客/員工會被擋下（STORE_HAS_DEPENDENTS） */
export function deleteStore(id: number): Promise<void> {
  return apiRequest<void>(`/stores/${id}`, { method: 'DELETE' });
}

/** 更新分店員工資訊（manager 限自己分店的 staff） */
export function updateStoreStaff(
  storeId: number,
  staffId: number,
  input: { name?: string; email?: string; isActive?: boolean },
): Promise<{ id: number; name: string; email: string; isActive: boolean }> {
  return apiRequest(`/stores/${storeId}/staff/${staffId}`, { method: 'PATCH', json: input });
}

/** 刪除分店員工 */
export function deleteStoreStaff(storeId: number, staffId: number): Promise<void> {
  return apiRequest<void>(`/stores/${storeId}/staff/${staffId}`, { method: 'DELETE' });
}

/** 更新分店功能開關，manager 限操作自己的分店 */
export function updateStoreFeatures(storeId: number, features: Record<string, boolean>): Promise<void> {
  return apiRequest<void>(`/stores/${storeId}/features`, { method: 'PATCH', json: { features } });
}

export interface StoreStaffMember {
  id: number;
  name: string;
  email: string;
  role: string;
  storeId: number | null;
  isActive: boolean;
}

/** 列出分店員工（含 staff / manager），POS 選人員用 */
export function listStoreStaff(storeId: number): Promise<StoreStaffMember[]> {
  return apiRequest<StoreStaffMember[]>(`/stores/${storeId}/staff`);
}

/** 建立分店員工帳號（role 由後端強制鎖定為 staff） */
export function createStoreStaff(
  storeId: number,
  input: { name: string; email: string; password: string },
): Promise<StoreStaffMember> {
  return apiRequest<StoreStaffMember>(`/stores/${storeId}/staff`, { method: 'POST', json: input });
}
