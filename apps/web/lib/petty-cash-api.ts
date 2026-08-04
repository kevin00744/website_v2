import { apiRequest } from './api-client';

export type PettyCashAction = 'add' | 'remove' | 'outsource_deduct' | 'expense_deduct';

export interface PettyCashLog {
  id: number;
  action: PettyCashAction;
  amount: number;
  balanceAfter: number;
  note: string | null;
  performedBy: { id: number; name: string };
  createdAt: string;
}

export interface PettyCashBalance {
  storeId: number;
  storeName: string;
  balance: number;
}

export function getPettyCashBalance(storeId: number): Promise<PettyCashBalance> {
  return apiRequest<PettyCashBalance>(`/stores/${storeId}/petty-cash/balance`);
}

export function listPettyCashLogs(
  storeId: number,
  params?: { from?: string; to?: string },
): Promise<PettyCashLog[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiRequest<PettyCashLog[]>(`/stores/${storeId}/petty-cash/logs${q ? `?${q}` : ''}`);
}

export function adjustPettyCash(
  storeId: number,
  dto: { action: 'add' | 'remove'; amount: number; note?: string },
): Promise<PettyCashLog & { balanceAfter: number }> {
  return apiRequest(`/stores/${storeId}/petty-cash/adjust`, { method: 'POST', json: dto });
}

export const ACTION_LABEL: Record<PettyCashAction, string> = {
  add: '補充',
  remove: '移除',
  outsource_deduct: '外包扣款',
  expense_deduct: '支出扣款',
};

export const ACTION_COLOR: Record<PettyCashAction, string> = {
  add: 'bg-green-100 text-green-700',
  remove: 'bg-red-100 text-red-700',
  outsource_deduct: 'bg-orange-100 text-orange-700',
  expense_deduct: 'bg-amber-100 text-amber-700',
};
