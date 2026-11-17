'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import { getCustomerDetail } from '@/lib/customers-api';
import { listServiceItems, listStoreStaff, type ServiceItemSummary } from '@/lib/service-records-api';
import {
  STATUS_META,
  listAppointments,
  updateAppointment,
  type Appointment,
} from '@/lib/appointments-api';
import {
  BUSINESS_HOURS,
  WEEKDAY_LABELS,
  addDays,
  defaultSlotFor,
  formatMonthDay,
  formatTime,
  fromDateInput,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  staffColor,
  toDateInput,
} from '@/lib/calendar-utils';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { MonthGrid, TimeGrid, type GridColumn } from '@/components/admin/calendar/CalendarViews';
import {
  AppointmentFormModal,
  type AppointmentDraft,
  type StaffOption,
} from '@/components/admin/calendar/AppointmentFormModal';
import { AppointmentDetailModal } from '@/components/admin/calendar/AppointmentDetailModal';

type View = 'day' | 'week' | 'month';
const VIEW_LABEL: Record<View, string> = { day: '日', week: '週', month: '月' };
const VIEW_KEY = 'calendar:view';

export default function CalendarPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [serviceItems, setServiceItems] = useState<ServiceItemSummary[]>([]);
  const [hiddenStaff, setHiddenStaff] = useState<Set<number | 'none'>>(new Set());
  const [showCancelled, setShowCancelled] = useState(true);
  const [toast, setToast] = useState<string>();

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<AppointmentDraft>();
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [detail, setDetail] = useState<Appointment | null>(null);
  /** 從「LINE」頁點待確認預約帶入：/calendar?date=…&appointmentId=…，載入後自動打開那筆 */
  const [openAppointmentId, setOpenAppointmentId] = useState<number | null>(null);

  const staffIds = useMemo(() => staff.map((s) => s.id), [staff]);

  // ── 初始化 ──
  useEffect(() => {
    const user = getAuthUser();
    setReady(true);
    if (!user?.storeId) return;
    const sid = user.storeId;
    setStoreId(sid);

    let initialView: View = window.innerWidth < 768 ? 'day' : 'week';
    try {
      const saved = localStorage.getItem(VIEW_KEY) as View | null;
      if (saved && saved in VIEW_LABEL && window.innerWidth >= 768) initialView = saved;
    } catch {
      /* storage 不可用時沿用預設 */
    }
    setView(initialView);

    listStoreStaff(sid)
      .then((list) =>
        setStaff(
          (list as Array<StaffOption & { role: string; isActive?: boolean }>)
            .filter((s) => (s.role === 'staff' || s.role === 'manager') && s.isActive !== false)
            .map((s) => ({ id: s.id, name: s.name })),
        ),
      )
      .catch(() => undefined);
    listServiceItems(sid).then(setServiceItems).catch(() => undefined);

    // 從顧客頁「預約」帶入：/calendar?customerId=123[&date=2026-11-20]
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const parsedDate = dateParam ? fromDateInput(dateParam) : null;
    if (parsedDate) setCursor(parsedDate);
    const appointmentId = Number(params.get('appointmentId'));
    if (appointmentId) {
      setOpenAppointmentId(appointmentId);
      window.history.replaceState(null, '', '/calendar');
    }
    const customerId = Number(params.get('customerId'));
    if (customerId) {
      getCustomerDetail(customerId)
        .then((c) => {
          setEditing(null);
          setDraft({ start: defaultStartFor(parsedDate ?? new Date()), customer: { id: c.id, name: c.name, phone: c.phone ?? null } });
          setFormOpen(true);
        })
        .catch(() => setToast('找不到這位顧客'));
      window.history.replaceState(null, '', '/calendar');
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // ── 區間 ──
  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: addDays(cursor, 1) };
    if (view === 'week') {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 7) };
    }
    const s = startOfWeek(startOfMonth(cursor));
    return { from: s, to: addDays(s, 42) };
  }, [view, cursor]);

  const reload = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setLoadError(undefined);
    try {
      setAppointments(await listAppointments(storeId, range.from, range.to));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入預約失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [storeId, range]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 預約載入後，若網址有指定 appointmentId 就自動打開詳情
  useEffect(() => {
    if (!openAppointmentId || loading) return;
    const target = appointments.find((a) => a.id === openAppointmentId);
    if (target) {
      setDetail(target);
      setOpenAppointmentId(null);
    }
  }, [appointments, loading, openAppointmentId]);

  // 每 2 分鐘自動同步（多台 iPad 同時使用時看得到別人新增的預約）
  useEffect(() => {
    const t = setInterval(() => void reload(), 120_000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── 導覽 ──
  const step = useCallback(
    (dir: 1 | -1) => {
      setCursor((c) => {
        if (view === 'day') return addDays(c, dir);
        if (view === 'week') return addDays(c, 7 * dir);
        return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      });
    },
    [view],
  );

  const openNew = useCallback((d?: AppointmentDraft) => {
    setEditing(null);
    setDraft(d ?? { start: defaultStartFor(cursor) });
    setFormOpen(true);
  }, [cursor]);

  // 鍵盤快捷鍵：← → 換頁、T 今天、N 新增、D/W/M 切換視圖
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (formOpen || detail) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft') step(-1);
      else if (k === 'arrowright') step(1);
      else if (k === 't') setCursor(startOfDay(new Date()));
      else if (k === 'n') openNew();
      else if (k === 'd') setView('day');
      else if (k === 'w') setView('week');
      else if (k === 'm') setView('month');
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formOpen, detail, step, openNew]);

  // ── 資料處理 ──
  const visible = useMemo(
    () =>
      appointments.filter((a) => {
        if (!showCancelled && (a.status === 'cancelled' || a.status === 'no_show')) return false;
        if (view !== 'day' && hiddenStaff.has(a.staffId ?? 'none')) return false;
        return true;
      }),
    [appointments, showCancelled, hiddenStaff, view],
  );

  const hourRange = useMemo(() => {
    let start: number = BUSINESS_HOURS.start;
    let end: number = BUSINESS_HOURS.end;
    for (const a of visible) {
      const s = new Date(a.startAt);
      const e = new Date(a.endAt);
      start = Math.min(start, s.getHours());
      end = Math.max(end, isSameDay(s, e) ? e.getHours() + (e.getMinutes() > 0 ? 1 : 0) : 24);
    }
    return { start: Math.max(0, start), end: Math.min(24, end) };
  }, [visible]);

  const columns: GridColumn[] = useMemo(() => {
    const today = new Date();
    if (view === 'week') {
      const s = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(s, i);
        const count = visible.filter((a) => isSameDay(new Date(a.startAt), d) && a.status !== 'cancelled' && a.status !== 'no_show').length;
        return {
          key: d.toDateString(),
          date: d,
          title: (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className={d.getDay() === 0 || d.getDay() === 6 ? 'text-rose-500' : ''}><span className="hidden 2xl:inline">週</span>{WEEKDAY_LABELS[d.getDay()]}</span>
              <span
                className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-1 ${
                  isSameDay(d, today) ? 'bg-kiosk-primary text-white' : ''
                }`}
              >
                {d.getDate()}
              </span>
            </span>
          ),
          subtitle: count ? `${count} 筆預約` : undefined,
          highlight: isSameDay(d, today),
        };
      });
    }
    // 日視圖：每位服務人員一欄 + 未指定
    const cols: GridColumn[] = staff.map((s) => {
      const color = staffColor(s.id, staffIds);
      const count = visible.filter((a) => a.staffId === s.id && a.status !== 'cancelled' && a.status !== 'no_show').length;
      return {
        key: `staff-${s.id}`,
        date: cursor,
        staffId: s.id,
        title: (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${color.swatch}`} />
            {s.name}
          </span>
        ),
        subtitle: count ? `${count} 筆` : '空檔',
      };
    });
    const unassigned = visible.filter((a) => a.staffId === null).length;
    cols.push({ key: 'staff-none', date: cursor, staffId: null, title: '未指定', subtitle: unassigned ? `${unassigned} 筆` : '—' });
    return cols;
  }, [view, cursor, staff, staffIds, visible]);

  // ── 操作 ──
  function upsert(appt: Appointment) {
    setAppointments((prev) => {
      const exists = prev.some((p) => p.id === appt.id);
      return exists ? prev.map((p) => (p.id === appt.id ? appt : p)) : [...prev, appt];
    });
  }

  async function handleDrop(appt: Appointment, newStart: Date, staffId?: number | null) {
    if (!storeId) return;
    const duration = new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime();
    const sameTime = newStart.getTime() === new Date(appt.startAt).getTime();
    const sameStaff = staffId === undefined || staffId === appt.staffId;
    if (sameTime && sameStaff) return;
    const payload = {
      startAt: newStart.toISOString(),
      endAt: new Date(newStart.getTime() + duration).toISOString(),
      ...(staffId !== undefined ? { staffId } : {}),
    };
    // 樂觀更新，失敗再還原
    const snapshot = appointments;
    const staffName = staffId !== undefined ? staff.find((s) => s.id === staffId)?.name : undefined;
    upsert({
      ...appt,
      ...payload,
      ...(staffId !== undefined ? { staffId, staff: staffId && staffName ? { id: staffId, name: staffName } : null } : {}),
    });
    try {
      upsert(await updateAppointment(storeId, appt.id, payload));
      setToast(`已改到 ${formatMonthDay(newStart)} ${formatTime(newStart)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'APPOINTMENT_STAFF_CONFLICT' && window.confirm('該服務人員此時段已有預約，仍要重疊排入嗎？')) {
        try {
          upsert(await updateAppointment(storeId, appt.id, { ...payload, allowOverlap: true }));
          setToast(`已改到 ${formatMonthDay(newStart)} ${formatTime(newStart)}`);
          return;
        } catch {
          /* fallthrough */
        }
      }
      setAppointments(snapshot);
      if (!(err instanceof ApiError && err.code === 'APPOINTMENT_STAFF_CONFLICT')) {
        setToast(err instanceof ApiError ? err.message : '更新失敗');
      }
    }
  }

  const title = useMemo(() => {
    if (view === 'month') return `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;
    if (view === 'day') return `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月 ${cursor.getDate()} 日（${WEEKDAY_LABELS[cursor.getDay()]}）`;
    const s = startOfWeek(cursor);
    const e = addDays(s, 6);
    return s.getMonth() === e.getMonth()
      ? `${s.getFullYear()} 年 ${s.getMonth() + 1} 月 ${s.getDate()}–${e.getDate()} 日`
      : `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
  }, [view, cursor]);

  // 側欄：選定日的預約清單
  const agendaDay = cursor;
  const agenda = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(new Date(a.startAt), agendaDay))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [appointments, agendaDay],
  );
  const stats = useMemo(() => {
    const active = agenda.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');
    return {
      total: active.length,
      arrived: agenda.filter((a) => a.status === 'arrived' || a.status === 'completed').length,
      waiting: agenda.filter((a) => a.status === 'booked' || a.status === 'confirmed').length,
    };
  }, [agenda]);

  async function quickStatus(a: Appointment, status: Appointment['status']) {
    if (!storeId) return;
    try {
      upsert(await updateAppointment(storeId, a.id, { status }));
      setToast(`${a.customerName}：${STATUS_META[status].label}`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : '更新失敗');
    }
  }

  if (!ready) return null;
  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號尚未設定所屬門市，請聯絡系統管理員。</p>;
  }

  return (
    <div className="flex flex-col gap-4 pb-24 md:h-[calc(100vh-4rem)] md:pb-0">
      {/* ── toolbar ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="whitespace-nowrap text-kiosk-xl font-bold text-slate-900">預約行事曆</h1>
          {loading && <span className="h-5 w-5 animate-spin rounded-full border-2 border-kiosk-primary border-t-transparent" aria-label="載入中" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
            <NavBtn onClick={() => step(-1)} label="上一頁">‹</NavBtn>
            <button
              type="button"
              onClick={() => setCursor(startOfDay(new Date()))}
              className="h-12 border-x border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              今天
            </button>
            <NavBtn onClick={() => step(1)} label="下一頁">›</NavBtn>
          </div>
          <input
            type="date"
            value={toDateInput(cursor)}
            onChange={(e) => {
              const d = fromDateInput(e.target.value);
              if (d) setCursor(d);
            }}
            aria-label="跳到日期"
            className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"
          />
          <div className="flex rounded-xl bg-slate-200/70 p-1" role="tablist">
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`h-10 min-w-[3rem] rounded-lg px-3 text-sm font-bold transition-all ${
                  view === v ? 'bg-white text-kiosk-primary shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          <KioskButton onClick={() => openNew()} className="hidden !min-h-[3rem] !px-5 md:inline-flex md:items-center">
            ＋ 新增預約
          </KioskButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-kiosk-base font-bold text-slate-700">{title}</p>
        <div className="flex flex-wrap items-center gap-2">
          {view !== 'day' &&
            [...staff.map((s) => ({ id: s.id as number | 'none', name: s.name, color: staffColor(s.id, staffIds) })), { id: 'none' as const, name: '未指定', color: staffColor(null, staffIds) }].map(
              (s) => {
                const hidden = hiddenStaff.has(s.id);
                return (
                  <button
                    key={String(s.id)}
                    type="button"
                    onClick={() =>
                      setHiddenStaff((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                    aria-pressed={!hidden}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all ${
                      hidden ? 'border-slate-200 bg-white text-slate-400 line-through' : 'border-slate-200 bg-white text-slate-700 shadow-sm'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${hidden ? 'bg-slate-300' : s.color.swatch}`} />
                    {s.name}
                  </button>
                );
              },
            )}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="accent-teal-700" />
            顯示取消/未到
          </label>
        </div>
      </div>

      {loadError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}{' '}
          <button type="button" className="underline" onClick={() => void reload()}>
            重試
          </button>
        </p>
      )}

      {/* ── main ── */}
      <div className="flex min-h-[70vh] flex-1 gap-4 md:min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          {view === 'month' ? (
            <MonthGrid
              cursor={cursor}
              appointments={visible}
              staffIds={staffIds}
              selected={cursor}
              onDayClick={(d) => setCursor(d)}
              onDayDoubleClick={(d) => {
                setCursor(d);
                setView('day');
              }}
              onEventClick={setDetail}
            />
          ) : (
            <TimeGrid
              key={view}
              columns={columns}
              appointments={visible}
              staffIds={staffIds}
              hourStart={hourRange.start}
              hourEnd={hourRange.end}
              minColumnWidth={view === 'day' ? 140 : 0}
              onSlotClick={(start, staffId) => {
                if (view === 'week') setCursor(startOfDay(start));
                openNew({ start, staffId: staffId ?? null });
              }}
              onEventClick={setDetail}
              onEventDrop={(a, s, sid) => void handleDrop(a, s, sid)}
            />
          )}
        </div>

        {/* ── agenda sidebar ── */}
        <aside className="hidden w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:flex">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-semibold text-slate-500">{isSameDay(agendaDay, new Date()) ? '今日' : formatMonthDay(agendaDay)}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Stat label="預約" value={stats.total} />
              <Stat label="待到店" value={stats.waiting} tone="text-sky-700" />
              <Stat label="已到店" value={stats.arrived} tone="text-emerald-700" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {agenda.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="text-4xl">🗓</span>
                <p className="text-sm text-slate-500">這天還沒有預約</p>
                <button type="button" onClick={() => openNew()} className="text-sm font-bold text-kiosk-primary hover:underline">
                  ＋ 新增一筆
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {agenda.map((a) => {
                  const meta = STATUS_META[a.status];
                  const color = staffColor(a.staffId, staffIds);
                  const inactive = a.status === 'cancelled' || a.status === 'no_show';
                  return (
                    <li key={a.id} className={`rounded-xl border border-slate-100 p-3 transition hover:border-slate-200 hover:shadow-sm ${inactive ? 'opacity-50' : ''}`}>
                      <button type="button" onClick={() => setDetail(a)} className="flex w-full items-start gap-3 text-left">
                        <div className="w-12 shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-slate-900">{formatTime(new Date(a.startAt))}</p>
                          <p className="text-xs tabular-nums text-slate-400">{formatTime(new Date(a.endAt))}</p>
                        </div>
                        <span className={`mt-1 h-9 w-1 shrink-0 rounded-full ${color.swatch}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-bold text-slate-900 ${inactive ? 'line-through' : ''}`}>{a.customerName}</p>
                          <p className="truncate text-xs text-slate-500">
                            {a.serviceItem?.name ?? '未指定項目'}
                            {a.staff ? ` · ${a.staff.name}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${meta.pill}`}>{meta.label}</span>
                      </button>
                      {(a.status === 'booked' || a.status === 'confirmed') && (
                        <div className="mt-2 flex gap-2 pl-[4.25rem]">
                          <button
                            type="button"
                            onClick={() => void quickStatus(a, 'arrived')}
                            className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-200"
                          >
                            🚪 報到
                          </button>
                          {a.status === 'booked' && (
                            <button
                              type="button"
                              onClick={() => void quickStatus(a, 'confirmed')}
                              className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                            >
                              📞 已確認
                            </button>
                          )}
                        </div>
                      )}
                      {a.status === 'arrived' && (
                        <div className="mt-2 flex gap-2 pl-[4.25rem]">
                          <button
                            type="button"
                            onClick={() => void quickStatus(a, 'completed')}
                            className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-200"
                          >
                            ✅ 完成
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
            快捷鍵：← → 換頁 · T 今天 · N 新增 · D/W/M 切換 · 拖曳預約可改時間
          </p>
        </aside>
      </div>

      {/* mobile FAB */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-4 pb-safe md:hidden">
        <KioskButton fullWidth onClick={() => openNew()}>
          ＋ 新增預約
        </KioskButton>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl md:bottom-8">
          {toast}
        </div>
      )}

      <AppointmentFormModal
        open={formOpen}
        storeId={storeId}
        staff={staff}
        serviceItems={serviceItems}
        draft={draft}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(a) => {
          upsert(a);
          setFormOpen(false);
          setToast(editing ? '已更新預約' : `已預約 ${a.customerName}・${formatMonthDay(new Date(a.startAt))} ${formatTime(new Date(a.startAt))}`);
          const d = startOfDay(new Date(a.startAt));
          if (d < range.from || d >= range.to) setCursor(d);
        }}
      />

      <AppointmentDetailModal
        key={detail?.id}
        appointment={detail}
        storeId={storeId}
        onClose={() => setDetail(null)}
        onChanged={(a) => {
          upsert(a);
          setDetail(a);
          setToast(`狀態已更新為「${STATUS_META[a.status].label}」`);
        }}
        onDeleted={(id) => {
          setAppointments((prev) => prev.filter((p) => p.id !== id));
          setDetail(null);
          setToast('已刪除預約');
        }}
        onEdit={(a) => {
          setDetail(null);
          setEditing(a);
          setDraft(undefined);
          setFormOpen(true);
        }}
      />
    </div>
  );
}

/** 選某天新增時的預設開始時間（依營業時間） */
function defaultStartFor(day: Date): Date {
  return defaultSlotFor(day);
}

function NavBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="h-12 w-12 text-2xl font-bold text-slate-600 hover:bg-slate-50">
      {children}
    </button>
  );
}

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

