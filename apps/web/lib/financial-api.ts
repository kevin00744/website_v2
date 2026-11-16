import { apiRequest, apiRequestBlob } from './api-client';

export type FinancialCategory = 'sales' | 'top_up' | 'outsource_payout' | 'daily_expense' | 'petty_cash_replenish';
export type FinancialRecordType = 'income' | 'expense';

export interface FinancialRecord {
  id: number;
  type: FinancialRecordType;
  category: FinancialCategory;
  amount: number;
  paymentMethod: string;
  performedBy: { id: number; name: string };
  description: string | null;
  createdAt: string;
}

export interface DailyBalance {
  storeName: string;
  pettyCashBalance: number;
  todayIncome: number;
  todayExpense: number;
  todayNet: number;
  records: FinancialRecord[];
}

export function getDailyBalance(storeId: number): Promise<DailyBalance> {
  return apiRequest<DailyBalance>(`/financial/stores/${storeId}/daily-balance`);
}

export function listFinancialRecords(
  storeId: number,
  params?: { from?: string; to?: string; category?: string; type?: string; staffId?: string },
): Promise<FinancialRecord[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.category) qs.set('category', params.category);
  if (params?.type) qs.set('type', params.type);
  if (params?.staffId) qs.set('staffId', params.staffId);
  const q = qs.toString();
  return apiRequest<FinancialRecord[]>(`/financial/stores/${storeId}/records${q ? `?${q}` : ''}`);
}

/** 下載 CSV（繞過 apiRequest，直接用 fetch + Blob 觸發下載） */
export async function downloadFinancialCsv(storeId: number, from: string, to: string): Promise<void> {
  // 走 apiRequestBlob：token 過期時會自動換新再重試
  const blob = await apiRequestBlob(`/financial/stores/${storeId}/export-csv?from=${from}&to=${to}`);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `financial_${storeId}_${from}_${to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export interface PendingOutsourceRecord {
  id: number;
  serviceItem: { id: number; name: string; outsourceCost: number | null };
  customer: { id: number; name: string };
  staff: { id: number; name: string };
  outsourceCost: number | null;
  createdAt: string;
}

export function listPendingOutsource(storeId: number): Promise<PendingOutsourceRecord[]> {
  return apiRequest<PendingOutsourceRecord[]>(`/financial/stores/${storeId}/pending-outsource`);
}

export function adjustPettyCash(
  storeId: number,
  dto: { action: 'add' | 'remove'; amount: number; note?: string },
): Promise<FinancialRecord & { pettyCashBalanceAfter: number }> {
  return apiRequest(`/financial/stores/${storeId}/petty-cash`, { method: 'POST', json: dto });
}

export function addExpense(
  storeId: number,
  dto: { amount: number; paymentMethod: string; description?: string; note?: string },
): Promise<FinancialRecord> {
  return apiRequest(`/financial/stores/${storeId}/expenses`, { method: 'POST', json: dto });
}

export function createOutsourcePayout(
  storeId: number,
  serviceRecordId: number,
  note?: string,
): Promise<{ financialRecordId: number; amount: number; serviceItemName: string; pettyCashBalanceAfter: number }> {
  return apiRequest(`/financial/stores/${storeId}/outsource-payout`, {
    method: 'POST',
    json: { serviceRecordId, note },
  });
}
