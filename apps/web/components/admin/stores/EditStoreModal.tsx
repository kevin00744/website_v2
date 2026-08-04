'use client';

import { useEffect, useState } from 'react';
import type { StoreSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { updateStore } from '@/lib/stores-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';

interface EditStoreModalProps {
  open: boolean;
  store: StoreSummary | null;
  onClose: () => void;
  onUpdated: (store: StoreSummary) => void;
}

export function EditStoreModal({ open, store, onClose, onUpdated }: EditStoreModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (store && open) {
      setName(store.name);
      setPhone(store.phone ?? '');
      setAddress(store.address ?? '');
      setNote('');
      setError(undefined);
    }
  }, [store, open]);

  async function handleSave() {
    if (!store) return;
    if (!name.trim()) { setError('分店名稱不能空白'); return; }
    setSaving(true);
    setError(undefined);
    try {
      const updated = await updateStore(store.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CenteredModal open={open} title={`編輯分店：${store?.name ?? ''}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-1">
        <div className="rounded-kiosk bg-slate-50 px-4 py-2 text-sm text-slate-500">
          分店編號：<span className="font-mono font-bold">{store?.code}</span>　區域：{store?.region}
        </div>
        <KioskInput
          label="分店名稱"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <KioskInput
          label="電話"
          placeholder="(選填)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <KioskInput
          label="地址"
          placeholder="(選填)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <KioskInput
          label="備註"
          placeholder="(選填)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>}
        <div className="flex gap-3 pt-2">
          <KioskButton variant="ghost" onClick={onClose} disabled={saving} fullWidth>取消</KioskButton>
          <KioskButton variant="primary" onClick={() => void handleSave()} disabled={saving} fullWidth>
            {saving ? '儲存中…' : '儲存'}
          </KioskButton>
        </div>
      </div>
    </CenteredModal>
  );
}
