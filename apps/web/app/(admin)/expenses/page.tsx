'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  listPendingOutsource,
  addExpense,
  createOutsourcePayout,
  type PendingOutsourceRecord,
  type FinancialRecord,
} from '@/lib/financial-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

const PAYMENT_LABELS = [
  { value: 'cash', label: '現金（自動扣備用金）' },
  { value: 'transfer', label: '轉帳' },
  { value: 'line_pay', label: 'LINE Pay' },
  { value: 'credit_card', label: '信用卡' },
];

export default function ExpensesPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingOutsourceRecord[]>();
  const [recentExpenses, setRecentExpenses] = useState<FinancialRecord[]>();
  const [loadError, setLoadError] = useState<string>();
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState<string>();

  // 手動支出表單
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string>();
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
    void loadPending(user.storeId);
  }, []);

  async function loadPending(sid: number) {
    setLoadError(undefined);
    try {
      setPending(await listPendingOutsource(sid));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗');
    }
  }

  async function handlePayOutsource(record: PendingOutsourceRecord) {
    if (!storeId) return;
    setPayingId(record.id);
    setPayError(undefined);
    try {
      await createOutsourcePayout(storeId, record.id, payNote.trim() || undefined);
      setPayNote('');
      void loadPending(storeId);
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : '給付失敗');
    } finally {
      setPayingId(null);
    }
  }

  async function handleAddExpense() {
    if (!storeId) return;
    setFormError(undefined);
    setFormSuccess(false);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) { setFormError('金額必須為正整數'); return; }
    if (!description.trim()) { setFormError('請填寫支出說明'); return; }
    setFormSubmitting(true);
    try {
      await addExpense(storeId, { amount: amt, paymentMethod, description: description.trim() });
      setAmount('');
      setDescription('');
      setPaymentMethod('cash');
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 2500);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '新增失敗');
    } finally {
      setFormSubmitting(false);
    }
  }

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號尚未設定所屬門市，請聯絡系統管理員。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-kiosk-xl font-bold text-slate-900">支出管理</h1>

      {/* ── 外包待給付清單 ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-kiosk-lg font-bold text-slate-800">外包待給付</h2>
        {loadError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}
        {!pending && !loadError && <p className="text-kiosk-base text-slate-400">載入中…</p>}
        {pending && pending.length === 0 && (
          <p className="rounded-kiosk bg-slate-50 p-4 text-center text-kiosk-base text-slate-500">
            目前沒有待給付的外包項目
          </p>
        )}
        {pending?.map((r) => (
          <div key={r.id} className="mb-3 rounded-kiosk border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-kiosk-base font-bold text-slate-900">{r.serviceItem.name}</p>
                <p className="text-sm text-slate-600">
                  顧客：{r.customer.name}　服務人員：{r.staff.name}
                </p>
                <p className="text-sm text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString('zh-TW')}
                </p>
                {r.outsourceCost != null && (
                  <p className="mt-1 text-kiosk-base font-semibold text-amber-700">
                    外包金額：${r.outsourceCost.toLocaleString()} 元（現金）
                  </p>
                )}
              </div>
              <KioskButton
                variant="primary"
                onClick={() => void handlePayOutsource(r)}
                disabled={payingId === r.id || !r.outsourceCost}
              >
                {payingId === r.id ? '給付中…' : '確認給付'}
              </KioskButton>
            </div>
            {payError && payingId === null && (
              <p className="mt-2 text-sm font-semibold text-kiosk-danger">⚠️ {payError}</p>
            )}
          </div>
        ))}
      </section>

      {/* ── 手動新增支出 ── */}
      <section>
        <h2 className="mb-3 text-kiosk-lg font-bold text-slate-800">新增支出紀錄</h2>
        <div className="rounded-kiosk border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4">
            <KioskInput
              label="支出說明"
              required
              placeholder="例：購買清潔用品"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setFormError(undefined); }}
            />
            <KioskInput
              label="金額（元）"
              required
              type="number"
              min={1}
              placeholder="例：200"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setFormError(undefined); }}
            />
            <KioskSelect
              label="付款方式"
              required
              options={PAYMENT_LABELS}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <p className="text-sm text-slate-500">
              現金付款將自動從備用金扣除，其他方式僅記錄帳目。
            </p>
            {formError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {formError}</p>}
            {formSuccess && <p className="text-kiosk-base font-semibold text-kiosk-success">✓ 支出已記錄</p>}
            <KioskButton
              variant="primary"
              onClick={() => void handleAddExpense()}
              disabled={formSubmitting}
              fullWidth
            >
              {formSubmitting ? '記錄中…' : '確認記錄支出'}
            </KioskButton>
          </div>
        </div>
      </section>
    </div>
  );
}
