'use client';

import { useEffect, useState } from 'react';
import { getAuthUser } from '@/lib/auth';

export type StoreFeatures = Record<string, boolean>;

/** 從 cookie 讀取目前登入者所屬分店的功能開關設定 */
export function useStoreFeatures(): StoreFeatures | null {
  const [features, setFeatures] = useState<StoreFeatures | null>(null);
  useEffect(() => {
    const user = getAuthUser();
    setFeatures((user?.storeFeatures as StoreFeatures) ?? null);
  }, []);
  return features;
}

/**
 * admin/system_admin 繞過所有 feature gate（與 RolesGuard isAdminRole 超集邏輯一致）。
 * 其他角色：features 為 null（無分店）或 feature 不存在或值為 false → 視為未啟用。
 */
export function hasFeature(
  features: StoreFeatures | null,
  key: string,
  role: string,
): boolean {
  if (role === 'admin' || role === 'system_admin') return true;
  return features?.[key] === true;
}
