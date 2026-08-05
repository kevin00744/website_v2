import { apiRequest } from './api-client';

export interface ServiceItemSummary {
  id: number;
  name: string;
  price: number;
  isOutsourced: boolean;
  storeId: number | null;
}

export interface StoreStaffSummary {
  id: number;
  name: string;
  role: string;
}

export type ConsumptionType = 'single_purchase' | 'wallet_deduction' | 'course_deduction';
export type PaymentMethod = 'cash' | 'transfer' | 'line_pay' | 'credit_card';

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
}

export interface CreateServiceRecordInput {
  customerId: number;
  staffId?: number;
  serviceItemId: number;
  consumptionType: ConsumptionType;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
  payments?: PaymentEntry[];
  sessionsDeducted?: number;
  customerSignatureUrl?: string;
  note?: string;
  customerCourseId?: number;
}

export interface ServiceRecordResult {
  id: number;
  customer: { id: number; name: string };
  staff: { id: number; name: string };
  serviceItem: { id: number; name: string; price: number };
  storeId: number;
  consumptionType: ConsumptionType;
  amountPaid: number | null;
  sessionsDeducted: number | null;
  customerSignatureUrl: string | null;
  note: string | null;
  createdAt: string;
}

export function listServiceItems(storeId: number): Promise<ServiceItemSummary[]> {
  return apiRequest<ServiceItemSummary[]>(`/service-items?storeId=${storeId}`);
}

export function listStoreStaff(storeId: number): Promise<StoreStaffSummary[]> {
  return apiRequest<StoreStaffSummary[]>(`/stores/${storeId}/staff`);
}

export function listServiceRecordsByCustomer(
  storeId: number,
  customerId: number,
): Promise<ServiceRecordResult[]> {
  return apiRequest<ServiceRecordResult[]>(`/stores/${storeId}/service-records/by-customer/${customerId}`);
}

export function listServiceRecordsByStaff(
  storeId: number,
  staffId: number,
  params?: { from?: string; to?: string },
): Promise<ServiceRecordResult[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiRequest<ServiceRecordResult[]>(`/stores/${storeId}/service-records/by-staff/${staffId}${q ? `?${q}` : ''}`);
}

export function createServiceRecord(storeId: number, dto: CreateServiceRecordInput): Promise<ServiceRecordResult> {
  return apiRequest<ServiceRecordResult>(`/stores/${storeId}/service-records`, {
    method: 'POST',
    json: dto,
  });
}
