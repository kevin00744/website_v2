'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  STATUS_META,
  deleteAppointment,
  updateAppointment,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/appointments-api';
import { durationLabel, formatMonthDay, formatTime } from '@/lib/calendar-utils';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { Avatar } from './AppointmentFormModal';
import { formatPhone } from '@/lib/format';

interface Props {
  appointment: Appointment | null;
  storeId: number;
  onClose: () => void;
  onChanged: (appt: Appointment) => void;
  onDeleted: (id: number) => void;
  onEdit: (appt: Appointment) => void;
}

const STATUS_ACTIONS: Array<{ status: AppointmentStatus; icon: string }> = [
  { status: 'booked', icon: '🗓' },
  { status: 'confirmed', icon: '📞' },
  { status: 'arrived', icon: '🚪' },
  { status: 'completed', icon: '✅' },
  { status: 'no_show', icon: '⛔' },
  { status: 'cancelled', icon: '✕' },
];

export function AppointmentDetailModal({ appointment, storeId, onClose, onChanged, onDeleted, onEdit }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!appointment) return null;
  const a = appointment;
  const start = new Date(a.startAt);
  const end = new Date(a.endAt);
  const mins = Math.round((end.getTime() - start.getTime()) / 60_000);
  const meta = STATUS_META[a.status];

  async function changeStatus(status: AppointmentStatus) {
    if (status === a.status) return;
    setBusy(true);
    setError(undefined);
    try {
      onChanged(await updateAppointment(storeId, a.id, { status }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`確定要刪除「${a.customerName}」${formatMonthDay(start)} ${formatTime(start)} 的預約嗎？\n（若只是顧客取消，建議改用「已取消」狀態保留紀錄）`)) return;
    setBusy(true);
    try {
      await deleteAppointment(storeId, a.id);
      onDeleted(a.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '刪除失敗，請稍後再試');
      setBusy(false);
    }
  }

  return (
    <CenteredModal open onClose={onClose} title="預約內容" maxWidthClassName="md:max-w-2xl" closeOnOverlayClick>
      <div className="flex flex-1 flex-col gap-6">
        {/* 顧客 */}
        <div className="flex items-center gap-4">
          <Avatar name={a.customerName} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-kiosk-lg font-bold text-slate-900">
              {a.customerName}
              {!a.customerId && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">未建檔</span>}
              {a.source === 'line' && <LineBadge />}
            </p>
            {a.customerPhone ? (
              <a href={`tel:${a.customerPhone}`} className="text-base font-medium text-kiosk-primary hover:underline">
                📞 {formatPhone(a.customerPhone)}
              </a>
            ) : (
              <p className="text-sm text-slate-400">未留電話</p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${meta.pill}`}>{meta.label}</span>
        </div>

        {/* LINE 申請待確認：確認 / 取消後會自動以 LINE 通知顧客（只有 system_admin 拿得到 LINE 預約） */}
        {a.source === 'line' && a.status === 'booked' && (
          <div className="flex flex-wrap items-center gap-3 rounded-kiosk border-2 border-[#06C755] bg-[#06C755]/10 p-4">
            <p className="flex-1 text-base font-bold text-slate-800">
              LINE 預約申請，待店家確認
              <span className="block text-sm font-medium text-slate-600">確認或取消後，系統會自動以 LINE 通知顧客</span>
            </p>
            <KioskButton onClick={() => void changeStatus('confirmed')} disabled={busy}>
              確認預約
            </KioskButton>
          </div>
        )}

        {/* 資訊 */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-kiosk bg-slate-50 p-5 sm:grid-cols-2">
          <Info label="時間" value={`${formatMonthDay(start)} ${formatTime(start)} – ${formatTime(end)}`} sub={durationLabel(mins)} />
          <Info label="服務項目" value={a.serviceItem?.name ?? '未指定'} sub={a.serviceItem ? `$${a.serviceItem.price.toLocaleString()}` : undefined} />
          <Info label="服務人員" value={a.staff?.name ?? '不指定'} />
          <Info label="建立者" value={a.createdBy.name} sub={new Date(a.createdAt).toLocaleString('zh-TW', { hour12: false })} />
          {a.note && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">備註</dt>
              <dd className="mt-1 whitespace-pre-wrap text-base text-slate-800">{a.note}</dd>
            </div>
          )}
        </dl>

        {/* 狀態 */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">更新狀態</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STATUS_ACTIONS.map(({ status, icon }) => {
              const active = status === a.status;
              const m = STATUS_META[status];
              return (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus(status)}
                  className={`flex min-h-[4rem] flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition-all disabled:opacity-60 ${
                    active ? `${m.pill} border-current` : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-lg leading-none">{icon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm font-semibold text-kiosk-danger" role="alert">
            ⚠️ {error}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <KioskButton variant="ghost" onClick={handleDelete} disabled={busy} className="!px-4 text-kiosk-danger hover:!bg-red-50">
            刪除
          </KioskButton>
          <div className="ml-auto flex flex-wrap gap-3">
            {a.customerId && (
              <a
                href={`/customers?customerId=${a.customerId}`}
                className="inline-flex min-h-kiosk items-center rounded-kiosk border-2 border-kiosk-primary px-6 text-kiosk-base font-bold text-kiosk-primary hover:bg-kiosk-primary/5"
              >
                顧客資料
              </a>
            )}
            <KioskButton onClick={() => onEdit(a)} disabled={busy}>
              編輯
            </KioskButton>
          </div>
        </div>
      </div>
    </CenteredModal>
  );
}

export function LineBadge() {
  return <span className="rounded-full bg-[#06C755] px-2 py-0.5 text-xs font-bold text-white">LINE</span>;
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-900">{value}</dd>
      {sub && <dd className="text-sm text-slate-500">{sub}</dd>}
    </div>
  );
}
