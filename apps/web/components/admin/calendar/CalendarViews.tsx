'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_META, type Appointment } from '@/lib/appointments-api';
import {
  BUSINESS_HOURS,
  WEEKDAY_LABELS,
  addDays,
  addMinutes,
  formatTime,
  isSameDay,
  layoutOverlaps,
  minutesOfDay,
  pad,
  startOfDay,
  startOfMonth,
  startOfWeek,
  staffColor,
} from '@/lib/calendar-utils';
import { TEXT_SIZE_EVENT, rootFontPx } from '@/lib/text-size';

/** 每小時高度（rem）：跟著文字大小切換一起縮放，字放大時時段格子也變高、事件文字不會被截掉 */
const HOUR_REM = 4.5;

function useHourPx(): number {
  const [px, setPx] = useState(HOUR_REM * 16);
  useEffect(() => {
    const update = () => setPx(HOUR_REM * rootFontPx());
    update();
    window.addEventListener(TEXT_SIZE_EVENT, update);
    return () => window.removeEventListener(TEXT_SIZE_EVENT, update);
  }, []);
  return px;
}
const OFF_HOURS_STYLE: React.CSSProperties = {
  backgroundColor: 'rgb(248 250 252 / 0.9)',
  backgroundImage: 'repeating-linear-gradient(135deg, rgb(226 232 240 / 0.7) 0, rgb(226 232 240 / 0.7) 1px, transparent 1px, transparent 8px)',
};
const SNAP_MIN = 15;

export interface GridColumn {
  key: string;
  date: Date;
  /** undefined：不分服務人員；null：未指定服務人員欄 */
  staffId?: number | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  highlight?: boolean;
}

interface TimeGridProps {
  columns: GridColumn[];
  appointments: Appointment[];
  staffIds: number[];
  hourStart: number;
  hourEnd: number;
  minColumnWidth?: number;
  onSlotClick: (start: Date, staffId?: number | null) => void;
  onEventClick: (appt: Appointment) => void;
  onEventDrop: (appt: Appointment, start: Date, staffId?: number | null) => void;
}

