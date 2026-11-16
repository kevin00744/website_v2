'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getCustomerLineBinding, unbindLineAccount, type LineBinding } from '@/lib/line-admin-api';

/** 顧客詳情裡的 LINE 綁定狀態（呼叫端負責只對 system_admin 顯示） */
export function LineBindingBadge({ customerId }: { customerId: number }) {
  const [binding, setBinding] = useState<LineBinding>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getCustomerLineBinding(customerId)
      .then((b) => alive && setBinding(b))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : '讀取 LINE 綁定失敗'));
    return () => {
      alive = false;
    };
  }, [customerId]);

  async function unbind() {
    if (!binding?.account) return;
    if (!window.confirm(`確定要解除 LINE「${binding.account.displayName}」的綁定嗎？`)) return;
    setBusy(true);
    try {
      await unbindLineAccount(binding.account.id);
      setBinding({ bound: false, account: null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '解除綁定失敗');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-kiosk-danger">⚠️ {error}</p>;
  if (!binding) return null;

  return (
    <div className="flex items-center gap-3 rounded-kiosk border border-[#06C755]/40 bg-[#06C755]/5 p-3">
      <span className="rounded bg-[#06C755] px-1.5 py-0.5 text-xs font-bold text-white">LINE</span>
      {binding.account ? (
        <>
          <p className="flex-1 text-sm text-slate-700">
            已綁定：<strong>{binding.account.displayName}</strong>
            <span className="ml-2 text-xs text-slate-500">
              {new Date(binding.account.createdAt).toLocaleDateString('zh-TW')}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void unbind()}
            disabled={busy}
            className="text-sm font-semibold text-kiosk-danger hover:underline disabled:opacity-50"
          >
            解除綁定
          </button>
        </>
      ) : (
        <p className="flex-1 text-sm text-slate-500">尚未綁定 LINE</p>
      )}
    </div>
  );
}
