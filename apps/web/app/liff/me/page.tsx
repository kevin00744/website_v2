'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, liffFetch, type LiffAppointment, type LiffSummary } from '@/lib/liff';
import { LiffButton, LiffCard, useLiffMe } from '../LiffGate';

const money = (n: number) => `NT$ ${Math.round(n).toLocaleString('en-US')}`;

const STATUS_LABEL: Record<LiffAppointment['status'], { label: string; cls: string }> = {
  booked: { label: '待店家確認', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: '已確認', cls: 'bg-emerald-100 text-emerald-800' },
  arrived: { label: '已報到', cls: 'bg-sky-100 text-sky-800' },
  completed: { label: '已完成', cls: 'bg-slate-100 text-slate-600' },
  cancelled: { label: '已取消', cls: 'bg-slate-100 text-slate-500' },
  no_show: { label: '未到', cls: 'bg-slate-100 text-slate-500' },
};

/** 我的資料：剩餘堂數、儲值金、我的預約 */
export default function LiffMePage() {
  const router = useRouter();
  const { me } = useLiffMe();
  const [summary, setSummary] = useState<LiffSummary>();
  const [appointments, setAppointments] = useState<LiffAppointment[]>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<number>();

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        liffFetch<LiffSummary>('/summary'),
        liffFetch<LiffAppointment[]>('/appointments'),
      ]);
      setSummary(s);
      setAppointments(a);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (me.bound) void load();
  }, [me.bound, load]);

  if (!me.bound) {
    return (
      <LiffCard title={`${me.displayName} 您好`}>
        <p>綁定會員後即可查詢剩餘堂數、儲值金並線上預約。</p>
        <LiffButton className="mt-5" onClick={() => router.push('/liff/bind')}>立即綁定</LiffButton>
      </LiffCard>
    );
  }

  async function cancel(appt: LiffAppointment) {
    if (!window.confirm('確定要取消這筆預約申請嗎？')) return;
    setBusyId(appt.id);
    setError(undefined);
    try {
      await liffFetch(`/appointments/${appt.id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(undefined);
    }
  }

  const wallet = summary?.wallet;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold">{me.customer?.name} 您好</h1>
        <p className="text-sm text-slate-500">
          {me.customer?.customerCode ? `會員編號 ${me.customer.customerCode}・` : ''}手機 {me.customer?.phoneMasked}
        </p>
      </header>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}

      <LiffCard title="儲值金">
        {wallet ? (
          <dl className="flex flex-col gap-1.5 text-sm">
            <Row label="儲值金" value={money(wallet.balance)} />
            <Row label="贈送金" value={money(wallet.bonusBalance)} />
            {wallet.storeCredit > 0 && <Row label="購物金" value={money(wallet.storeCredit)} />}
            <div className="mt-1 border-t border-slate-100 pt-2">
              <Row label="合計可用" value={money(wallet.balance + wallet.bonusBalance + wallet.storeCredit)} bold />
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-400">載入中…</p>
        )}
      </LiffCard>

      <LiffCard title="剩餘堂數">
        {!summary ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : summary.courses.length === 0 ? (
          <p className="text-sm text-slate-400">目前沒有剩餘的課程堂數</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {summary.courses.map((c, i) => (
              <li key={i}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <span className="tabular-nums"><strong className="text-lg text-[#7F5539]">{c.remaining}</strong> / {c.total} 堂</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#B08968]" style={{ width: `${Math.min(100, (c.remaining / Math.max(1, c.total)) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </LiffCard>

      <LiffCard title="我的預約">
        {!appointments ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-slate-400">目前沒有即將到來的預約</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {appointments.map((a) => {
              const s = STATUS_LABEL[a.status];
              return (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tabular-nums">
                      {new Date(a.startAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </p>
                    <p className="text-sm text-slate-500">
                      {a.serviceItem?.name ?? '未指定項目'}・{a.staff?.name ?? '不指定服務人員'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>
                  {a.status === 'booked' && (
                    <button type="button" disabled={busyId === a.id} onClick={() => void cancel(a)} className="text-sm font-semibold text-red-600 disabled:opacity-50">
                      取消
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <LiffButton className="mt-4" onClick={() => router.push('/liff/booking')}>新增預約</LiffButton>
      </LiffCard>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums ${bold ? 'text-lg font-bold text-[#7F5539]' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
