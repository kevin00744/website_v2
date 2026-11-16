'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, liffFetch, type LiffAppointment, type LiffBookingOptions } from '@/lib/liff';
import { Field, LIFF_INPUT_CLASS, LiffButton, LiffCard, useLiffMe } from '../LiffGate';

const MAX_DAYS = 60;

function taipeiDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); // YYYY-MM-DD
}

function toMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

/** 依後台「LINE 預約設定」的第一個/最後一個時段與間隔產生時段 */
function buildSlots(first: string, last: string, interval: number): string[] {
  const slots: string[] = [];
  for (let t = toMinutes(first); t <= toMinutes(last); t += interval) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return slots;
}

export default function LiffBookingPage() {
  const router = useRouter();
  const { me } = useLiffMe();
  const [options, setOptions] = useState<LiffBookingOptions>();
  const [serviceItemId, setServiceItemId] = useState<number | ''>('');
  const [staffId, setStaffId] = useState<number | ''>('');
  const [date, setDate] = useState(() => taipeiDateString(new Date(Date.now() + 86_400_000)));
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<LiffAppointment>();

  useEffect(() => {
    if (!me.bound) return;
    liffFetch<LiffBookingOptions>('/booking-options')
      .then(setOptions)
      .catch((err) => setError(errorMessage(err)));
  }, [me.bound]);

  const minDate = taipeiDateString(new Date());
  const maxDate = taipeiDateString(new Date(Date.now() + MAX_DAYS * 86_400_000));

  // 依設定產生時段；今天的時段要排除 30 分鐘內 / 已過去的
  const availableSlots = useMemo(() => {
    if (!options) return [];
    const { firstSlot, lastSlot, slotIntervalMin } = options.slots;
    const earliest = Date.now() + 30 * 60_000;
    return buildSlots(firstSlot, lastSlot, slotIntervalMin).filter(
      (t) => new Date(`${date}T${t}:00+08:00`).getTime() >= earliest,
    );
  }, [date, options]);

  useEffect(() => {
    if (time && !availableSlots.includes(time)) setTime('');
  }, [availableSlots, time]);

  if (!me.bound) {
    return (
      <LiffCard title="線上預約">
        <p>預約前請先完成會員綁定，只需要手機號碼與姓名。</p>
        <LiffButton className="mt-5" onClick={() => router.push('/liff/bind')}>前往綁定</LiffButton>
      </LiffCard>
    );
  }

  if (result) {
    const start = new Date(result.startAt);
    return (
      <LiffCard title="預約申請已送出 ✓">
        <p className="text-lg font-bold">
          {start.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
        </p>
        <p className="text-slate-600">{result.serviceItem?.name ?? '請店家協助安排'}</p>
        <p className="text-slate-600">服務人員：{result.staff?.name ?? '不指定'}</p>
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          預約申請已送出，店家確認後會以 LINE 通知您。如需調整時段，店家也會透過 LINE 與您聯繫。
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <LiffButton onClick={() => router.push('/liff/me')}>查看我的預約</LiffButton>
          <LiffButton variant="ghost" onClick={() => { setResult(undefined); setTime(''); setNote(''); }}>再預約一筆</LiffButton>
        </div>
      </LiffCard>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!time) {
      setError('請選擇時段');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const appt = await liffFetch<LiffAppointment>('/appointments', {
        method: 'POST',
        json: {
          serviceItemId: serviceItemId || null,
          staffId: staffId || null,
          startAt: new Date(`${date}T${time}:00+08:00`).toISOString(),
          note: note || null,
        },
      });
      setResult(appt);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">線上預約</h1>
      <LiffCard>
        {!options ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="服務項目">
              <select
                value={serviceItemId}
                onChange={(e) => setServiceItemId(e.target.value ? Number(e.target.value) : '')}
                className={LIFF_INPUT_CLASS}
              >
                <option value="">請店家協助安排</option>
                {options.items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}（{i.durationMin} 分鐘）</option>
                ))}
              </select>
            </Field>
            <Field label="服務人員">
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : '')}
                className={LIFF_INPUT_CLASS}
              >
                <option value="">不指定</option>
                {options.staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="日期" required>
              <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} required className={LIFF_INPUT_CLASS} />
            </Field>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">時段<span className="ml-0.5 text-red-500">*</span></p>
              {availableSlots.length === 0 ? (
                <p className="text-sm text-slate-400">這天已無可預約時段，請選擇其他日期</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTime(t)}
                      className={`rounded-lg border py-2 text-sm font-semibold tabular-nums ${
                        time === t ? 'border-[#B08968] bg-[#B08968] text-white' : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Field label="備註（選填）">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className={LIFF_INPUT_CLASS} placeholder="其他需求或想告訴店家的事" />
            </Field>
          </div>
        )}
      </LiffCard>
      <p className="text-xs text-slate-500">此為預約申請，時段以店家確認為準；確認後會以 LINE 通知您。</p>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <LiffButton type="submit" disabled={busy || !time}>{busy ? '送出中…' : '送出預約申請'}</LiffButton>
    </form>
  );
}
