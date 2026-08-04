import { apiRequest } from './api-client';

export interface StoreServiceItem {
  id: number;
  storeId: number | null;
  name: string;
  price: number;
  isOutsourced: boolean;
  outsourceCost: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateStoreServiceItemInput {
  name: string;
  price: number;
  isOutsourced?: boolean;
  outsourceCost?: number;
}

/** 分店自己建立的品項列表（不含全域通用項目） */
export function listStoreServiceItems(storeId: number): Promise<StoreServiceItem[]> {
  return apiRequest<StoreServiceItem[]>(`/stores/${storeId}/service-items`);
}

/** 建立分店品項（manager 操作時 storeId 鎖定為自己的分店） */
export function createStoreServiceItem(
  storeId: number,
  input: CreateStoreServiceItemInput,
): Promise<StoreServiceItem> {
  return apiRequest<StoreServiceItem>(`/stores/${storeId}/service-items`, { method: 'POST', json: input });
}

/** 更新分店品項 */
export function updateStoreServiceItem(
  storeId: number,
  itemId: number,
  input: Partial<CreateStoreServiceItemInput>,
): Promise<StoreServiceItem> {
  return apiRequest<StoreServiceItem>(`/stores/${storeId}/service-items/${itemId}`, {
    method: 'PATCH',
    json: input,
  });
}

/** 下架（軟刪除）分店品項 */
export function deactivateStoreServiceItem(storeId: number, itemId: number): Promise<void> {
  return apiRequest<void>(`/stores/${storeId}/service-items/${itemId}`, { method: 'DELETE' });
}
