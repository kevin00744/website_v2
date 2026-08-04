'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  getDailyBalance,
  listFinancialRecords,
  downloadFinancialCsv,
  type FinancialRecord,
} from '@/lib/financial-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

const CATEGORY_LABEL: Record<string, string> = {
  sales: '營業收入',
  top_up: '儲值收入',
  outsource_payout: '外包費用',
  daily_expense: '日常雜支',
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: '現金',
  transfer: '轉帳',
  line_pay: 'LINE Pay',
  credit_card: '信用卡',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinancialPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [todayIncome, setTodayIncome] = useState(0);
  const [todayExpense, setTodayExpense] = useState(0);
  const [todayNet, setTodayNet] = useState(0);
  const [records, setRecords] = useState<FinancialRecord[]>();
  const [loadError, setLoadError] = useState<string>();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
    void getDailyBalance(user.storeId).then((b) => {
      // 今日收支不含備用金補充（petty_cash_replenish 已廢棄）
      setTodayIncome(b.todayIncome);
      setTodayExpense(b.todayExpense);
      setTodayNet(b.todayNet);
    }).catch(() => {});
    void loadRecords(user.storeId, today(), today());
  }, []);

  async function loadRecords(sid: number, f: string, t: string) {
    setLoadError(undefined);
    setRecords(undefined);
    try {
      const all = await listFinancialRecords(sid, { from: f, to: t });
      // 排除 petty_cash_replenish（舊資料相容），備用金系統已獨立
      setRecords(all.filter((r) => r.category !== 'petty_cash_replenish'));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗，請稍後再試');
    }
  }

  async function handleExport() {
    if (!storeId) return;
    setDownloading(true);
    try {
      await downloadFinancialCsv(storeId, from, to);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'CSV 匯出失敗');
    } finally {
      setDownloading(false);
    }
  }

  const totalIncome = records?.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalExpense = records?.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0) ?? 0;

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號未指定所屬分店。</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-kiosk-xl font-bold text-slate-900">財務帳務管理</h1>

      {/* ── 今日收支摘要 ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '今日收入', value: `$${todayIncome.toLocaleString()}`, color: 'text-kiosk-success' },
          { label: '今日支出', value: `$${todayExpense.toLocaleString()}`, color: 'text-kiosk-danger' },
          { label: '今日淨額', value: `$${todayNet.toLocaleString()}`, color: todayNet >= 0 ? 'text-kiosk-success' : 'text-kiosk-danger' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-kiosk border border-slate-200 bg-white p-4 text-center">
            <p className="text-sm text-slate-500">{label}</p>
            <p className={`text-kiosk-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── 查詢篩選 ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-kiosk border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-slate-700">開始日期</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-kiosk-base outline-none focus:border-kiosk-primary" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-slate-700">結束日期</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-kiosk-base outline-none focus:border-kiosk-primary" />
        </div>
        <KioskButton variant="primary" onClick={() => { if (storeId) void loadRecords(storeId, from, to); }}>查詢</KioskButton>
        <KioskButton variant="secondary" onClick={() => void handleExport()} disabled={downloading}>
          {downloading ? '匯出中…' : '匯出 CSV（會計版）'}
        </KioskButton>
      </div>

      {/* ── 統計 ── */}
      {records && (
        <div className="flex gap-4 text-kiosk-base">
          <span className="font-semibold text-kiosk-success">收入 ${totalIncome.toLocaleString()}</span>
          <span className="font-semibold text-kiosk-danger">支出 ${totalExpense.toLocaleString()}</span>
          <span className="text-sm text-slate-400">共 {records.length} 筆</span>
        </div>
      )}

      {loadError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}
      {!records && !loadError && <p className="text-kiosk-base text-slate-400">查詢中…</p>}
      {records?.length === 0 && (
        <p className="rounded-kiosk bg-slate-50 p-6 text-center text-kiosk-base text-slate-500">此期間無收入/支出紀錄。</p>
      )}

      {/* ── 帳務明細表 ── */}
      {records && records.length > 0 && (
        <div className="overflow-hidden rounded-kiosk border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">日期時間</th>
                <th className="px-4 py-3 text-left">科目</th>
                <th className="px-4 py-3 text-left">付款</th>
                <th className="px-4 py-3 text-right">金額</th>
                <th className="px-4 py-3 text-left">操作人</th>
                <th className="px-4 py-3 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {new Date(r.createdAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}</td>
                  <td className={`px-4 py-3 text-right font-bold ${r.type === 'income' ? 'text-kiosk-success' : 'text-kiosk-danger'}`}>
                    {r.type === 'expense' ? '-' : '+'}${r.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.performedBy.name}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-500">{r.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