export function TimeGrid({
  columns,
  appointments,
  staffIds,
  hourStart,
  hourEnd,
  minColumnWidth = 0,
  onSlotClick,
  onEventClick,
  onEventDrop,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const HOUR_PX = useHourPx();
  /** 以標準字級（72px/小時）為基準的縮放比例 */
  const scale = HOUR_PX / 72;
  const [now, setNow] = useState(() => new Date());
  const [hover, setHover] = useState<{ col: string; minute: number } | null>(null);
  const [dragging, setDragging] = useState<{ appt: Appointment; grabOffset: number } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ col: string; minute: number } | null>(null);

  const totalMinutes = (hourEnd - hourStart) * 60;
  const gridHeight = (totalMinutes / 60) * HOUR_PX;
  const pxPerMin = HOUR_PX / 60;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 首次載入自動捲到「現在」前一小時
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.max(0, (minutesOfDay(new Date()) - hourStart * 60 - 60) * pxPerMin);
    el.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byColumn = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutOverlaps<{ start: number; end: number; appt: Appointment }>>>();
    for (const col of columns) {
      const dayStart = startOfDay(col.date).getTime();
      const dayEnd = addDays(startOfDay(col.date), 1).getTime();
      const items = appointments
        .filter((a) => {
          const s = new Date(a.startAt).getTime();
          const e = new Date(a.endAt).getTime();
          if (s >= dayEnd || e <= dayStart) return false;
          if (col.staffId !== undefined && (a.staffId ?? null) !== col.staffId) return false;
          return true;
        })
        .map((a) => {
          const s = Math.max(new Date(a.startAt).getTime(), dayStart);
          const e = Math.min(new Date(a.endAt).getTime(), dayEnd);
          return { start: (s - dayStart) / 60_000, end: (e - dayStart) / 60_000, appt: a };
        });
      map.set(col.key, layoutOverlaps(items));
    }
    return map;
  }, [columns, appointments]);

  function minuteFromEvent(e: React.MouseEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return hourStart * 60 + Math.floor(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
  }

  function dateAt(col: GridColumn, minute: number) {
    const d = startOfDay(col.date);
    d.setMinutes(minute);
    return d;
  }

  const gridTemplate = `4rem repeat(${columns.length}, minmax(${minColumnWidth}px, 1fr))`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        {/* header */}
        <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white/95 backdrop-blur" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="sticky left-0 z-10 bg-white" />
          {columns.map((col) => (
            <div key={col.key} className="border-l border-slate-100 px-2 py-2.5 text-center">
              <div className={`text-sm font-bold ${col.highlight ? 'text-kiosk-primary' : 'text-slate-800'}`}>{col.title}</div>
              {col.subtitle && <div className="mt-0.5 text-xs text-slate-500">{col.subtitle}</div>}
            </div>
          ))}
        </div>

        {/* body */}
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {/* time gutter */}
          <div className="sticky left-0 z-10 bg-white" style={{ height: gridHeight }}>
            {Array.from({ length: hourEnd - hourStart }, (_, i) => (
              <div key={i} className="relative" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2.5 right-2 text-xs font-medium tabular-nums text-slate-400">
                  {i === 0 ? '' : `${pad(hourStart + i)}:00`}
                </span>
              </div>
            ))}
          </div>

          {columns.map((col) => {
            const isToday = isSameDay(col.date, now);
            const nowMin = minutesOfDay(now) - hourStart * 60;
            const items = byColumn.get(col.key) ?? [];
            const showHover = hover?.col === col.key && !dragging;
            const showDrop = dropPreview?.col === col.key && dragging;
            const dragDuration = dragging
              ? (new Date(dragging.appt.endAt).getTime() - new Date(dragging.appt.startAt).getTime()) / 60_000
              : 0;

            return (
              <div
                key={col.key}
                className={`relative cursor-pointer border-l border-slate-100 ${isToday ? 'bg-kiosk-primary/[0.03]' : ''}`}
                style={{
                  height: gridHeight,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX / 2 - 1}px, rgb(241 245 249) ${HOUR_PX / 2 - 1}px, rgb(241 245 249) ${HOUR_PX / 2}px, transparent ${HOUR_PX / 2}px, transparent ${HOUR_PX - 1}px, rgb(226 232 240) ${HOUR_PX - 1}px, rgb(226 232 240) ${HOUR_PX}px)`,
                }}
                onMouseMove={(e) => {
                  const minute = minuteFromEvent(e);
                  if (hover?.col !== col.key || hover.minute !== minute) setHover({ col: col.key, minute });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => onSlotClick(dateAt(col, minuteFromEvent(e)), col.staffId)}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const minute = Math.max(hourStart * 60, minuteFromEvent(e) - dragging.grabOffset);
                  if (dropPreview?.col !== col.key || dropPreview.minute !== minute) setDropPreview({ col: col.key, minute });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragging || !dropPreview) return;
                  onEventDrop(dragging.appt, dateAt(col, dropPreview.minute), col.staffId);
                  setDragging(null);
                  setDropPreview(null);
                }}
              >
                {/* 營業時間外：淡灰斜紋 + 開店/打烊粗線 */}
                {hourStart < BUSINESS_HOURS.start && (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 border-b-2 border-slate-300"
                    style={{ height: (BUSINESS_HOURS.start - hourStart) * HOUR_PX, ...OFF_HOURS_STYLE }}
                  />
                )}
                {hourEnd > BUSINESS_HOURS.end && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 border-t-2 border-slate-300"
                    style={{ height: (hourEnd - BUSINESS_HOURS.end) * HOUR_PX, ...OFF_HOURS_STYLE }}
                  />
                )}

                {showHover && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-0 rounded-lg border-2 border-dashed border-kiosk-primary/40 bg-kiosk-primary/5 px-2 py-1 text-xs font-semibold text-kiosk-primary"
                    style={{ top: (hover.minute - hourStart * 60) * pxPerMin, height: 30 * pxPerMin }}
                  >
                    ＋ {pad(Math.floor(hover.minute / 60))}:{pad(hover.minute % 60)}
                  </div>
                )}

                {showDrop && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-kiosk-primary bg-kiosk-primary/15 px-2 py-1 text-xs font-bold text-kiosk-primary"
                    style={{ top: (dropPreview.minute - hourStart * 60) * pxPerMin, height: dragDuration * pxPerMin }}
                  >
                    {pad(Math.floor(dropPreview.minute / 60))}:{pad(dropPreview.minute % 60)} –{' '}
                    {formatTime(addMinutes(dateAt(col, dropPreview.minute), dragDuration))}
                  </div>
                )}

                {items.map(({ appt, start, end, lane, lanes }) => {
                  const top = (start - hourStart * 60) * pxPerMin;
                  const height = Math.max((end - start) * pxPerMin, 22 * scale);
                  const color = staffColor(appt.staffId, staffIds);
                  const meta = STATUS_META[appt.status];
                  const inactive = appt.status === 'cancelled' || appt.status === 'no_show';
                  const compact = height < 44 * scale;
                  return (
                    <button
                      key={appt.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(appt.id));
                        const rect = e.currentTarget.getBoundingClientRect();
                        const grab = Math.floor((e.clientY - rect.top) / pxPerMin / SNAP_MIN) * SNAP_MIN;
                        setDragging({ appt, grabOffset: grab });
                        setHover(null);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropPreview(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(appt);
                      }}
                      onMouseMove={(e) => e.stopPropagation()}
                      onMouseEnter={() => setHover(null)}
                      title={`${formatTime(new Date(appt.startAt))}–${formatTime(new Date(appt.endAt))} ${appt.customerName}${appt.serviceItem ? `｜${appt.serviceItem.name}` : ''}${appt.staff ? `｜${appt.staff.name}` : ''}`}
                      className={`group absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left shadow-sm ring-1 ring-black/5 transition-all hover:!z-30 hover:shadow-md ${lanes > 1 ? 'ring-2 ring-white' : ''} ${color.bg} ${color.border} ${color.text} ${
                        inactive ? 'opacity-50' : ''
                      } ${dragging?.appt.id === appt.id ? 'opacity-40' : ''} ${appt.status === 'arrived' ? 'ring-2 ring-amber-400' : ''}`}
                      style={{
                        top,
                        height,
                        // 重疊時採「疊瓦」排列：每格比等分寬一些、後面的蓋在前面上，窄欄也看得到姓名
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${lanes === 1 ? 100 : Math.min(100 - (lane / lanes) * 100, (100 / lanes) * 1.7)}% - 4px)`,
                        zIndex: 10 + lane,
                      }}
                    >
                      <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-xs'} font-semibold`}>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                        <span className="tabular-nums opacity-80">{formatTime(new Date(appt.startAt))}</span>
                        {appt.source === 'line' && (
                          <span className="shrink-0 rounded bg-[#06C755] px-1 text-xs font-bold leading-4 text-white">
                            LINE{appt.status === 'booked' ? '・待確認' : ''}
                          </span>
                        )}
                        {compact &&<span className={`truncate ${inactive ? 'line-through' : ''}`}>{appt.customerName}</span>}
                      </div>
                      {!compact && (
                        <>
                          <p className={`truncate text-sm font-bold leading-tight ${inactive ? 'line-through' : ''}`}>{appt.customerName}</p>
                          {appt.serviceItem && <p className="truncate text-xs opacity-75">{appt.serviceItem.name}</p>}
                          {height > 80 * scale && col.staffId === undefined && appt.staff && (
                            <p className="truncate text-xs opacity-60">👤 {appt.staff.name}</p>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}

                {isToday && nowMin >= 0 && nowMin <= totalMinutes && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowMin * pxPerMin }}>
                    <div className="relative h-0.5 bg-rose-500">
                      <span className="absolute -left-1 -top-[5px] h-3 w-3 rounded-full bg-rose-500" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

interface MonthGridProps {
  cursor: Date;
  appointments: Appointment[];
  staffIds: number[];
  selected: Date;
  onDayClick: (d: Date) => void;
  onDayDoubleClick: (d: Date) => void;
  onEventClick: (appt: Appointment) => void;
}

export function MonthGrid({ cursor, appointments, staffIds, selected, onDayClick, onDayDoubleClick, onEventClick }: MonthGridProps) {
  const first = startOfWeek(startOfMonth(cursor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const today = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const k = startOfDay(new Date(a.startAt)).toDateString();
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    return map;
  }, [appointments]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className={`py-2.5 text-center text-sm font-bold ${d === 0 || d === 6 ? 'text-rose-500' : 'text-slate-600'}`}>
            {WEEKDAY_LABELS[d]}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-auto">
        {days.map((d) => {
          const list = (byDay.get(d.toDateString()) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt));
          const active = list.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show');
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selected);
          return (
            <div
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              onDoubleClick={() => onDayDoubleClick(d)}
              className={`flex min-h-[6.5rem] cursor-pointer flex-col gap-1 border-b border-r border-slate-100 p-1.5 transition-colors hover:bg-slate-50 ${
                inMonth ? '' : 'bg-slate-50/60'
              } ${isSelected ? 'ring-2 ring-inset ring-kiosk-primary/60' : ''}`}
            >
              <div className="flex items-center justify-between px-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    isToday ? 'bg-kiosk-primary text-white' : inMonth ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {d.getDate()}
                </span>
                {active.length > 0 && <span className="text-xs font-semibold text-slate-400">{active.length} 筆</span>}
              </div>
              {list.slice(0, 3).map((a) => {
                const color = staffColor(a.staffId, staffIds);
                const inactive = a.status === 'cancelled' || a.status === 'no_show';
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(a);
                    }}
                    className={`truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs font-semibold ${color.bg} ${color.border} ${color.text} ${
                      inactive ? 'line-through opacity-50' : ''
                    }`}
                  >
                    <span className="tabular-nums opacity-70">{formatTime(new Date(a.startAt))}</span>{' '}
                    {a.source === 'line' && <span className="rounded bg-[#06C755] px-1 text-xs font-bold text-white">LINE</span>}{' '}
                    {a.customerName}
                  </button>
                );
              })}
              {list.length > 3 && <span className="px-1.5 text-xs font-semibold text-kiosk-primary">+{list.length - 3} 更多</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
