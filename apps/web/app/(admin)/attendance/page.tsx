'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  checkIn,
  checkOut,
  listAttendanceRecords,
  formatDuration,
  type AttendanceRecord,
} from '@/lib/attendance-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

function useLiveClock() {
  // mounted=false 時 SSR 與 CSR 都不顯示時間，避免 hydration mismatch
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return { mounted, now };
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
function formatDate(d: Date) {
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}
function formatRecordTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function formatRecordDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
}

export default function AttendancePage() {
  const { mounted, now } = useLiveClock();
  const [userName, setUserName] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [openClock, setOpenClock] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string>();
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listAttendanceRecords();
      setRecords(list);
      setOpenClock(list.find((r) => !r.clockOutAt) ?? null);
    } catch {/* 靜默 */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const user = getAuthUser();
    if (user) setUserName(user.name);
    void load();
  }, [load]);

  async function handleAction() {
    setActionError(undefined);
    setActioning(true);
    try {
      if (openClock) {
        await checkOut();
      } else {
        await checkIn();
      }
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '操作失敗，請稍後再試');
    } finally {
      setActioning(false);
    }
  }

  // 本月紀錄（倒序）
  const thisMonth = now ? now.toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7);
  const monthRecords = records.filter((r) => r.clockInAt.startsWith(thisMonth));

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-8">
      {/* ── 打招呼 ── */}
      <p className="text-kiosk-base text-slate-500">哈囉，{userName} 👋</p>

      {/* ── 大型即時時鐘 ── */}
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-6xl font-bold tabular-nums text-slate-900 md:text-8xl">
          {mounted && now ? formatTime(now) : <span className="invisible">00:00:00</span>}
        </span>
        <span className="text-kiosk-base text-slate-500">{mounted && now ? formatDate(now) : ' '}</span>
      </div>

      {/* ── 目前狀態 ── */}
      {!loading && (
        <div className={`w-full rounded-kiosk p-4 text-center text-kiosk-base font-semibold ${
          openClock
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-slate-50 text-slate-500 border border-slate-200'
        }`}>
          {openClock
            ? `✓ 已於 ${formatRecordTime(openClock.clockInAt)} 打卡上班，工作中`
            : '目前尚未打卡上班'}
        </div>
      )}

      {/* ── 打卡大按鈕 ── */}
      {actionError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {actionError}</p>
      )}
      <button
        type="button"
        onClick={() => void handleAction()}
        disabled={actioning || loading}
        className={`w-full max-w-xs rounded-2xl py-8 text-2xl font-bold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 ${
          openClock
            ? 'bg-kiosk-danger hover:bg-red-700'
            : 'bg-kiosk-success hover:bg-green-700'
        }`}
      >
        {actioning
          ? '處理中…'
          : openClock
            ? '點我打卡下班'
            : '點我打卡上班'}
      </button>

      {/* ── 本月打卡紀錄 ── */}
      <div className="w-full">
        <h2 className="mb-3 text-kiosk-lg font-bold text-slate-800">本月打卡明細</h2>
        {monthRecords.length === 0 ? (
          <p className="rounded-kiosk bg-slate-50 p-4 text-center text-kiosk-base text-slate-400">
            本月尚無打卡紀錄
          </p>
        ) : (
          <div className="overflow-hidden rounded-kiosk border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-center">上班</th>
                  <th className="px-4 py-3 text-center">下班</th>
                  <th className="px-4 py-3 text-right">工時</th>
                </tr>
              </thead>
              <tbody>
                {monthRecords.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-700">{formatRecordDate(r.clockInAt)}</td>
                    <td className="px-4 py-3 text-center font-mono text-kiosk-success">{formatRecordTime(r.clockInAt)}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-600">
                      {r.clockOutAt ? formatRecordTime(r.clockOutAt) : <span className="text-amber-500">打卡中</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {r.clockOutAt ? formatDuration(r.clockInAt, r.clockOutAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
