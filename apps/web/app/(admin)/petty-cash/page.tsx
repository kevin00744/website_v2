'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  getPettyCashBalance,
  listPettyCashLogs,
  adjustPettyCash,
  ACTION_LABEL,
  ACTION_COLOR,
  type PettyCashLog,
} from '@/lib/petty-cash-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PettyCashPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [logs, setLogs] = useState<PettyCashLog[]>();
  const [loadError, setLoadError] = useState<string>();

  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());

  // 補充/移除表單
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string>();
  const [formSuccess, setFormSuccess] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // 設定目標金額表單
  const [targetAmount, setTargetAmount] = useState('');
  const [targetNote, setTargetNote] = useState('');
  const [targetError, setTargetError] = useState<string>();
  const [targetSuccess, setTargetSuccess] = useState<string>();
  const [targetSubmitting, setTargetSubmitting] = useState(false);

  const loadBalance = useCallback(async (sid: number) => {
    try {
      const b = await getPettyCashBalance(sid);
      setBalance(b.balance);
    } catch { /* 靜默 */ }
  }, []);

  const loadLogs = useCallback(async (sid: number, f: string, t: string) => {
    setLoadError(undefined);
    try {
      setLogs(await listPettyCashLogs(sid, { from: f, to: t }));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗');
    }
  }, []);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
    void loadBalance(user.storeId);
    void loadLogs(user.storeId, from, to);
  }, [loadBalance, loadLogs]);

  async function handleAdjust(action: 'add' | 'remove') {
    if (!storeId) return;
    setFormError(undefined);
    setFormSuccess(undefined);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) { setFormError('金額必須為正整數'); return; }
    setSubmitting(true);
    try {
      const result = await adjustPettyCash(storeId, { action, amount: amt, note: note.trim() || undefined });
      setFormSuccess(`${action === 'add' ? '補充' : '移除'} $${amt.toLocaleString()} 完成。目前備用金：$${result.balanceAfter.toLocaleString()}`);
      setAmount('');
      setNote('');
      void loadBalance(storeId);
      void loadLogs(storeId, from, to);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '操作失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetTarget() {
    if (!storeId || balance === null) return;
    setTargetError(undefined);
    setTargetSuccess(undefined);
    const target = Number(targetAmount);
    if (!Number.isInteger(target) || target < 0) { setTargetError('目標金額必須為非負整數'); return; }
    if (target === balance) { setTargetError('目標金額與目前餘額相同，無需調整'); return; }
    setTargetSubmitting(true);
    try {
      const diff = Math.abs(target - balance);
      const action = target > balance ? 'add' : 'remove';
      const result = await adjustPettyCash(storeId, { action, amount: diff, note: targetNote.trim() || `設定目標金額 $${target}` });
      setTargetSuccess(`備用金已調整至 $${result.balanceAfter.toLocaleString()}`);
      setTargetAmount('');
      setTargetNote('');
      void loadBalance(storeId);
      void loadLogs(storeId, from, to);
    } catch (err) {
      setTargetError(err instanceof ApiError ? err.message : '操作失敗');
    } finally {
      setTargetSubmitting(false);
    }
  }

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號未指定所屬分店。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-kiosk-xl font-bold text-slate-900">備用金管理</h1>

      {/* ── 現在餘額 ── */}
      <div className="rounded-kiosk border-4 border-amber-300 bg-amber-50 p-6 text-center">
        <p className="text-sm font-semibold text-amber-700">目前備用金餘額</p>
        <p className="mt-1 text-5xl font-bold tabular-nums text-amber-800">
          {balance !== null ? `$${balance.toLocaleString()}` : '—'}
        </p>
      </div>

      {/* ── 補充 / 移除 ── */}
      <div className="rounded-kiosk border-2 border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-kiosk-base font-bold text-slate-800">補充 / 移除備用金</h2>
        <div className="flex flex-col gap-3">
          <KioskInput
            label="金額（正整數）"
            required
            type="number"
            min={1}
            placeholder="例：500"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setFormError(undefined); setFormSuccess(undefined); }}
          />
          <KioskInput
            label="備注（選填）"
            placeholder="例：週五補充零錢"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {formError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {formError}</p>}
          {formSuccess && <p className="text-kiosk-base font-semibold text-kiosk-success">✓ {formSuccess}</p>}
          <div className="flex gap-3">
            <KioskButton variant="primary" fullWidth onClick={() => void handleAdjust('add')} disabled={submitting}>
              ＋ 補充備用金
            </KioskButton>
            <KioskButton variant="danger" fullWidth onClick={() => void handleAdjust('remove')} disabled={submitting}>
              － 移除備用金
            </KioskButton>
          </div>
        </div>
      </div>

      {/* ── 設定目標金額 ── */}
      <div className="rounded-kiosk border-2 border-blue-200 bg-white p-5">
        <h2 className="mb-1 text-kiosk-base font-bold text-slate-800">設定目標金額</h2>
        <p className="mb-4 text-sm text-slate-500">輸入希望備用金達到的金額，系統自動計算補充或移除的差額。</p>
        <div className="flex flex-col gap-3">
          <KioskInput
            label="目標金額"
            required
            type="number"
            min={0}
            placeholder={balance !== null ? `目前：$${balance.toLocaleString()}` : '例：2000'}
            value={targetAmount}
            onChange={(e) => { setTargetAmount(e.target.value); setTargetError(undefined); setTargetSuccess(undefined); }}
          />
          <KioskInput
            label="備注（選填）"
            placeholder="例：月初補足備用金"
            value={targetNote}
            onChange={(e) => setTargetNote(e.target.value)}
          />
          {targetError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {targetError}</p>}
          {targetSuccess && <p className="text-kiosk-base font-semibold text-kiosk-success">✓ {targetSuccess}</p>}
          <KioskButton variant="primary" fullWidth onClick={() => void handleSetTarget()} disabled={targetSubmitting || balance === null}>
            設定目標金額
          </KioskButton>
        </div>
      </div>

      {/* ── 異動歷史 ── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-kiosk-lg font-bold text-slate-800">異動歷史</h2>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (storeId) void loadLogs(storeId, e.target.value, to); }}
            className="rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-kiosk-primary" />
          <span className="text-xs text-slate-400">至</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); if (storeId) void loadLogs(storeId, from, e.target.value); }}
            className="rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-kiosk-primary" />
        </div>

        {loadError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}
        {!logs && !loadError && <p className="text-kiosk-base text-slate-400">載入中…</p>}
        {logs && logs.filter(l => l.action !== 'outsource_deduct').length === 0 && (
          <p className="rounded-kiosk bg-slate-50 p-6 text-center text-kiosk-base text-slate-500">此期間無異動紀錄。</p>
        )}
        {logs && logs.filter(l => l.action !== 'outsource_deduct').length > 0 && (
          <div className="overflow-hidden rounded-kiosk border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">時間</th>
                  <th className="px-4 py-3 text-left">類型</th>
                  <th className="px-4 py-3 text-right">金額</th>
                  <th className="px-4 py-3 text-right">餘額</th>
                  <th className="px-4 py-3 text-left">操作人</th>
                  <th className="px-4 py-3 text-left">備注</th>
                </tr>
              </thead>
              <tbody>
                {logs.filter(l => l.action !== 'outsource_deduct').map((log) => (
                  <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_COLOR[log.action]}`}>
                        {ACTION_LABEL[log.action]}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${log.action === 'add' ? 'text-kiosk-success' : 'text-kiosk-danger'}`}>
                      {log.action === 'add' ? '+' : '-'}${log.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      ${log.balanceAfter.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{log.performedBy.name}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-400">{log.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
