import { apiRequest } from './api-client';

/** 後台「LINE」頁 API（除了會計以外都能用；status 只有 system_admin） */

export interface LineStatus {
  enabled: boolean;
  storeId: number | null;
  liffId: string | null;
  hasChannelSecret: boolean;
  hasChannelAccessToken: boolean;
  hasLoginChannelId: boolean;
  hasPublicOrigin: boolean;
}

export interface LineAccountItem {
  id: number;
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  createdAt: string;
  customer: { id: number; name: string; phone: string | null; customerCode: string | null; deleted: boolean };
}

export interface LineBinding {
  bound: boolean;
  account: { id: number; displayName: string; pictureUrl: string | null; createdAt: string } | null;
}

export interface LinePendingAppointment {
  id: number;
  storeId: number;
  customerName: string;
  customerPhone: string | null;
  startAt: string;
  endAt: string;
  status: string;
  note: string | null;
  createdAt: string;
  serviceItem: { id: number; name: string } | null;
  staff: { id: number; name: string } | null;
}

export interface SlotSettings {
  defaultDurationMin: number;
  firstSlot: string;
  lastSlot: string;
  slotIntervalMin: number;
}

export interface BookingSettingItem {
  serviceItemId: number;
  name: string;
  price: number;
  enabled: boolean;
  durationMin: number;
  sortOrder: number;
}

export interface BookingSettings extends SlotSettings {
  items: BookingSettingItem[];
}

export const getLineStatus = () => apiRequest<LineStatus>('/line/admin/status');
export const listLineAccounts = () => apiRequest<LineAccountItem[]>('/line/admin/accounts');
export const unbindLineAccount = (id: number) => apiRequest<void>(`/line/admin/accounts/${id}`, { method: 'DELETE' });
export const getCustomerLineBinding = (customerId: number) =>
  apiRequest<LineBinding>(`/line/admin/customers/${customerId}/binding`);
export const listLinePendingAppointments = () => apiRequest<LinePendingAppointment[]>('/line/admin/pending-appointments');

export const getBookingSettings = () => apiRequest<BookingSettings>('/line/admin/booking-settings');
export const saveBookingSettings = (
  input: SlotSettings & { items: Array<{ serviceItemId: number; durationMin: number; sortOrder: number }> },
) => apiRequest<BookingSettings>('/line/admin/booking-settings', { method: 'PUT', json: input });

/** 推播文字＋（選填）圖片給已綁定帳號；圖片 jpg/png、1MB 以內 */
export function pushToLineAccount(accountId: number, text: string, image?: File | null) {
  const form = new FormData();
  form.append('accountId', String(accountId));
  if (text.trim()) form.append('text', text.trim());
  if (image) form.append('image', image);
  return apiRequest<{ ok: true }>('/line/admin/push', { method: 'POST', formData: form });
}
