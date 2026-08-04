'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TreatmentRecord } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { deleteTreatmentRecord, listTreatmentRecords } from '@/lib/customers-api';
import {
  listServiceRecordsByCustomer,
  type ServiceRecordResult,
  type ConsumptionType,
} from '@/lib/service-records-api';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { KioskButton } from '../kiosk/KioskButton';
import { PhotoLightbox } from './PhotoLightbox';

interface TreatmentRecordTabProps {
  customerId: number;
  storeId: number;
}

function canDelete(role: AuthUser['role'] | undefined) {
  return role === 'admin' || role === 'system_admin';
}

const CONSUMPTION_LABEL: Record<ConsumptionType, string> = {
  single_purchase: '單次消費',
  wallet_deduction: '扣儲值金',
  course_deduction: '扣課程堂數',
};
const CONSUMPTION_COLOR: Record<ConsumptionType, string> = {
  single_purchase: 'bg-green-100 text-green-700',
  wallet_deduction: 'bg-blue-100 text-blue-700',
  course_deduction: 'bg-amber-100 text-amber-700',
};

export function TreatmentRecordTab({ customerId, storeId }: TreatmentRecordTabProps) {
  const [treatments, setTreatments] = useState<TreatmentRecord[]>();
  const [serviceRecords, setServiceRecords] = useState<ServiceRecordResult[]>();
  const [error, setError] = useState<string>();
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null);
  const [user, setUser] = useState<AuthUser>();
  const deletingRef = useRef<number | null>(null);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [treatList, svcList] = await Promise.all([
        listTreatmentRecords(customerId),
        listServiceRecordsByCustomer(storeId, customerId),
      ]);
      setTreatments(treatList);
      setServiceRecords(svcList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '載入紀錄失敗，請稍後再試');
    }
  }, [customerId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(recordId: number) {
    if (!window.confirm('確定要刪除這筆療程紀錄嗎？')) return;
    deletingRef.current = recordId;
    try {
      await deleteTreatmentRecord(customerId, recordId);
      setTreatments((prev) => prev?.filter((r) => r.id !== recordId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '刪除失敗，請稍後再試');
    } finally {
      deletingRef.current = null;
    }
  }

  if (error) {
    return <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>;
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ══ POS 服務 / 扣點紀錄 ══════════════════════════════════════════════ */}
      <section>
        <h3 className="mb-3 text-kiosk-base font-bold text-slate-800">
          POS 服務紀錄
          {serviceRecords && <span className="ml-2 text-sm font-normal text-slate-400">共 {serviceRecords.length} 筆</span>}
        </h3>

        {!serviceRecords && <p className="text-sm text-slate-400">載入中…</p>}
        {serviceRecords?.length === 0 && (
          <p className="rounded-kiosk bg-slate-50 p-4 text-center text-sm text-slate-400">尚無 POS 服務紀錄</p>
        )}
        {serviceRecords && serviceRecords.length > 0 && (
          <div className="overflow-hidden rounded-kiosk border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">日期</th>
                  <th className="px-3 py-2 text-left">服務項目</th>
                  <th className="px-3 py-2 text-center">消費方式</th>
                  <th className="px-3 py-2 text-right">金額 / 堂數</th>
                  <th className="px-3 py-2 text-left">服務人員</th>
                  <th className="px-3 py-2 text-center">簽名</th>
                </tr>
              </thead>
              <tbody>
                {serviceRecords.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleString('zh-TW', {
                        month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      })}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {(r.serviceItem as { name: string }).name}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CONSUMPTION_COLOR[r.consumptionType]}`}>
                        {CONSUMPTION_LABEL[r.consumptionType]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">
                      {r.consumptionType === 'course_deduction'
                        ? `${r.sessionsDeducted ?? 1} 堂`
                        : `$${(r.amountPaid ?? 0).toLocaleString()}`}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.staff.name}</td>
                    <td className="px-3 py-2 text-center text-base">
                      {r.customerSignatureUrl
                        ? <span className="text-kiosk-success font-bold">✓</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ══ 療程紀錄（手動記錄）════════════════════════════════════════════ */}
      <section>
        <h3 className="mb-3 text-kiosk-base font-bold text-slate-800">
          療程紀錄
          {treatments && <span className="ml-2 text-sm font-normal text-slate-400">共 {treatments.length} 筆</span>}
        </h3>

        {!treatments && <p className="text-sm text-slate-400">載入中…</p>}
        {treatments?.length === 0 && (
          <p className="rounded-kiosk bg-slate-50 p-4 text-center text-kiosk-base text-slate-500">
            尚無療程紀錄
          </p>
        )}

        {treatments && treatments.map((r) => (
          <div key={r.id} className="mb-3 rounded-kiosk border border-slate-200 p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-kiosk-base font-semibold text-slate-900">
                  {r.product.name}
                  {r.product.unit && <span className="ml-1 text-slate-500 font-normal">（{r.product.unit}）</span>}
                </span>
                <span className="text-sm text-slate-500">SKU: {r.product.sku}</span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-sm text-slate-500">
                  {new Date(r.performedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </span>
                <span className="text-sm text-slate-400">服務人員：{r.performedBy.name}</span>
              </div>
            </div>

            {r.note && (
              <p className="text-kiosk-base text-slate-700 whitespace-pre-wrap">{r.note}</p>
            )}

            {r.photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r.photos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxPhotos(r.photos)}
                    className="w-20 h-20 rounded overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`療程照片 ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {canDelete(user?.role) && (
              <div className="flex justify-end">
                <KioskButton variant="danger" onClick={() => void handleDelete(r.id)}>
                  刪除紀錄
                </KioskButton>
              </div>
            )}
          </div>
        ))}
      </section>

      {lightboxPhotos && (
        <PhotoLightbox photos={lightboxPhotos} onClose={() => setLightboxPhotos(null)} />
      )}
    </div>
  );
}
