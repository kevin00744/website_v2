'use client';

import { useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { INVENTORY_MOVEMENT_TYPE_LABEL, type InventoryLogSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { listInventoryLogsByCustomer } from '@/lib/inventory-api';
import { formatDate } from '@/lib/format';

export interface InventoryHistoryTabHandle {
  reload: () => void;
}

interface InventoryHistoryTabProps {
  customerId: number;
}

/** 顧客檔案的「商品使用紀錄」Tab：純顯示，沒有編輯/刪除（帳本資料不可改，跟後端 InventoryLog 的 append-only 設計一致） */
export const InventoryHistoryTab = forwardRef<InventoryHistoryTabHandle, InventoryHistoryTabProps>(
  ({ customerId }, ref) => {
    const [logs, setLogs] = useState<InventoryLogSummary[]>();
    const [loadError, setLoadError] = useState<string>();

    async function load() {
      setLoadError(undefined);
      try {
        const result = await listInventoryLogsByCustomer(customerId);
        setLogs(result);
      } catch (error) {
        setLoadError(error instanceof ApiError ? error.message : '載入商品使用紀錄失敗，請稍後再試');
      }
    }

    useEffect(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId]);

    useImperativeHandle(ref, () => ({ reload: load }));

    if (loadError) {
      return (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      );
    }

    if (!logs) {
      return <p className="text-kiosk-base text-slate-500">載入中…</p>;
    }

    if (logs.length === 0) {
      return <p className="text-kiosk-base text-slate-500">這位顧客目前沒有商品使用紀錄</p>;
    }

    return (
      <div className="flex flex-col gap-3">
        {logs.map((log) => (
          <div key={log.id} className="flex flex-col gap-1 rounded-kiosk border-2 border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-kiosk-base font-bold text-slate-900">{log.productName}</span>
              <span className="text-kiosk-base font-semibold text-kiosk-primary">
                {INVENTORY_MOVEMENT_TYPE_LABEL[log.type]} {log.quantity}
              </span>
            </div>
            <span className="text-kiosk-base text-slate-500">
              {formatDate(log.createdAt)} · 記錄人：{log.performedByName}
            </span>
            {log.reason && <span className="text-kiosk-base text-slate-600">備註：{log.reason}</span>}
          </div>
        ))}
      </div>
    );
  },
);
InventoryHistoryTab.displayName = 'InventoryHistoryTab';
