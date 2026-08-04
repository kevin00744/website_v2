import { apiRequest } from './api-client';

export interface AttendanceRecord {
  id: number;
  user: { id: number; name: string };
  storeId: number;
  clockInAt: string;
  clockOutAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface StaffAttendanceSummary {
  user: { id: number; name: string; role: string };
  daysWorked: number;
  totalMinutes: number;
}

/** 計算兩個 ISO 時間字串的差，回傳 "X 小時 Y 分" */
export function formatDuration(from: string, to: string): string {
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分鐘`;
}

export function checkIn(): Promise<AttendanceRecord> {
  return apiRequest<AttendanceRecord>('/attendance/check-in', { method: 'POST' });
}

export function checkOut(): Promise<AttendanceRecord> {
  return apiRequest<AttendanceRecord>('/attendance/check-out', { method: 'POST' });
}

export function listAttendanceRecords(userId?: number): Promise<AttendanceRecord[]> {
  const q = userId ? `?userId=${userId}` : '';
  return apiRequest<AttendanceRecord[]>(`/attendance/records${q}`);
}

export function getMonthlySummary(storeId: number, month?: string): Promise<StaffAttendanceSummary[]> {
  const q = month ? `?month=${month}` : '';
  return apiRequest<StaffAttendanceSummary[]>(`/attendance/stores/${storeId}/monthly-summary${q}`);
}
