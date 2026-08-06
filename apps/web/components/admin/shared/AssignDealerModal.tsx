'use client';
import { useState } from 'react';
import type { UserSummary } from '@website-v2/shared-types';
import { KioskButton } from '../kiosk/KioskButton';

interface AssignDealerModalProps {
  open: boolean;
  targetName: string;
  currentDealerId: number | null;
  dealers: UserSummary[];
  onAssign: (dealerId: number | null) => Promise<void>;
  onClose: () => void;
}

export function AssignDealerModal({ open, targetName, currentDealerId, dealers, onAssign, onClose }: AssignDealerModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(currentDealerId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(undefined);
    try {
      await onAssign(selectedId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-kiosk bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-kiosk-lg font-bold text-slate-900">指定負責代理</h2>
        <p className="mb-4 text-sm text-slate-500">為「{targetName}」選擇負責代理商</p>

        <div className="mb-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
          <label className="flex cursor-pointer items-center gap-3 rounded-kiosk border border-slate-200 px-4 py-3 hover:bg-slate-50">
            <input
              type="radio"
              name="dealer"
              checked={selectedId === null}
              onChange={() => setSelectedId(null)}
              className="accent-kiosk-primary"
            />
            <span className="text-kiosk-base text-slate-500">— 不指定代理</span>
          </label>
          {dealers.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded-kiosk border border-slate-200 px-4 py-3 hover:bg-slate-50">
              <input
                type="radio"
                name="dealer"
                checked={selectedId === d.id}
                onChange={() => setSelectedId(d.id)}
                className="accent-kiosk-primary"
              />
              <span className="text-kiosk-base font-semibold text-slate-800">{d.name}</span>
              {d.region && <span className="text-sm text-slate-400">（{d.region === 'A' ? '北部' : d.region === 'B' ? '中部' : '南部'}）</span>}
            </label>
          ))}
          {dealers.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">目前沒有代理帳號</p>
          )}
        </div>

        {error && <p className="mb-3 text-sm font-semibold text-kiosk-danger">⚠️ {error}</p>}

        <div className="flex gap-3">
          <KioskButton variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '確認指定'}
          </KioskButton>
          <KioskButton variant="ghost" onClick={onClose} disabled={saving}>取消</KioskButton>
        </div>
      </div>
    </div>
  );
}
