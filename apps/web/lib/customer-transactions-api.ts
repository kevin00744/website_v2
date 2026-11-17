import { apiRequest } from './api-client';

export type TransactionKind = 'service' | 'plan_purchase' | 'top_up' | 'refund' | 'refund_to_credit';

export interface PlanSnapshot {
  name: string;
  type: 'course_bundle' | 'top_up_bonus';
  /** 舊紀錄（系統上線前補建）可能沒有 price，使用處一律退回交易金額 */
  price?: number;
  bonusAmount?: number | null;
  items: Array<{ serviceItemId: number; name: string; sessions: number }>;
}

export interface ReversalSummary {
  income: number;
  expense: number;
  pettyCash: number;
  walletBalance: number;
  walletBonus: number;
  sessionsVoided: number;
  sessionsRestored: number;
}

export interface TransactionLog {
  id: number;
  action: 'create' | 'delete';
  operator: { id: number; name: string };
  reason: string | null;
  detail: (Partial<ReversalSummary> & { amount?: number; listAmount?: number; adjusted?: boolean }) | null;
  createdAt: string;
}

export interface CustomerTransaction {
  id: number;
  kind: TransactionKind;
  amount: number;
  listAmount: number;
  paymentMethod: string | null;
  payments: Array<{ method: string; amount: number }> | null;
  adjustNote: string | null;
  note: string | null;
  planOriginal: PlanSnapshot | null;
  planActual: PlanSnapshot | null;
  legacy: boolean;
  service: {
    consumptionType: 'single_purchase' | 'wallet_deduction' | 'course_deduction';
    sessionsDeducted: number | null;
    serviceItem: { id: number; name: string };
  } | null;
  staff: { id: number; name: string };
  createdAt: string;
  deletedAt: string | null;
  deletedBy: { id: number; name: string } | null;
  deleteReason: string | null;
  logs: TransactionLog[];
}

export function listCustomerTransactions(customerId: number): Promise<CustomerTransaction[]> {
  return apiRequest<CustomerTransaction[]>(`/customers/${customerId}/transactions`);
}

export function previewDeleteTransaction(id: number): Promise<{ summary: ReversalSummary }> {
  return apiRequest<{ summary: ReversalSummary }>(`/customer-transactions/${id}/delete-preview`);
}

export function deleteTransaction(id: number, reason: string): Promise<CustomerTransaction> {
  return apiRequest<CustomerTransaction>(`/customer-transactions/${id}`, { method: 'DELETE', json: { reason } });
}

// ── 顯示用 ──────────────────────────────────────────────

export const PAYMENT_LABEL: Record<string, string> = {
  cash: '現金',
  transfer: '轉帳',
  line_pay: 'LINE Pay',
  credit_card: '信用卡',
};

export function kindLabel(t: CustomerTransaction): { text: string; className: string } {
  if (t.kind === 'top_up') return { text: '儲值', className: 'bg-sky-100 text-sky-800' };
  if (t.kind === 'refund') return { text: '退費', className: 'bg-rose-100 text-rose-800' };
  if (t.kind === 'refund_to_credit') return { text: '轉儲值', className: 'bg-amber-100 text-amber-800' };
  if (t.kind === 'plan_purchase') return { text: '方案', className: 'bg-violet-100 text-violet-800' };
  const ct = t.service?.consumptionType;
  if (ct === 'wallet_deduction') return { text: '扣儲值', className: 'bg-blue-100 text-blue-800' };
  if (ct === 'course_deduction') return { text: '扣堂', className: 'bg-emerald-100 text-emerald-800' };
  return { text: 'POS', className: 'bg-teal-100 text-teal-800' };
}

/** 一行內容摘要，例如「保養10堂：臉部保養 12 堂（原 10）」 */
export function contentSummary(t: CustomerTransaction): string {
  if (t.kind === 'top_up') return '直接儲值';
  if (t.kind === 'refund' || t.kind === 'refund_to_credit') return t.note ?? (t.kind === 'refund' ? '課程退費' : '退課轉儲值');
  if (t.kind === 'plan_purchase') {
    const actual = t.planActual;
    if (!actual) return '購買方案';
    if (actual.type === 'top_up_bonus') {
      const ob = t.planOriginal?.bonusAmount ?? 0;
      const ab = actual.bonusAmount ?? 0;
      return `${actual.name}：贈 $${ab.toLocaleString()}${ab !== ob ? `（原 $${ob.toLocaleString()}）` : ''}`;
    }
    const parts = (actual.items ?? []).map((i) => {
      const o = t.planOriginal?.items?.find((x) => x.serviceItemId === i.serviceItemId);
      return `${i.name} ${i.sessions} 堂${o && o.sessions !== i.sessions ? `（原 ${o.sessions}）` : ''}`;
    });
    return `${actual.name}：${parts.join('、')}`;
  }
  const s = t.service;
  if (!s) return 'POS 結帳';
  if (s.consumptionType === 'course_deduction') return `${s.serviceItem.name} 扣 ${s.sessionsDeducted ?? 1} 堂`;
  return s.serviceItem.name;
}

export function reversalText(r: Partial<ReversalSummary>): string[] {
  const out: string[] = [];
  const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toLocaleString()}`;
  if (r.sessionsVoided) out.push(`顧客堂數 −${r.sessionsVoided}`);
  if (r.sessionsRestored) out.push(`退回 ${r.sessionsRestored} 堂`);
  if (r.walletBalance) out.push(`儲值金本金 ${money(r.walletBalance)}`);
  if (r.walletBonus) out.push(`贈送金 ${money(r.walletBonus)}`);
  if (r.income) out.push(`財務收入 ${money(r.income)}`);
  if (r.expense) out.push(`財務支出 ${money(r.expense)}`);
  if (r.pettyCash) out.push(`現金備用金 ${money(r.pettyCash)}`);
  return out;
}
