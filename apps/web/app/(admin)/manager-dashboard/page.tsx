'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  getMonthlySummary,
  formatMinutes,
  type StaffAttendanceSummary,
} from '@/lib/attendance-api';
import {
  listFinancialRecords,
  type FinancialRecord,
} from '@/lib/financial-api';
import { listServiceRecordsByStaff, type ServiceRecordResult } from '@/lib/service-records-api';
import { listStoreStaff, type StoreStaffMember } from '@/lib/stores-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

// ServiceRecord 型別由 service-records-api.ts 的 ServiceRecordResult 提供

type LedgerTab = 'all' | 'service' | 'financial';

const CONSUMPTION_LABEL: Record<string, string> = {
  single_purchase: '單次消費',
  wallet_deduction: '扣儲值金',
  course_deduction: '扣課程堂數',
};
const CATEGORY_LABEL: Record<string, string> = {
  sales: '銷售收入',
  top_up: '儲值',
  outsource_payout: '外包支出',
  daily_expense: '日常支出',
  petty_cash_replenish: '備用金補充',
};

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}
function monthStart(month: string) { return `${month}-01`; }
function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}
function fmt(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ─── 主頁面 ─────────────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [month, setMonth] = useState(thisMonth());

  const [staff, setStaff] = useState<StoreStaffMember[]>([]);
  const [summary, setSummary] = useState<StaffAttendanceSummary[]>([]);
  const [loadError, setLoadError] = useState<string>();

  // 選中員工
  const [selectedStaff, setSelectedStaff] = useState<StoreStaffMember | null>(null);
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>('all');
  const [serviceRecords, setServiceRecords] = useState<ServiceRecordResult[]>();
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>();
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
  }, []);

  const loadData = useCallback(async (sid: number, mo: string) => {
    setLoadError(undefined);
    try {
      const [staffList, summaryData] = await Promise.all([
        listStoreStaff(sid),
        getMonthlySummary(sid, mo),
      ]);
      setStaff(staffList);
      setSummary(summaryData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗');
    }
  }, []);

  useEffect(() => {
    if (storeId) void loadData(storeId, month);
  }, [storeId, month, loadData]);

  // 載入員工業績帳目
  const loadLedger = useCallback(async (sid: number, staffId: number, mo: string) => {
    setLedgerLoading(true);
    setServiceRecords(undefined);
    setFinancialRecords(undefined);
    try {
      const from = monthStart(mo);
      const to = monthEnd(mo);
      const [svcRes, finRes] = await Promise.all([
        listServiceRecordsByStaff(sid, staffId, { from, to }),
        listFinancialRecords(sid, { from, to, staffId: String(staffId) }),
      ]);
      setServiceRecords(svcRes);
      setFinancialRecords(finRes);
    } catch { /* 靜默 */ }
    finally { setLedgerLoading(false); }
  }, []);

  function handleSelectStaff(s: StoreStaffMember) {
    setSelectedStaff(s);
    setLedgerTab('all');
    if (storeId) void loadLedger(storeId, s.id, month);
  }

  function handleMonthChange(m: string) {
    setMonth(m);
    if (selectedStaff && storeId) void loadLedger(storeId, selectedStaff.id, m);
  }

  // 統計摘要
  function getSummaryForStaff(staffId: number) {
    return summary.find((s) => s.user.id === staffId);
  }

  // 業績帳目篩選
  const filteredServiceRecords = serviceRecords ?? [];
  const filteredFinancialRecords = (financialRecords ?? []).filter((r) =>
    ledgerTab === 'all' || r.type === 'income'
  );

  const totalSales = filteredFinancialRecords
    .filter((r) => r.type === 'income' && r.category === 'sales')
    .reduce((s, r) => s + r.amount, 0);
  const totalTopUp = filteredFinancialRecords
    .filter((r) => r.type === 'income' && r.category === 'top_up')
    .reduce((s, r) => s + r.amount, 0);

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">此帳號尚未設定所屬門市，請聯絡系統管理員。</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* ── 標題列 ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-kiosk-xl font-bold text-slate-900">員工考勤 & 業績儀表板</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">查詢月份</label>
          <input
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-kiosk-base outline-none focus:border-kiosk-primary"
          />
        </div>
      </div>

      {loadError && <p className="mb-4 text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}

      {/* ── 員工考勤總覽 ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-kiosk-lg font-bold text-slate-800">員工出勤總覽</h2>
        {staff.length === 0 ? (
          <p className="rounded-kiosk bg-slate-50 p-4 text-center text-kiosk-base text-slate-500">目前尚無員工帳號</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {staff.map((s) => {
              const sum = getSummaryForStaff(s.id);
              const isSelected = selectedStaff?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectStaff(s)}
                  className={`rounded-kiosk border-2 p-4 text-left transition-all ${
                    isSelected ? 'border-kiosk-primary bg-kiosk-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-kiosk-base font-bold text-slate-900">{s.name}</p>
                      <p className="text-sm text-slate-500">{s.role === 'manager' ? '店長' : '服務人員'}</p>
                    </div>
                    {isSelected && <span className="rounded-full bg-kiosk-primary px-2 py-0.5 text-xs text-white">查看中</span>}
                  </div>
                  {sum ? (
                    <div className="mt-3 flex gap-4 text-sm">
                      <span className="text-slate-700">
                        📅 出勤 <strong>{sum.daysWorked}</strong> 天
                      </span>
                      <span className="text-slate-700">
                        ⏱ <strong>{formatMinutes(sum.totalMinutes)}</strong>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">本月無出勤紀錄</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 員工業績帳目 ── */}
      {selectedStaff && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-kiosk-lg font-bold text-slate-800">
              {selectedStaff.name} 的業績帳目
            </h2>
            {/* 業績摘要 */}
            <div className="flex gap-4 text-sm">
              <span className="text-kiosk-success font-semibold">銷售 ${totalSales.toLocaleString()}</span>
              <span className="text-kiosk-primary font-semibold">儲值 ${totalTopUp.toLocaleString()}</span>
            </div>
          </div>

          {/* Tab 切換 */}
          <div className="mb-4 flex gap-1 rounded-kiosk bg-slate-100 p-1">
            {([
              { key: 'all', label: '全部' },
              { key: 'service', label: '服務紀錄' },
              { key: 'financial', label: '銷售 / 儲值' },
            ] as { key: LedgerTab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLedgerTab(key)}
                className={`flex-1 rounded-kiosk py-2 text-sm font-semibold transition-colors ${
                  ledgerTab === key ? 'bg-white text-kiosk-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {ledgerLoading && <p className="text-kiosk-base text-slate-400">載入中…</p>}

          {/* 服務紀錄 Tab */}
          {!ledgerLoading && (ledgerTab === 'all' || ledgerTab === 'service') && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-slate-600">
                服務操作紀錄（{filteredServiceRecords.length} 筆）
              </h3>
              {filteredServiceRecords.length === 0 ? (
                <p className="rounded-kiosk bg-slate-50 p-4 text-center text-sm text-slate-400">本月無服務紀錄</p>
              ) : (
                <div className="overflow-hidden rounded-kiosk border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">時間</th>
                        <th className="px-3 py-2 text-left">顧客</th>
                        <th className="px-3 py-2 text-left">項目</th>
                        <th className="px-3 py-2 text-center">類型</th>
                        <th className="px-3 py-2 text-right">金額/堂</th>
                        <th className="px-3 py-2 text-center">簽名</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredServiceRecords.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-slate-400">{fmt(r.createdAt)}</td>
                          <td className="px-3 py-2 text-slate-700">{r.customer.name}</td>
                          <td className="px-3 py-2 text-slate-700">{(r.serviceItem as { name: string }).name}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              r.consumptionType === 'single_purchase' ? 'bg-green-100 text-green-700'
                              : r.consumptionType === 'wallet_deduction' ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                            }`}>
                              {CONSUMPTION_LABEL[r.consumptionType] ?? r.consumptionType}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">
                            {r.consumptionType === 'course_deduction'
                              ? `${r.sessionsDeducted ?? 1} 堂`
                              : `$${(r.amountPaid ?? 0).toLocaleString()}`}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.customerSignatureUrl
                              ? <span className="text-kiosk-success">✓</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 財務帳目 Tab（銷售 / 儲值） */}
          {!ledgerLoading && (ledgerTab === 'all' || ledgerTab === 'financial') && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">
                銷售 / 儲值紀錄（{filteredFinancialRecords.filter(r => r.type === 'income').length} 筆）
              </h3>
              {filteredFinancialRecords.filter(r => r.type === 'income').length === 0 ? (
                <p className="rounded-kiosk bg-slate-50 p-4 text-center text-sm text-slate-400">本月無銷售或儲值紀錄</p>
              ) : (
                <div className="overflow-hidden rounded-kiosk border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">時間</th>
                        <th className="px-3 py-2 text-left">科目</th>
                        <th className="px-3 py-2 text-left">付款</th>
                        <th className="px-3 py-2 text-right">金額</th>
                        <th className="px-3 py-2 text-left">說明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFinancialRecords
                        .filter((r) => r.type === 'income')
                        .map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-mono text-xs text-slate-400">{fmt(r.createdAt)}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                r.category === 'top_up' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {CATEGORY_LABEL[r.category] ?? r.category}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500">{r.paymentMethod}</td>
                            <td className="px-3 py-2 text-right font-bold text-kiosk-success">
                              ${r.amount.toLocaleString()}
                            </td>
                            <td className="max-w-xs truncate px-3 py-2 text-slate-500">
                              {r.description ?? '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
