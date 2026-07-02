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

export function setStoreStatus(id: number, isActive: boolean): Promise<StoreSummary> {
  return apiRequest<StoreSummary>(`/stores/${id}/status`, { method: 'PATCH', json: { isActive } });
}

/** 軟刪除，只有 admin/system_admin 能用；分店底下還有顧客/員工會被擋下（STORE_HAS_DEPENDENTS） */
export function deleteStore(id: number): Promise<void> {
  return apiRequest<void>(`/stores/${id}`, { method: 'DELETE' });
}
