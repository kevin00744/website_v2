'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { listDeletedCustomers, restoreCustomer, type DeletedCustomerItem } from '@/lib/customers-api';
import { KioskButton } from '../kiosk/KioskButton';
import { formatPhone } from '@/lib/format';

interface RecentlyDeletedModalProps {
  /** 有顧客被還原時通知父層重新整理顧客清單 */
  onRestored: () => void;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 距離還原期限還剩多久，例：「剩 2 天 5 小時」「剩 40 分鐘」 */
function formatRemaining(deadline: string): string {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return '已過期';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `剩 ${days} 天 ${hours} 小時`;
  if (hours > 0) return `剩 ${hours} 小時 ${minutes} 分`;
  return `剩 ${minutes} 分鐘`;
}

/**
 * 「最近刪除」清單：列出 3 天內被刪除的顧客，可一鍵還原。
 * 後端已依登入者過濾範圍（店長只看得到自己分店），超過 3 天的不會出現在清單裡。
 */
export function RecentlyDeletedModal({ onRestored }: RecentlyDeletedModalProps) {
  const [items, setItems] = useState<DeletedCustomerItem[]>();
  const [loadError, setLoadError] = useState<string>();
  const [restoringId, setRestoringId] = useState<number>();
  const [actionError, setActionError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      setItems(await listDeletedCustomers());
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '載入失敗，請稍後再試');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(item: DeletedCustomerItem) {
    if (!window.confirm(`確定要還原顧客「${item.name}」嗎？`)) return;
    setRestoringId(item.id);
    setActionError(undefined);
    setMessage(undefined);
    try {
      await restoreCustomer(item.id);
      setMessage(`已還原顧客「${item.name}」`);
      onRestored();
      await load();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : '還原失敗，請稍後再試');
    } finally {
      setRestoringId(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-kiosk-base text-slate-500">刪除後 3 天內可以還原，超過 3 天就無法還原。</p>

      {message && (
        <p className="text-kiosk-base font-semibold text-emerald-600" role="status">
          ✓ {message}
        </p>
      )}
      {(loadError || actionError) && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError ?? actionError}
        </p>
      )}
      {!items && !loadError && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {items && items.length === 0 && <p className="text-kiosk-base text-slate-500">最近 3 天沒有刪除的顧客</p>}

      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-kiosk border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-kiosk-base font-semibold text-slate-900">
                  {item.name}
                  {item.customerCode && <span className="ml-2 font-mono text-slate-400">{item.customerCode}</span>}
                </span>
                <span className="text-sm text-slate-500">
                  {formatPhone(item.phone) ?? '無電話'}
                </span>
                <span className="text-sm text-slate-500">
                  {formatDateTime(item.deletedAt)} 由 {item.deletedBy?.name ?? '—'} 刪除 ·{' '}
                  <span className="font-semibold text-amber-600">{formatRemaining(item.restoreDeadline)}</span>
                </span>
              </div>
              <KioskButton
                variant="secondary"
                onClick={() => void handleRestore(item)}
                disabled={restoringId !== undefined}
              >
                {restoringId === item.id ? '還原中…' : '還原'}
              </KioskButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
