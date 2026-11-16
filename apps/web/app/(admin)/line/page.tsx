'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { formatPhone } from '@/lib/format';
import {
  getBookingSettings,
  getLineStatus,
  listLineAccounts,
  listLinePendingAppointments,
  pushToLineAccount,
  saveBookingSettings,
  unbindLineAccount,
  type BookingSettingItem,
  type LineAccountItem,
  type LinePendingAppointment,
  type LineStatus,
  type SlotSettings,
} from '@/lib/line-admin-api';

/**
 * 後台「LINE」頁：除了會計以外都能使用（middleware + 導覽列 + 後端 RolesGuard）。
 * 「設定狀態」區塊只有 system_admin 看得到（後端 status 也只放行 system_admin）。
 */
const DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 15); // 15–180 分鐘
const INTERVAL_OPTIONS = [15, 30, 60];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const MAX_IMAGE_BYTES = 1024 * 1024;

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function toDateParam(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(iso));
}

export default function LinePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>();
  const [status, setStatus] = useState<LineStatus>();
  const [accounts, setAccounts] = useState<LineAccountItem[]>();
  const [pending, setPending] = useState<LinePendingAppointment[]>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busyId, setBusyId] = useState<number>();
  const [pushTarget, setPushTarget] = useState<LineAccountItem | null>(null);

  const isSystemAdmin = user?.role === 'system_admin';

  const load = useCallback(async (withStatus: boolean) => {
    setError(undefined);
    try {
      const [a, p, s] = await Promise.all([
        listLineAccounts(),
        listLinePendingAppointments(),
        withStatus ? getLineStatus() : Promise.resolve(undefined),
      ]);
      setAccounts(a);
      setPending(p);
      if (s) setStatus(s);
    } catch (err) {
      setError(errMsg(err, '載入失敗，請稍後再試'));
    }
  }, []);

  useEffect(() => {
    const u = getAuthUser() ?? null;
    setUser(u);
    if (u && u.role !== 'accountant') void load(u.role === 'system_admin');
  }, [load]);

  async function unbind(acc: LineAccountItem) {
    if (!window.confirm(`確定解除「${acc.customer.name}」與 LINE「${acc.displayName}」的綁定？`)) return;
    setBusyId(acc.id);
    try {
      await unbindLineAccount(acc.id);
      setNotice('已解除綁定');
      await load(isSystemAdmin);
    } catch (err) {
      setError(errMsg(err, '解除綁定失敗'));
    } finally {
      setBusyId(undefined);
    }
  }

  if (user === undefined) return null;
  if (!user || user.role === 'accountant') return <p className="p-6 text-slate-500">此頁面不開放給您的帳號使用。</p>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <span className="rounded bg-[#06C755] px-2 py-1 text-sm font-bold text-white">LINE</span>
        <h1 className="text-2xl font-bold text-slate-900">LINE</h1>
        <button type="button" onClick={() => void load(isSystemAdmin)} className="ml-auto text-sm font-semibold text-kiosk-primary hover:underline">
          重新整理
        </button>
      </header>

      {error && <p className="font-semibold text-kiosk-danger" role="alert">⚠️ {error}</p>}
      {notice && <p className="font-semibold text-emerald-700">✓ {notice}</p>}

      {/* 設定狀態：只有系統管理員 */}
      {isSystemAdmin && (
        <section className="rounded-kiosk border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-800">
            設定狀態 <span className="ml-1 text-xs font-normal text-slate-400">僅系統管理員可見</span>
          </h2>
          {status ? (
            <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Check ok={status.enabled} label="LINE_ENABLED（總開關）" />
              <Check ok={!!status.storeId} label={`LINE_STORE_ID${status.storeId ? `：${status.storeId}` : ''}`} />
              <Check ok={status.hasChannelSecret} label="LINE_CHANNEL_SECRET" />
              <Check ok={status.hasChannelAccessToken} label="LINE_CHANNEL_ACCESS_TOKEN" />
              <Check ok={status.hasLoginChannelId} label="LINE_LOGIN_CHANNEL_ID" />
              <Check ok={!!status.liffId} label={`LIFF ID${status.liffId ? `：${status.liffId}` : ''}`} />
              <Check ok={status.hasPublicOrigin} label="WEB_ORIGIN（https，推播圖片用）" />
            </ul>
          ) : (
            <p className="text-sm text-slate-400">載入中…</p>
          )}
          {status?.liffId && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {['bind', 'booking', 'me'].map((p) => (
                <a key={p} href={`https://liff.line.me/${status.liffId}/${p}`} target="_blank" rel="noreferrer" className="font-semibold text-kiosk-primary hover:underline">
                  LIFF /{p} ↗
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* LINE 待確認預約：點擊跳到行事曆 */}
      <section className="rounded-kiosk border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-bold text-slate-800">LINE 待確認預約（{pending?.length ?? 0}）</h2>
        <p className="mb-3 text-sm text-slate-500">點擊預約即可前往行事曆確認；確認或取消後，系統會自動以 LINE 通知顧客。</p>
        {pending && pending.length === 0 && <p className="text-sm text-slate-400">目前沒有待確認的預約</p>}
        <ul className="divide-y divide-slate-100">
          {pending?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => router.push(`/calendar?date=${toDateParam(p.startAt)}&appointmentId=${p.id}`)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-[#06C755]/5"
              >
                <span className="font-semibold tabular-nums">
                  {new Date(p.startAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="font-bold">{p.customerName}</span>
                <span className="text-slate-500">{formatPhone(p.customerPhone)}</span>
                <span>{p.serviceItem?.name ?? '未指定項目'}</span>
                <span className="text-slate-500">👤 {p.staff?.name ?? '不指定'}</span>
                {p.note && <span className="text-slate-500">「{p.note}」</span>}
                <span className="ml-auto font-semibold text-kiosk-primary">前往行事曆 ›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <BookingSettingsSection />

      {/* 綁定帳號 */}
      <section className="rounded-kiosk border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-slate-800">已綁定帳號（{accounts?.length ?? 0}）</h2>
        {accounts && accounts.length === 0 && <p className="text-sm text-slate-400">尚無綁定帳號</p>}
        <ul className="divide-y divide-slate-100">
          {accounts?.map((acc) => (
            <li key={acc.id} className="flex flex-wrap items-center gap-3 py-3">
              {acc.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={acc.pictureUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="h-10 w-10 rounded-full bg-slate-200" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold text-slate-900">
                  {acc.customer.name}
                  {acc.customer.deleted && <span className="ml-2 text-xs text-kiosk-danger">（顧客已刪除）</span>}
                  <span className="ml-2 font-normal text-slate-500">{formatPhone(acc.customer.phone)}</span>
                </p>
                <p className="text-slate-500">
                  LINE：{acc.displayName}・{new Date(acc.createdAt).toLocaleString('zh-TW', { hour12: false })}
                </p>
              </div>
              <button type="button" disabled={busyId === acc.id} onClick={() => setPushTarget(acc)} className="rounded-lg border border-[#06C755] px-3 py-1.5 text-sm font-semibold text-[#06A045] hover:bg-[#06C755]/10 disabled:opacity-50">
                推播訊息
              </button>
              <button type="button" disabled={busyId === acc.id} onClick={() => void unbind(acc)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-kiosk-danger hover:bg-red-50 disabled:opacity-50">
                解除綁定
              </button>
            </li>
          ))}
        </ul>
      </section>

      {pushTarget && (
        <PushDialog
          account={pushTarget}
          onClose={() => setPushTarget(null)}
          onSent={() => {
            setNotice(`已推播給 ${pushTarget.displayName}`);
            setPushTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── LINE 預約設定 ──────────────────────────────────────────

function BookingSettingsSection() {
  const [items, setItems] = useState<BookingSettingItem[]>();
  const [slots, setSlots] = useState<SlotSettings>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getBookingSettings();
      setItems(s.items);
      setSlots({ defaultDurationMin: s.defaultDurationMin, firstSlot: s.firstSlot, lastSlot: s.lastSlot, slotIntervalMin: s.slotIntervalMin });
    } catch (err) {
      setError(errMsg(err, '讀取預約設定失敗'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enabled = useMemo(() => items?.filter((i) => i.enabled) ?? [], [items]);
  const disabled = useMemo(() => items?.filter((i) => !i.enabled) ?? [], [items]);

  function update(id: number, patch: Partial<BookingSettingItem>) {
    setSaved(false);
    setItems((prev) => prev?.map((i) => (i.serviceItemId === id ? { ...i, ...patch } : i)));
  }

  function toggle(item: BookingSettingItem) {
    setSaved(false);
    setItems((prev) => {
      if (!prev) return prev;
      const rest = prev.filter((i) => i.serviceItemId !== item.serviceItemId);
      const on = rest.filter((i) => i.enabled);
      const off = rest.filter((i) => !i.enabled);
      return item.enabled ? [...on, ...off, { ...item, enabled: false }] : [...on, { ...item, enabled: true }, ...off];
    });
  }

  function move(index: number, delta: number) {
    setSaved(false);
    const next = [...enabled];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems([...next, ...disabled]);
  }

  async function save() {
    if (!slots) return;
    setSaving(true);
    setError(undefined);
    try {
      const result = await saveBookingSettings({
        ...slots,
        items: enabled.map((i, idx) => ({ serviceItemId: i.serviceItemId, durationMin: i.durationMin, sortOrder: idx })),
      });
      setItems(result.items);
      setSaved(true);
    } catch (err) {
      setError(errMsg(err, '儲存失敗'));
    } finally {
      setSaving(false);
    }
  }

  const select = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <section className="rounded-kiosk border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-lg font-bold text-slate-800">LINE 預約設定</h2>
      <p className="mb-4 text-sm text-slate-500">勾選要開放給顧客在 LINE 預約的服務項目，並設定每個項目佔用的時間。沒勾選的項目顧客看不到。</p>

      {!items || !slots ? (
        <p className="text-sm text-slate-400">載入中…</p>
      ) : (
        <>
          {items.length === 0 && <p className="text-sm text-slate-400">尚未建立服務品項，請先到「服務品項」新增。</p>}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {enabled.map((item, idx) => (
              <li key={item.serviceItemId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <input type="checkbox" checked onChange={() => toggle(item)} className="h-5 w-5 accent-[#06C755]" aria-label={`開放 ${item.name}`} />
                <span className="min-w-0 flex-1 font-semibold text-slate-800">{item.name}</span>
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  時長
                  <select value={item.durationMin} onChange={(e) => update(item.serviceItemId, { durationMin: Number(e.target.value) })} className={select}>
                    {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{m} 分鐘</option>)}
                  </select>
                </label>
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-30" aria-label="上移">↑</button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === enabled.length - 1} className="rounded border border-slate-200 px-2 py-1 text-sm disabled:opacity-30" aria-label="下移">↓</button>
                </div>
              </li>
            ))}
            {disabled.map((item) => (
              <li key={item.serviceItemId} className="flex items-center gap-3 px-3 py-2.5 text-slate-400">
                <input type="checkbox" checked={false} onChange={() => toggle(item)} className="h-5 w-5" aria-label={`開放 ${item.name}`} />
                <span className="flex-1">{item.name}</span>
                <span className="text-xs">未開放</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">未選項目時長</span>
              <select value={slots.defaultDurationMin} onChange={(e) => { setSaved(false); setSlots({ ...slots, defaultDurationMin: Number(e.target.value) }); }} className={`${select} w-full`}>
                {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{m} 分鐘</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">第一個時段</span>
              <select value={slots.firstSlot} onChange={(e) => { setSaved(false); setSlots({ ...slots, firstSlot: e.target.value }); }} className={`${select} w-full`}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">最後一個時段</span>
              <select value={slots.lastSlot} onChange={(e) => { setSaved(false); setSlots({ ...slots, lastSlot: e.target.value }); }} className={`${select} w-full`}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-600">時段間隔</span>
              <select value={slots.slotIntervalMin} onChange={(e) => { setSaved(false); setSlots({ ...slots, slotIntervalMin: Number(e.target.value) }); }} className={`${select} w-full`}>
                {INTERVAL_OPTIONS.map((m) => <option key={m} value={m}>每 {m} 分鐘</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[#06C755] px-5 py-2.5 font-bold text-white hover:bg-[#05b04b] disabled:opacity-50">
              {saving ? '儲存中…' : '儲存設定'}
            </button>
            {saved && <span className="text-sm font-semibold text-emerald-700">✓ 已儲存，LINE 預約頁會立即套用</span>}
            {error && <span className="text-sm font-semibold text-kiosk-danger">⚠️ {error}</span>}
          </div>
        </>
      )}
    </section>
  );
}

// ── 推播（文字＋圖片） ──────────────────────────────────────

function PushDialog({ account, onClose, onSent }: { account: LineAccountItem; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!image) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function pick(file: File | undefined) {
    setError(undefined);
    if (!file) return setImage(null);
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setError('圖片只能是 JPG 或 PNG');
    if (file.size > MAX_IMAGE_BYTES) return setError(`圖片需在 1MB 以內（目前 ${(file.size / 1024 / 1024).toFixed(1)}MB），請先壓縮`);
    setImage(file);
  }

  async function send() {
    if (!text.trim() && !image) return setError('請輸入訊息或選擇圖片');
    setSending(true);
    setError(undefined);
    try {
      await pushToLineAccount(account.id, text, image);
      onSent();
    } catch (err) {
      setError(errMsg(err, '發送失敗'));
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-900">推播給 {account.displayName}</h3>
        <p className="mb-4 text-sm text-slate-500">{account.customer.name}・每次推播會使用 1 則 LINE 訊息額度</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="輸入訊息內容（選填）"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <label className="mt-3 block text-sm">
          <span className="font-semibold text-slate-600">附加圖片（選填，JPG/PNG，1MB 以內）</span>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => pick(e.target.files?.[0])} className="mt-1 block w-full text-sm" />
        </label>
        {preview && (
          <div className="mt-3 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="預覽" className="max-h-40 rounded-lg border border-slate-200" />
            <button type="button" onClick={() => setImage(null)} className="text-sm font-semibold text-kiosk-danger">移除</button>
          </div>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-kiosk-danger">⚠️ {error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">取消</button>
          <button type="button" onClick={() => void send()} disabled={sending} className="rounded-lg bg-[#06C755] px-5 py-2 font-bold text-white disabled:opacity-50">
            {sending ? '發送中…' : '發送'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'text-emerald-700' : 'text-slate-400'}`}>
      <span>{ok ? '✓' : '✕'}</span>
      {label}
    </li>
  );
}
