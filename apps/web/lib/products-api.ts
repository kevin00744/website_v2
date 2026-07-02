import type { CreateProductInput, ProductAdminSummary, UpdateProductInput } from '@website-v2/shared-types';
import { apiRequest } from './api-client';

/** 商品管理頁面用，只有 admin/system_admin 能呼叫；跟 inventory-api.ts 的 listProducts（補貨請求選商品用，只回啟用中商品）是兩支不同端點 */
export function listProductsForAdmin(): Promise<ProductAdminSummary[]> {
  return apiRequest<ProductAdminSummary[]>('/products');
}

export function createProduct(input: CreateProductInput): Promise<ProductAdminSummary> {
  return apiRequest<ProductAdminSummary>('/products', { method: 'POST', json: input });
}

export function updateProduct(id: number, input: UpdateProductInput): Promise<ProductAdminSummary> {
  return apiRequest<ProductAdminSummary>(`/products/${id}`, { method: 'PATCH', json: input });
}

/** 軟刪除（後端設 deletedAt + isActive=false） */
export function deleteProduct(id: number): Promise<void> {
  return apiRequest<void>(`/products/${id}`, { method: 'DELETE' });
}
