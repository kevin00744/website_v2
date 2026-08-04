'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StoreSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteStore, listStores, setStoreStatus } from '@/lib/stores-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { StoreCardList } from '@/components/admin/stores/StoreCardList';
import { StoreTable } from '@/components/admin/stores/StoreTable';
import { NewStoreModal } from '@/components/admin/stores/NewStoreModal';
import { EditStoreModal } from '@/components/admin/stores/EditStoreModal';

/** 對齊 StoresController 的 @Roles('dealer','manager')：admin/system_admin/dealer 都能進這個頁面 */
function canManageStores(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'dealer';
}

function isAdminRole(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 分店管理：middleware.ts 已經會在路由層擋掉沒有權限的角色（連畫面都進不來），
 * 這裡的角色檢查是第二層防線（例如 cookie 被手動清掉/竄改成奇怪格式的邊角情況），
 * 也讓使用者在畫面上看到清楚的白話文說明，而不是一個空白頁面。
 *
 * 經銷商（dealer）的區域鎖定完全交給後端 service 層把關（建店時驗證 region、查清單時自動篩選），
 * 前端這裡不用、也不該自己重算一份篩選邏輯——後端回什麼，畫面就顯示什麼。
 */
export default function StoresPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [togglingId, setTogglingId] = useState<number>();
  const [deletingId, setDeletingId] = useState<number>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreSummary | null>(null);

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadStores = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listStores(true);
      setStores(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageStores(user?.role)) {
      void loadStores();
    }
  }, [checkedAuth, user, loadStores]);

  async function handleToggleStatus(store: StoreSummary) {
    setTogglingId(store.id);
    try {
      const updated = await setStoreStatus(store.id, !store.isActive);
      setStores((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '更新分店狀態失敗，請稍後再試');
    } finally {
      setTogglingId(undefined);
    }
  }

  function handleCreated(store: StoreSummary) {
    setStores((prev) => [...prev, store].sort((a, b) => a.code.localeCompare(b.code)));
  }

  async function handleDelete(store: StoreSummary) {
    if (!window.confirm(`確定要刪除分店「${store.name}」嗎？這個動作無法復原。`)) return;
    setDeletingId(store.id);
    try {
      await deleteStore(store.id);
      setStores((prev) => prev.filter((item) => item.id !== store.id));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除分店失敗，請稍後再試');
    } finally {
      setDeletingId(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageStores(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">分店管理只開放給管理員與經銷商，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  // 啟用/停用目前後端只開放 admin/system_admin（見 stores.controller.ts），dealer 看得到分店但不能切換狀態
  const canToggleStatus = isAdminRole(user?.role);
  const dealerLockedRegion = user?.role === 'dealer' ? user.region ?? undefined : undefined;

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">分店管理</h1>
        <KioskButton onClick={() => setModalOpen(true)} className="hidden md:inline-flex">
          ＋ 新增分店
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && stores.length === 0 && (
        <p className="text-kiosk-base text-slate-500">目前還沒有任何分店資料</p>
      )}

      <StoreTable
        stores={stores}
        onToggleStatus={handleToggleStatus}
        togglingId={togglingId}
        canToggleStatus={canToggleStatus}
        onDelete={canToggleStatus ? handleDelete : undefined}
        deletingId={deletingId}
        onEdit={canToggleStatus ? (s) => setEditingStore(s) : undefined}
      />
      <StoreCardList
        stores={stores}
        onToggleStatus={handleToggleStatus}
        togglingId={togglingId}
        canToggleStatus={canToggleStatus}
        onDelete={canToggleStatus ? handleDelete : undefined}
        deletingId={deletingId}
        onEdit={canToggleStatus ? (s) => setEditingStore(s) : undefined}
      />

      {/* 手機版：重點按鈕固定置底，永遠在大拇指範圍內 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={() => setModalOpen(true)}>
          ＋ 新增分店
        </KioskButton>
      </div>

      <NewStoreModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
        lockedRegion={dealerLockedRegion}
      />
      <EditStoreModal
        open={Boolean(editingStore)}
        store={editingStore}
        onClose={() => setEditingStore(null)}
        onUpdated={(updated) => {
          setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          setEditingStore(null);
        }}
      />
    </div>
  );
}
