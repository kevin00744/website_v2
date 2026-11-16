'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomerListItem } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createQuickCustomer, searchCustomers } from '@/lib/customers-api';
import {
  createAppointment,
  listAppointments,
  listCustomerAppointments,
  updateAppointment,
  type Appointment,
  type AppointmentInput,
} from '@/lib/appointments-api';
import type { ServiceItemSummary } from '@/lib/service-records-api';
import { useDebouncedValue } from '@/lib/use-debounce';
import {
  addDays,
  addMinutes,
  durationLabel,
  formatMonthDay,
  formatTime,
  fromDateInput,
  pad,
  startOfDay,
  staffColor,
  toDateInput,
} from '@/lib/calendar-utils';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { formatPhone } from '@/lib/format';

export interface StaffOption {
  id: number;
  name: string;
}

export interface AppointmentDraft {
  start: Date;
  staffId?: number | null;
  customer?: { id: number; name: string; phone: string | null } | null;
}

interface Props {
  open: boolean;
  storeId: number;
  staff: StaffOption[];
  serviceItems: ServiceItemSummary[];
  /** 新增時的預設值（點空白時段 / 從顧客頁帶入） */
  draft?: AppointmentDraft;
  /** 編輯既有預約 */
  editing?: Appointment | null;
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
}

const DURATIONS = [30, 60, 90, 120, 150, 180];
const TIME_OPTIONS: string[] = [];
for (let m = 7 * 60; m <= 23 * 60; m += 15) TIME_OPTIONS.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

type SelectedCustomer = { id: number; name: string; phone: string | null; code?: string | null };

