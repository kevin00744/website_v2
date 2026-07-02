'use client';

import { useEffect, useState } from 'react';
import { CONTACT_ROLE_LABEL, type ChatManageableUser } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { clearContactPermissions, getContactPermissionState, setContactPermissions } from '@/lib/chat-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';

interface ChatContactPermissionModalProps {
  open: boolean;
  onClose: () => void;
  target: ChatManageableUser;
  /** 候選聯絡人：所有 dealer/manager/admin/system_admin（已排除 target 自己） */
  candidates: ChatManageableUser[];
}

const REGION_LABEL: Record<string, string> = { north: '北區', central: '中區', south: '南區' };

/**
 * admin/system_admin 用來調整某個 dealer/manager 可聊天清單的畫面：
 * 「目前使用預設」時勾選狀態就是系統算出來的上下游名單，存檔後會變成自訂覆寫；
 * 「恢復預設」會清空覆寫紀錄，下次打開畫面又會看到系統重新算出來的上下游。
 */
export function ChatContactPermissionModal({ open, onClose, target, candidates }: ChatContactPermissionModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [usingDefault, setUsingDefault] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadError(undefined);
    setSaveError(undefined);
    setSaved(false);
    getContactPermissionState(target.id)
      .then((state) => {
        setUsingDefault(state.usingDefault);
        setSelectedIds(new Set(state.contactUserIds));
      })
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : '載入目前設定失敗，請稍後再試'));
  }, [open, target.id]);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaveError(undefined);
    setSaving(true);
    try {
      const state = await setContactPermissions(target.id, [...selectedIds]);
      setUsingDefault(state.usingDefault);
      setSelectedIds(new Set(state.contactUserIds));
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToDefault() {
    setSaveError(undefined);
    setSaving(true);
    try {
      const state = await clearContactPermissions(target.id);
      setUsingDefault(state.usingDefault);
      setSelectedIds(new Set(state.contactUserIds));
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : '恢復預設失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title={`調整「${target.name}」的可聊天清單`} maxWidthClassName="md:max-w-3xl">
      <div className="flex h-full flex-col gap-5">
        <p className="text-kiosk-base text-slate-600">
          {usingDefault
            ? '目前使用系統預設清單（依經銷商/店長的上下游關係自動算出）。勾選後按「儲存」會改成自訂清單。'
            : '目前使用管理員自訂清單。按「恢復預設」可以清空自訂設定，改回系統自動算出的上下游清單。'}
        </p>

        {loadError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {loadError}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {candidates.map((candidate) => (
            <label
              key={candidate.id}
              className="flex items-center justify-between rounded-kiosk border-2 border-slate-200 bg-white p-4"
            >
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-6 w-6"
                  checked={selectedIds.has(candidate.id)}
                  onChange={() => toggle(candidate.id)}
                />
                <span className="text-kiosk-base font-bold text-slate-900">{candidate.name}</span>
              </span>
              <span className="text-kiosk-base text-slate-500">
                {CONTACT_ROLE_LABEL[candidate.role]}
                {candidate.region ? `・${REGION_LABEL[candidate.region]}` : ''}
              </span>
            </label>
          ))}
        </div>

        {saveError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {saveError}
          </p>
        )}
        {saved && !saveError && <p className="text-kiosk-base font-semibold text-kiosk-success">已更新</p>}

        <div className="flex gap-3">
          <KioskButton variant="secondary" onClick={handleResetToDefault} disabled={saving || usingDefault}>
            恢復預設
          </KioskButton>
          <KioskButton variant="primary" fullWidth onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </KioskButton>
        </div>
      </div>
    </CenteredModal>
  );
}
