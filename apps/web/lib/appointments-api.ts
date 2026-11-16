import { apiRequest } from './api-client';

export type AppointmentStatus = 'booked' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: number;
  storeId: number;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  serviceItemId: number | null;
  serviceItem: { id: number; name: string; price: number } | null;
  staffId: number | null;
  staff: { id: number; name: string } | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  /** line = 顧客從 LINE 送出的申請（測試期只有 system_admin 會拿到這種資料） */
  source: 'staff' | 'line';
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; name: string };
}

export interface AppointmentInput {
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string | null;
  serviceItemId?: number | null;
  staffId?: number | null;
  startAt?: string;
  endAt?: string;
  status?: AppointmentStatus;
  note?: string | null;
  allowOverlap?: boolean;
}

export const STATUS_META: Record<AppointmentStatus, { label: string; pill: string; dot: string }> = {
  booked: { label: '已預約', pill: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  confirmed: { label: '已確認', pill: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  arrived: { label: '已報到', pill: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  completed: { label: '已完成', pill: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  cancelled: { label: '已取消', pill: 'bg-slate-200 text-slate-600', dot: 'bg-slate-400' },
  no_show: { label: '未到', pill: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export function listAppointments(storeId: number, from: Date, to: Date): Promise<Appointment[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return apiRequest<Appointment[]>(`/stores/${storeId}/appointments?${params.toString()}`);
}

/** 顧客最近 50 筆預約（新到舊），預約表單「沿用上次」用 */
export function listCustomerAppointments(storeId: number, customerId: number): Promise<Appointment[]> {
  return apiRequest<Appointment[]>(`/stores/${storeId}/appointments?customerId=${customerId}`);
}

export function createAppointment(storeId: number, input: AppointmentInput): Promise<Appointment> {
  return apiRequest<Appointment>(`/stores/${storeId}/appointments`, { method: 'POST', json: input });
}

export function updateAppointment(storeId: number, id: number, input: AppointmentInput): Promise<Appointment> {
  return apiRequest<Appointment>(`/stores/${storeId}/appointments/${id}`, { method: 'PATCH', json: input });
}

export function deleteAppointment(storeId: number, id: number): Promise<void> {
  return apiRequest<void>(`/stores/${storeId}/appointments/${id}`, { method: 'DELETE' });
}