export function AppointmentFormModal({ open, storeId, staff, serviceItems, draft, editing, onClose, onSaved }: Props) {
  const staffIds = useMemo(() => staff.map((s) => s.id), [staff]);

  // ── form state ──
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [isNewGuest, setIsNewGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [createProfile, setCreateProfile] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState(false);
  const [serviceItemId, setServiceItemId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // ── customer search ──
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── context data ──
  const [history, setHistory] = useState<Appointment[]>([]);
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);

  // 開啟時初始化
  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setSubmitting(false);
    setQuery('');
    setResults([]);
    setHistory([]);
    setCreateProfile(false);
    if (editing) {
      const s = new Date(editing.startAt);
      const e = new Date(editing.endAt);
      const mins = Math.round((e.getTime() - s.getTime()) / 60_000);
      setCustomer(editing.customerId ? { id: editing.customerId, name: editing.customerName, phone: editing.customerPhone } : null);
      setIsNewGuest(!editing.customerId);
      setGuestName(editing.customerId ? '' : editing.customerName);
      setGuestPhone(editing.customerId ? '' : editing.customerPhone ?? '');
      setDate(toDateInput(s));
      setTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
      setDuration(mins);
      setCustomDuration(!DURATIONS.includes(mins));
      setServiceItemId(editing.serviceItemId);
      setStaffId(editing.staffId);
      setNote(editing.note ?? '');
    } else {
      const start = draft?.start ?? nextRoundedSlot();
      setCustomer(draft?.customer ?? null);
      setIsNewGuest(false);
      setGuestName('');
      setGuestPhone('');
      setDate(toDateInput(start));
      setTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
      setDuration(60);
      setCustomDuration(false);
      setServiceItemId(null);
      setStaffId(draft?.staffId ?? null);
      setNote('');
      if (!draft?.customer) setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, editing, draft]);

  // 顧客搜尋
  useEffect(() => {
    if (!open || customer || isNewGuest) return;
    const q = debouncedQuery.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchCustomers(q, { storeId })
      .then((r) => {
        if (!cancelled) {
          setResults(r.slice(0, 8));
          setHighlight(0);
        }
      })
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, customer, isNewGuest, storeId]);

  // 選定顧客 → 載入預約紀錄（「沿用上次」）
  useEffect(() => {
    if (!open || !customer) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    listCustomerAppointments(storeId, customer.id)
      .then((r) => !cancelled && setHistory(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, customer, storeId]);

  // 選定日期 → 載入當日預約，用來標示服務人員是否有空
  useEffect(() => {
    if (!open) return;
    const d = fromDateInput(date);
    if (!d) return;
    let cancelled = false;
    listAppointments(storeId, startOfDay(d), addDays(startOfDay(d), 1))
      .then((r) => !cancelled && setDayAppointments(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, date, storeId]);

  const startAt = useMemo(() => {
    const d = fromDateInput(date);
    if (!d) return null;
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }, [date, time]);
  const endAt = startAt ? addMinutes(startAt, duration) : null;

  /** 該時段已被佔用的服務人員 */
  const busyStaff = useMemo(() => {
    const set = new Set<number>();
    if (!startAt || !endAt) return set;
    for (const a of dayAppointments) {
      if (!a.staffId || a.id === editing?.id) continue;
      if (a.status === 'cancelled' || a.status === 'no_show') continue;
      if (new Date(a.startAt) < endAt && new Date(a.endAt) > startAt) set.add(a.staffId);
    }
    return set;
  }, [dayAppointments, startAt, endAt, editing]);

  const lastVisit = history.find((h) => h.id !== editing?.id && h.status !== 'cancelled');
  const upcoming = history.filter((h) => h.id !== editing?.id && new Date(h.startAt) > new Date() && h.status !== 'cancelled');

  function pickCustomer(c: CustomerListItem) {
    setCustomer({ id: c.id, name: c.name, phone: c.phone, code: c.customerCode });
    setQuery('');
    setResults([]);
  }

  function applyLastVisit() {
    if (!lastVisit) return;
    const mins = Math.round((new Date(lastVisit.endAt).getTime() - new Date(lastVisit.startAt).getTime()) / 60_000);
    if (lastVisit.serviceItemId && serviceItems.some((s) => s.id === lastVisit.serviceItemId)) setServiceItemId(lastVisit.serviceItemId);
    if (lastVisit.staffId && staff.some((s) => s.id === lastVisit.staffId)) setStaffId(lastVisit.staffId);
    setDuration(mins);
    setCustomDuration(!DURATIONS.includes(mins));
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && results[highlight]) {
      e.preventDefault();
      pickCustomer(results[highlight]);
    }
  }

  function switchToNewGuest() {
    setIsNewGuest(true);
    // 搜尋框打的字直接帶入：像電話就填電話，否則當姓名
    const q = query.trim();
    if (/^[\d\-\s+]{2,}$/.test(q)) setGuestPhone(q);
    else if (q) setGuestName(q);
    setQuery('');
  }

  async function submit(allowOverlap = false) {
    setError(undefined);
    if (!startAt || !endAt) return setError('請選擇日期與時間');
    if (duration <= 0) return setError('請輸入正確的預約時長');

    let customerPayload: Pick<AppointmentInput, 'customerId' | 'customerName' | 'customerPhone'>;
    if (isNewGuest) {
      if (!guestName.trim()) return setError('請輸入新客人的姓名');
      if (createProfile && !guestPhone.trim()) return setError('建立顧客資料需要電話');
      customerPayload = { customerId: null, customerName: guestName.trim(), customerPhone: guestPhone.trim() || null };
    } else {
      if (!customer) return setError('請先搜尋並選擇顧客，或改為「新客人」');
      customerPayload = { customerId: customer.id };
    }

    setSubmitting(true);
    try {
      if (isNewGuest && createProfile) {
        const created = await createQuickCustomer({ name: guestName.trim(), phone: guestPhone.trim(), storeId });
        customerPayload = { customerId: created.id };
        // 建檔成功後切換成已建檔顧客，避免衝突重送時重複建立
        setCustomer({ id: created.id, name: created.name, phone: created.phone ?? null });
        setIsNewGuest(false);
        setCreateProfile(false);
      }
      const payload: AppointmentInput = {
        ...customerPayload,
        serviceItemId,
        staffId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        note: note.trim() || null,
        allowOverlap,
      };
      const saved = editing
        ? await updateAppointment(storeId, editing.id, payload)
        : await createAppointment(storeId, payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'APPOINTMENT_STAFF_CONFLICT') {
        const name = staff.find((s) => s.id === staffId)?.name ?? '這位服務人員';
        if (window.confirm(`${name} 在這個時段已有其他預約，仍要重疊排入嗎？`)) {
          setSubmitting(false);
          return submit(true);
        }
        setError('時段衝突，請改選其他時間或服務人員');
      } else {
        setError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedService = serviceItems.find((s) => s.id === serviceItemId);

  return (
    <CenteredModal open={open} onClose={onClose} title={editing ? '編輯預約' : '新增預約'} maxWidthClassName="md:max-w-3xl">
      <form
        className="flex flex-1 flex-col gap-7"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* ── 1. 顧客 ── */}
        <Section step={1} title="顧客">
          {customer && !isNewGuest ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4 rounded-kiosk border-2 border-kiosk-primary bg-kiosk-primary/5 px-5 py-4">
                <Avatar name={customer.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-kiosk-base font-bold text-slate-900">{customer.name}</p>
                  <p className="text-sm text-slate-600">
                    {formatPhone(customer.phone) ?? '未留電話'}
                    {customer.code ? <span className="ml-2 text-slate-400">#{customer.code}</span> : null}
                  </p>
                </div>
                {!editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer(null);
                      setTimeout(() => searchRef.current?.focus(), 30);
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-kiosk-primary hover:bg-kiosk-primary/10"
                  >
                    更換
                  </button>
                )}
              </div>
              {lastVisit && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span>
                    上次：{formatMonthDay(new Date(lastVisit.startAt))} {lastVisit.serviceItem?.name ?? '未指定項目'}
                    {lastVisit.staff ? ` · ${lastVisit.staff.name}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={applyLastVisit}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-white hover:bg-amber-600"
                  >
                    ⚡ 沿用上次
                  </button>
                </div>
              )}
              {upcoming.length > 0 && (
                <p className="text-sm text-slate-500">
                  📌 已有 {upcoming.length} 筆未來預約，最近一筆：
                  {formatMonthDay(new Date(upcoming[upcoming.length - 1].startAt))}{' '}
                  {formatTime(new Date(upcoming[upcoming.length - 1].startAt))}
                </p>
              )}
            </div>
          ) : isNewGuest ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="姓名" required value={guestName} onChange={setGuestName} placeholder="新客人姓名" autoFocus />
                <TextField label="電話" value={guestPhone} onChange={setGuestPhone} placeholder="09xx-xxx-xxx" type="tel" />
              </div>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={createProfile}
                  onChange={(e) => setCreateProfile(e.target.checked)}
                  className="h-5 w-5 accent-teal-700"
                />
                同時建立顧客資料（之後可在顧客頁補齊同意書）
              </label>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setIsNewGuest(false)}
                  className="self-start text-sm font-semibold text-kiosk-primary hover:underline"
                >
                  ← 改為搜尋既有顧客
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKey}
                placeholder="輸入姓名、電話或身分證搜尋…"
                aria-label="搜尋顧客"
                className="min-h-kiosk-sm w-full rounded-kiosk border-2 border-slate-300 bg-white pl-12 pr-4 text-kiosk-base outline-none focus:border-kiosk-primary focus:ring-4 focus:ring-kiosk-primary/20"
              />
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400">🔍</span>
              </div>
              {query.trim() && (
                <div className="mt-2 overflow-hidden rounded-kiosk border border-slate-200 bg-white shadow-lg">
                  {searching && results.length === 0 && <p className="px-5 py-4 text-sm text-slate-500">搜尋中…</p>}
                  {!searching && results.length === 0 && (
                    <p className="px-5 py-4 text-sm text-slate-500">找不到「{query.trim()}」</p>
                  )}
                  {results.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCustomer(c)}
                      onMouseEnter={() => setHighlight(i)}
                      className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-colors ${
                        i === highlight ? 'bg-kiosk-primary/10' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Avatar name={c.name} small />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{c.name}</p>
                        <p className="text-sm text-slate-500">{formatPhone(c.phone) ?? '未留電話'}</p>
                      </div>
                      {c.customerCode && <span className="text-xs text-slate-400">#{c.customerCode}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={switchToNewGuest}
                    className="flex w-full items-center gap-3 border-t border-slate-100 px-5 py-3 text-left font-semibold text-kiosk-primary hover:bg-kiosk-primary/5"
                  >
                    ＋ 以「{query.trim()}」建立新客人預約
                  </button>
                </div>
              )}
              {!query.trim() && (
                <button
                  type="button"
                  onClick={switchToNewGuest}
                  className="mt-3 text-sm font-semibold text-kiosk-primary hover:underline"
                >
                  ＋ 新客人（尚未建檔）
                </button>
              )}
            </div>
          )}
        </Section>

        {/* ── 2. 時間 ── */}
        <Section step={2} title="時間">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">日期</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-kiosk-sm rounded-kiosk border-2 border-slate-300 bg-white px-4 text-kiosk-base outline-none focus:border-kiosk-primary"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-slate-600">開始時間</span>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="min-h-kiosk-sm rounded-kiosk border-2 border-slate-300 bg-white px-4 text-kiosk-base outline-none focus:border-kiosk-primary"
              >
                {!TIME_OPTIONS.includes(time) && <option value={time}>{time}</option>}
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold text-slate-600">時長</span>
            {DURATIONS.map((d) => (
              <Chip key={d} active={!customDuration && duration === d} onClick={() => { setDuration(d); setCustomDuration(false); }}>
                {d >= 60 ? `${d / 60} 小時`.replace('.5 小時', ' 小時半') : `${d} 分`}
              </Chip>
            ))}
            <Chip active={customDuration} onClick={() => setCustomDuration(true)}>
              自訂
            </Chip>
            {customDuration && (
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-11 w-24 rounded-xl border-2 border-slate-300 px-3 text-base outline-none focus:border-kiosk-primary"
                />
                <span className="text-sm text-slate-500">分鐘</span>
              </span>
            )}
          </div>
          {startAt && endAt && (
            <p className="mt-3 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">
              🕐 {formatMonthDay(startAt)} {formatTime(startAt)} – {formatTime(endAt)}（{durationLabel(duration)}）
            </p>
          )}
        </Section>

        {/* ── 3. 服務項目 ── */}
        <Section step={3} title="服務項目" optional>
          <div className="flex flex-wrap gap-2">
            <Chip active={serviceItemId === null} onClick={() => setServiceItemId(null)}>
              未指定
            </Chip>
            {serviceItems.map((s) => (
              <Chip key={s.id} active={serviceItemId === s.id} onClick={() => setServiceItemId(s.id)}>
                {s.name}
                <span className="ml-1.5 text-xs opacity-60">${s.price.toLocaleString()}</span>
              </Chip>
            ))}
          </div>
        </Section>

        {/* ── 4. 服務人員 ── */}
        <Section step={4} title="服務人員" optional>
          <div className="flex flex-wrap gap-2">
            <Chip active={staffId === null} onClick={() => setStaffId(null)}>
              不指定
            </Chip>
            {staff.map((s) => {
              const busy = busyStaff.has(s.id);
              const color = staffColor(s.id, staffIds);
              return (
                <Chip key={s.id} active={staffId === s.id} onClick={() => setStaffId(s.id)} warn={busy}>
                  <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${color.swatch}`} />
                  {s.name}
                  {busy && <span className="ml-1.5 text-xs font-semibold text-rose-600">忙碌</span>}
                </Chip>
              );
            })}
          </div>
        </Section>

        {/* ── 5. 備註 ── */}
        <Section step={5} title="備註" optional>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="例如：敏感肌、需提早 10 分鐘到、指定包廂…"
            className="w-full rounded-kiosk border-2 border-slate-300 px-4 py-3 text-base outline-none focus:border-kiosk-primary focus:ring-4 focus:ring-kiosk-primary/20"
          />
        </Section>

        {/* ── footer ── */}
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-auto flex flex-col gap-3 border-t border-slate-200 bg-white px-6 pb-6 pt-4 md:-mx-10 md:px-10">
          {error && (
            <p className="text-sm font-semibold text-kiosk-danger" role="alert">
              ⚠️ {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="hidden min-w-0 truncate text-sm text-slate-500 sm:block">
              {(customer?.name ?? guestName) || '—'}
              {selectedService ? ` · ${selectedService.name}` : ''}
              {startAt ? ` · ${formatMonthDay(startAt)} ${formatTime(startAt)}` : ''}
            </p>
            <div className="ml-auto flex gap-3">
              <KioskButton variant="ghost" onClick={onClose}>
                取消
              </KioskButton>
              <KioskButton type="submit" disabled={submitting}>
                {submitting ? '儲存中…' : editing ? '儲存變更' : '確認預約'}
              </KioskButton>
            </div>
          </div>
        </div>
      </form>
    </CenteredModal>
  );
}

function nextRoundedSlot(): Date {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 30) * 30, 0, 0);
  return d;
}

function Section({ step, title, optional, children }: { step: number; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2.5 text-base font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-kiosk-primary text-sm text-white">{step}</span>
        {title}
        {optional && <span className="text-xs font-normal text-slate-400">選填</span>}
      </h3>
      {children}
    </section>
  );
}

function Chip({
  active,
  warn,
  onClick,
  children,
}: {
  active: boolean;
  warn?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[2.75rem] items-center rounded-full border-2 px-4 text-sm font-semibold transition-all ${
        active
          ? 'border-kiosk-primary bg-kiosk-primary text-white shadow-sm'
          : warn
            ? 'border-rose-200 bg-rose-50 text-slate-700 hover:border-rose-300'
            : 'border-slate-200 bg-white text-slate-700 hover:border-kiosk-primary/50 hover:bg-kiosk-primary/5'
      }`}
    >
      {children}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-slate-600">
        {label}
        {required && <span className="ml-1 text-kiosk-danger">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-kiosk-sm rounded-kiosk border-2 border-slate-300 bg-white px-4 text-kiosk-base outline-none focus:border-kiosk-primary focus:ring-4 focus:ring-kiosk-primary/20"
        {...rest}
      />
    </label>
  );
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-kiosk-primary/15 font-bold text-kiosk-primary ${
        small ? 'h-9 w-9 text-sm' : 'h-12 w-12 text-lg'
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}
