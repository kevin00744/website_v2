import type {
  AdjustInventoryPayload,
  CreateRestockRequestInput,
  InventoryLogSummary,
  ProductSummary,
  RestockRequestSummary,
  StoreInventorySummary,
} from '@website-v2/shared-types';
import { apiRequest } from './api-client';

/** 不帶 storeId 時，後端 manager 預設查自己的店；admin/system_admin 一定要帶 storeId */
export function listInventory(storeId?: number): Promise<StoreInventorySummary[]> {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', String(storeId));
  const query = params.toString();
  return apiRequest<StoreInventorySummary[]>(`/inventory${query ? `?${query}` : ''}`);
}

export function adjustInventory(payload: AdjustInventoryPayload) {
  return apiRequest<{ storeInventory: StoreInventorySummary }>('/inventory/adjust', { method: 'POST', json: payload });
}

/** 顧客檔案的「商品使用紀錄」Tab 用 */
export function listInventoryLogsByCustomer(customerId: number): Promise<InventoryLogSummary[]> {
  return apiRequest<InventoryLogSummary[]>(`/inventory/customers/${customerId}/logs`);
}

/** 補貨請求選商品用的目錄 */
export function listProducts(): Promise<ProductSummary[]> {
  return apiRequest<ProductSummary[]>('/inventory/products');
}

/** 店長提出補貨請求；不帶 storeId 時後端用自己所屬分店 */
export function createRestockRequest(input: CreateRestockRequestInput): Promise<RestockRequestSummary> {
  return apiRequest<RestockRequestSummary>('/inventory/restock-requests', { method: 'POST', json: input });
}

/** manager 看自己分店；dealer 看自己區域；admin/system_admin 看全部。isCompleted 篩選待處理/已完成 */
export function listRestockRequests(isCompleted?: boolean): Promise<RestockRequestSummary[]> {
  const params = new URLSearchParams();
  if (isCompleted !== undefined) params.set('isCompleted', String(isCompleted));
  const query = params.toString();
  return apiRequest<RestockRequestSummary[]>(`/inventory/restock-requests${query ? `?${query}` : ''}`);
}

/** 經銷商補完貨後打勾標記完成 */
export function completeRestockRequest(id: number): Promise<RestockRequestSummary> {
  return apiRequest<RestockRequestSummary>(`/inventory/restock-requests/${id}/complete`, { method: 'PATCH' });
}
