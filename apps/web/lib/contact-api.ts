import type { ContactMessageSummary, InquiryCategoryInput, InquiryCategorySummary } from '@website-v2/shared-types';
import { apiRequest } from './api-client';

/** 後台「詢問類別管理」用，只有 admin/system_admin 能呼叫 */
export function listInquiryCategories(): Promise<InquiryCategorySummary[]> {
  return apiRequest<InquiryCategorySummary[]>('/contact/admin/categories');
}

export function createInquiryCategory(input: Pick<InquiryCategoryInput, 'name' | 'kind'>): Promise<InquiryCategorySummary> {
  return apiRequest<InquiryCategorySummary>('/contact/admin/categories', { method: 'POST', json: input });
}

export function updateInquiryCategory(id: number, input: InquiryCategoryInput): Promise<InquiryCategorySummary> {
  return apiRequest<InquiryCategorySummary>(`/contact/admin/categories/${id}`, { method: 'PATCH', json: input });
}

export function deleteInquiryCategory(id: number): Promise<void> {
  return apiRequest<void>(`/contact/admin/categories/${id}`, { method: 'DELETE' });
}

/** 後台「聯絡訊息」清單：admin 看全部、dealer 看自己區域、manager 看轉給自己分店的訊息 */
export function listContactMessages(isHandled?: boolean): Promise<ContactMessageSummary[]> {
  const params = new URLSearchParams();
  if (isHandled !== undefined) params.set('isHandled', String(isHandled));
  const query = params.toString();
  return apiRequest<ContactMessageSummary[]>(`/contact/admin/messages${query ? `?${query}` : ''}`);
}

/** 經銷商把體驗諮詢轉給特定分店 */
export function forwardContactMessage(id: number, storeId: number): Promise<ContactMessageSummary> {
  return apiRequest<ContactMessageSummary>(`/contact/admin/messages/${id}/forward`, { method: 'PATCH', json: { storeId } });
}

export function markContactMessageHandled(id: number, isHandled: boolean): Promise<ContactMessageSummary> {
  return apiRequest<ContactMessageSummary>(`/contact/admin/messages/${id}/handled`, { method: 'PATCH', json: { isHandled } });
}

/** 刪除聯絡訊息，只有 admin/system_admin 能用 */
export function deleteContactMessage(id: number): Promise<void> {
  return apiRequest<void>(`/contact/admin/messages/${id}`, { method: 'DELETE' });
}
