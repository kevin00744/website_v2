'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  contentSummary,
  kindLabel,
  listCustomerTransactions,
  type CustomerTransaction,
} from '@/lib/customer-transactions-api';
import { TransactionDetailModal } from './TransactionDetailModal';

interface Props {
  customerId: number;
  /** 只有系統管理員可以刪除 */
  canDelete: boolean;
  /** 刪除後通知父層重新整理顧客資料（堂數、儲值金） */
  onChanged?: () => void;
  /** 重新載入用（例如 POS 結帳完成後） */
  refreshKey?: number;
}

/** 顧客資料頁「交易紀錄」分頁：POS 結帳 / 購買方案 / 直接儲值，含已刪除的紀錄 */
export function TransactionsTab({ customerId, canDelete, onChanged, refreshKey }: Props) {
  const [items, setItems] = useState<CustomerTransaction[]>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<CustomerTransaction | null>(null);
  const [showDeleted, setShowDeleted] = useState(true);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setItems(await listCustomerTransactions(customerId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '載入交易紀錄失敗');
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (error) return <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>;
  if (!items) return <p className="text-kiosk-base text-slate-500">載入中…</p>;

  const deletedCount = items.filter((t) => t.deletedAt).length;
  const visible = showDeleted ? items : items.filter((t) => !t.deletedAt);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">共 {items.length} 筆{deletedCount ? `，其中 ${deletedCount} 筆已刪除` : ''}</p>
        {deletedCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="h-5 w-5 accent-teal-700" />
            顯示已刪除
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-kiosk bg-slate-50 p-6 text-center text-kiosk-base text-slate-500">尚無交易紀錄</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((t) => {
            const k = kindLabel(t);
            const adjusted = t.amount !== t.listAmount || t.logs.some((l) => l.action === 'create' && l.detail?.adjusted);
            const deleted = Boolean(t.deletedAt);
            const isCourse = t.service?.consumptionType === 'course_deduction';
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  className={`flex w-full items-center gap-3 rounded-kiosk border-2 p-4 text-left transition-colors hover:border-kiosk-primary/40 ${
                    deleted ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="w-20 shrink-0 text-sm tabular-nums text-slate-600">
                    {new Date(t.createdAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                    <br />
                    {new Date(t.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                  <div className={`min-w-0 flex-1 ${deleted ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${k.className}`}>{k.text}</span>
                      {deleted && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-sm font-bold text-rose-700">已刪除</span>}
                      {adjusted && !deleted && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-bold text-amber-800">已調整</span>}
                      {t.legacy && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-sm font-bold text-slate-600">舊紀錄</span>}
                    </div>
                    <p className={`mt-1 truncate text-kiosk-base font-semibold text-slate-900 ${deleted ? 'line-through' : ''}`}>
                      {contentSummary(t)}
                    </p>
                    <p className="text-sm text-slate-600">
                      經手：{t.staff.name}
                      {t.adjustNote ? `｜${t.adjustNote}` : ''}
                    </p>
                  </div>
                  {!isCourse && (
                    <div className={`shrink-0 text-right ${deleted ? 'opacity-60' : ''}`}>
                      <p className={`text-kiosk-lg font-bold tabular-nums text-slate-900 ${deleted ? 'line-through' : ''}`}>
                        ${t.amount.toLocaleString()}
                      </p>
                      {t.amount !== t.listAmount && (
                        <p className="text-sm tabular-nums text-slate-500 line-through">${t.listAmount.toLocaleString()}</p>
                      )}
                    </div>
                  )}
                  <span className="shrink-0 text-xl text-slate-400" aria-hidden>›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <TransactionDetailModal
          transaction={selected}
          canDelete={canDelete}
          onClose={() => setSelected(null)}
          onDeleted={(t) => {
            setItems((prev) => prev?.map((p) => (p.id === t.id ? t : p)));
            setSelected(t);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
