'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthToken, getAuthUser, saveAuth } from '@/lib/auth';
import { updateStoreFeatures } from '@/lib/stores-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

// CMS 已從分店功能開關移除，改為由 admin 角色統一控管（不受分店 feature toggle 影響）
type FeatureKey = 'pos' | 'attendance' | 'crm';

const FEATURE_CONFIG: { key: FeatureKey; label: string; description: string }[] = [
  {
    key: 'pos',
    label: 'POS 結帳',
    description: '啟用後，服務人員可在顧客詳情頁進行結帳、儲值扣款與課程扣堂。',
  },
  {
    key: 'attendance',
    label: '打卡管理',
    description: '啟用後，員工可使用打卡功能，側邊欄顯示「打卡紀錄」入口。',
  },
  {
    key: 'crm',
    label: '顧客關係管理',
    description: '啟用後，分店可存取進階 CRM 功能（目前保留，後續版本擴充）。',
  },
];

export default function StoreSettingsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    pos: false,
    attendance: false,
    crm: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user) return;

    setStoreId(user.storeId);
    setCanEdit(user.role === 'manager' || user.role === 'admin' || user.role === 'system_admin');

    // 從 cookie 的 storeFeatures 初始化（避免額外 API 請求）
    const raw = (user.storeFeatures ?? {}) as Record<string, boolean>;
    setFeatures({
      pos: raw['pos'] === true,
      attendance: raw['attendance'] === true,
      crm: raw['crm'] === true,
    });
  }, []);

  async function handleSave() {
    if (!storeId) return;
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      await updateStoreFeatures(storeId, features);

      // 更新 cookie 讓側邊欄即時反映（不需要重新登入）
      const user = getAuthUser();
      const token = getAuthToken();
      if (user && token) {
        saveAuth(token, { ...user, storeFeatures: features });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  }

  if (!storeId) {
    return (
      <div className="py-16 text-center text-kiosk-base text-slate-500">
        您的帳號未指定所屬分店，無法管理分店功能設定。
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="py-16 text-center text-kiosk-base text-slate-500">
        只有店長或管理員可以修改分店功能設定。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-kiosk-xl font-bold text-slate-900">分店功能設定</h1>
      <p className="mb-8 text-kiosk-base text-slate-500">
        勾選後該功能立即對本分店所有帳號生效（下次重新整理頁面後側邊欄更新）。
      </p>

      <div className="flex flex-col gap-4">
        {FEATURE_CONFIG.map(({ key, label, description }) => (
          <div
            key={key}
            className="flex items-start gap-4 rounded-kiosk border border-slate-200 bg-white p-5"
          >
            <input
              type="checkbox"
              id={`feature-${key}`}
              checked={features[key]}
              onChange={() => toggleFeature(key)}
              className="mt-1 h-5 w-5 cursor-pointer accent-kiosk-primary"
            />
            <label htmlFor={`feature-${key}`} className="flex-1 cursor-pointer">
              <p className="text-kiosk-base font-semibold text-slate-900">{label}</p>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </label>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-4 text-kiosk-base font-semibold text-kiosk-success">✓ 已儲存</p>
      )}

      <div className="mt-6">
        <KioskButton variant="primary" onClick={() => void handleSave()} disabled={saving} fullWidth>
          {saving ? '儲存中…' : '儲存設定'}
        </KioskButton>
      </div>
    </div>
  );
}
