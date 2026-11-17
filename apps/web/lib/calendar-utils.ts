/** 行事曆用的日期小工具（一律以瀏覽器當地時間計算） */

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/** 門市營業時間（24 小時制，整點）。行事曆預設只顯示這段，預約超出時才自動往外延伸。 */
export const BUSINESS_HOURS = { start: 13, end: 21 } as const;

/**
 * 新增預約的預設開始時間：
 * - 今天：下一個整點或半點，但不早於開店；接近打烊（最後 30 分鐘）就改到隔天開店
 * - 其他日：開店時間
 */
export function defaultSlotFor(day: Date, now = new Date()): Date {
  const open = startOfDay(day);
  open.setHours(BUSINESS_HOURS.start);
  if (!isSameDay(day, now)) return open;
  const d = new Date(now);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 30) * 30, 0, 0);
  if (d < open) return open;
  const lastStart = startOfDay(day);
  lastStart.setHours(BUSINESS_HOURS.end, -30);
  if (d > lastStart) {
    const next = addDays(startOfDay(day), 1);
    next.setHours(BUSINESS_HOURS.start);
    return next;
  }
  return d;
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000);
}

/** 週一為一週起點（台灣門市排班習慣） */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const diff = (r.getDay() + 6) % 7;
  return addDays(r, -diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 「11/16（一）」 */
export function formatMonthDay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} 小時 ${m} 分`;
  if (h) return `${h} 小時`;
  return `${m} 分鐘`;
}

/**
 * 同一欄裡時間重疊的事件並排顯示：先依開始時間排序，切成互相重疊的群組，
 * 群組內貪婪分配 lane，回傳每個事件的 lane 與該群組的 lane 總數。
 */
export function layoutOverlaps<T extends { start: number; end: number }>(
  items: T[],
): Array<T & { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Array<T & { lane: number; lanes: number }> = [];
  let cluster: Array<T & { lane: number; lanes: number }> = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = laneEnds.length;
    cluster.forEach((c) => (c.lanes = lanes));
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

/** 服務人員色票：依 staffId 固定配色，同一人在各視圖顏色一致 */
const STAFF_PALETTE = [
  { bg: 'bg-teal-50', border: 'border-teal-500', text: 'text-teal-900', swatch: 'bg-teal-500' },
  { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-900', swatch: 'bg-violet-500' },
  { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-900', swatch: 'bg-orange-500' },
  { bg: 'bg-pink-50', border: 'border-pink-500', text: 'text-pink-900', swatch: 'bg-pink-500' },
  { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-900', swatch: 'bg-blue-500' },
  { bg: 'bg-lime-50', border: 'border-lime-600', text: 'text-lime-900', swatch: 'bg-lime-600' },
  { bg: 'bg-cyan-50', border: 'border-cyan-500', text: 'text-cyan-900', swatch: 'bg-cyan-500' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-500', text: 'text-fuchsia-900', swatch: 'bg-fuchsia-500' },
];
const UNASSIGNED_COLOR = { bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-800', swatch: 'bg-slate-400' };

export type StaffColor = (typeof STAFF_PALETTE)[number];

export function staffColor(staffId: number | null, orderedStaffIds: number[]): StaffColor {
  if (staffId == null) return UNASSIGNED_COLOR;
  const idx = orderedStaffIds.indexOf(staffId);
  return STAFF_PALETTE[(idx === -1 ? staffId : idx) % STAFF_PALETTE.length];
}
