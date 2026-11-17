'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  PAYMENT_LABEL,
  contentSummary,
  deleteTransaction,
  kindLabel,
  previewDeleteTransaction,
  reversalText,
  type CustomerTransaction,
  type ReversalSummary,
} from '@/lib/customer-transactions-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';

interface Props {
  transaction: CustomerTransaction;
  canDelete: boolean;
  onClose: () => void;
  onDeleted: (t: CustomerTransaction) => void;
}

const REASON_PICKS = ['重複結帳', '輸入錯誤', '顧客取消', '退款'];

function fmt(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function TransactionDetailModal({ transaction: t, canDelete, onClose, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<ReversalSummary>();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const k = kindLabel(t);
  const isCourse = t.service?.consumptionType === 'course_deduction';
  const original = t.planOriginal;
  const actual = t.planActual;

  async function startDelete() {
    setError(undefined);
    setBusy(true);
    try {
      const r = await previewDeleteTransaction(t.id);
      setPreview(r.summary);
      setConfirming(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '無法刪除，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!reason.trim()) return setError('請填寫刪除原因');
    setError(undefined);
    setBusy(true);
    try {
      onDeleted(await deleteTransaction(t.id, reason.trim()));
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '刪除失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredModal open onClose={onClose} title="交易明細" maxWidthClassName="md:max-w-2xl" closeOnOverlayClick={!confirming}>
      <div className="flex flex-1 flex-col gap-5">
        {/* 標題 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${k.className}`}>{k.text}</span>
          {t.deletedAt && <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700">已刪除</span>}
          <span className="text-sm text-slate-600">#{t.id}・{fmt(t.createdAt)}・經手 {t.staff.name}</span>
        </div>
        <p className={`text-kiosk-lg font-bold text-slate-900 ${t.deletedAt ? 'line-through opacity-60' : ''}`}>{contentSummary(t)}</p>

        {/* 金額 */}
        {!isCourse && (
          <div className="grid grid-cols-2 gap-3 rounded-kiosk bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-600">{t.kind === 'refund' || t.kind === 'refund_to_credit' ? '試算' : '原價'}</p>
              <p className="text-xl font-bold tabular-nums text-slate-700">${t.listAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">{t.kind === 'refund' ? '實退' : t.kind === 'refund_to_credit' ? '轉入儲值金' : t.service?.consumptionType === 'wallet_deduction' ? '實扣儲值金' : '實收'}</p>
              <p className="text-xl font-bold tabular-nums text-kiosk-primary">${t.amount.toLocaleString()}</p>
            </div>
            {(t.payments?.length ?? 0) > 0 ? (
              <p className="col-span-2 text-sm text-slate-600">
                付款：{t.payments!.map((p) => `${PAYMENT_LABEL[p.method] ?? p.method} $${p.amount.toLocaleString()}`).join(' ＋ ')}
              </p>
            ) : t.paymentMethod ? (
              <p className="col-span-2 text-sm text-slate-600">付款：{PAYMENT_LABEL[t.paymentMethod] ?? t.paymentMethod}</p>
            ) : null}
          </div>
        )}

        {/* 方案：原方案 vs 實際成交 */}
        {actual && (
          <div className="overflow-hidden rounded-kiosk border border-slate-200">
            <table className="w-full text-left text-base">
              <thead className="bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">項目</th>
                  <th className="px-4 py-2 text-right font-semibold">原方案</th>
                  <th className="px-4 py-2 text-right font-semibold">實際成交</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <Row
                  label="金額"
                  a={`$${(original?.price ?? t.listAmount ?? 0).toLocaleString()}`}
                  b={`$${(actual.price ?? t.amount ?? 0).toLocaleString()}`}
                />
                {actual.type === 'top_up_bonus' && (
                  <Row label="贈送儲值金" a={`$${(original?.bonusAmount ?? 0).toLocaleString()}`} b={`$${(actual.bonusAmount ?? 0).toLocaleString()}`} />
                )}
                {(actual.items ?? []).map((i) => {
                  const o = original?.items?.find((x) => x.serviceItemId === i.serviceItemId);
                  return <Row key={i.serviceItemId} label={i.name} a={`${o?.sessions ?? '—'} 堂`} b={`${i.sessions} 堂`} />;
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 歷程 */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">歷程</p>
          {t.logs.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">系統上線前的舊紀錄，沒有建立歷程。</p>
          )}
          <ol className="relative flex flex-col gap-4 border-l-2 border-slate-200 pl-5" hidden={t.logs.length === 0}>
            {t.logs.map((l) => {
              const isDelete = l.action === 'delete';
              const lines = isDelete && l.detail ? reversalText(l.detail) : [];
              return (
                <li key={l.id} className="relative">
                  <span className={`absolute -left-[1.6rem] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white ${isDelete ? 'bg-rose-500' : 'bg-kiosk-primary'}`} />
                  <p className="text-base font-semibold text-slate-900">
                    {fmt(l.createdAt)}　{l.operator.name}　{isDelete ? '刪除並回溯' : '建立'}
                  </p>
                  {!isDelete &&
                    typeof l.detail?.listAmount === 'number' &&
                    typeof l.detail?.amount === 'number' &&
                    l.detail.amount !== l.detail.listAmount && (
                      <p className="text-sm text-slate-700">
                        {t.kind === 'refund' || t.kind === 'refund_to_credit' ? '試算' : '原價'} ${l.detail.listAmount.toLocaleString()} → {t.kind === 'refund' ? '實退' : t.kind === 'refund_to_credit' ? '轉入' : '實收'} ${l.detail.amount.toLocaleString()}
                      </p>
                    )}
                  {l.reason && <p className="text-sm text-slate-700">{isDelete ? '原因' : '備註'}：{l.reason}</p>}
                  {lines.length > 0 && <p className="text-sm font-semibold text-rose-700">已回溯：{lines.join('、')}</p>}
                </li>
              );
            })}
          </ol>
        </div>

        {t.legacy && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">這是系統上線前的舊紀錄，只能查看，無法自動回溯刪除。</p>
        )}

        {/* 刪除確認 */}
        {confirming && preview && (
          <div className="flex flex-col gap-3 rounded-kiosk border-2 border-rose-200 bg-rose-50 p-4">
            <p className="text-base font-bold text-rose-800">刪除後會自動回溯：</p>
            <ul className="list-inside list-disc text-base text-rose-900">
              {reversalText(preview).map((x) => <li key={x}>{x}</li>)}
              {reversalText(preview).length === 0 && <li>沒有需要回溯的金額或堂數</li>}
            </ul>
            <p className="text-sm text-rose-800">顧客資料和財務帳務會立即更正；紀錄本身保留在這裡並標示已刪除。</p>
            <div className="flex flex-wrap gap-2">
              {REASON_PICKS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`min-h-[2.75rem] rounded-full border-2 px-4 text-sm font-bold ${reason === r ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-200 bg-white text-rose-800'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="刪除原因（必填）"
              className="h-12 rounded-kiosk border-2 border-rose-200 bg-white px-4 text-base outline-none focus:border-rose-500"
            />
          </div>
        )}

        {error && <p className="text-base font-semibold text-kiosk-danger" role="alert">⚠️ {error}</p>}

        <div className="mt-auto flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
          {confirming ? (
            <>
              <KioskButton variant="ghost" onClick={() => { setConfirming(false); setError(undefined); }} disabled={busy}>
                取消
              </KioskButton>
              <KioskButton variant="danger" onClick={() => void confirmDelete()} disabled={busy}>
                {busy ? '處理中…' : '確認刪除並回溯'}
              </KioskButton>
            </>
          ) : (
            <>
              {canDelete && !t.deletedAt && !t.legacy && (
                <KioskButton variant="danger" onClick={() => void startDelete()} disabled={busy}>
                  {busy ? '檢查中…' : '刪除紀錄'}
                </KioskButton>
              )}
              <KioskButton variant="secondary" onClick={onClose}>
                關閉
              </KioskButton>
            </>
          )}
        </div>
      </div>
    </CenteredModal>
  );
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  const changed = a !== b;
  return (
    <tr>
      <td className="px-4 py-2.5 font-semibold text-slate-800">{label}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums ${changed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{a}</td>
      <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${changed ? 'text-amber-700' : 'text-slate-900'}`}>{b}</td>
    </tr>
  );
}
