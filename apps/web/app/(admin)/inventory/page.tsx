'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RestockRequestSummary, StoreInventorySummary, StoreSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { completeRestockRequest, listInventory, listRestockRequests } from '@/lib/inventory-api';
import { listStores } from '@/lib/stores-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';
import { RestockRequestModal } from '@/components/admin/inventory/RestockRequestModal';
import { RestockRequestList } from '@/components/admin/inventory/RestockRequestList';
import { formatDate } from '@/lib/format';

/** 對齊後端 InventoryController：manager 看自己分店庫存；admin/system_admin 可任選分店查看 */
function canViewStockLevels(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager';
}

/** 對齊後端 InventoryController 的 restock-requests 系列路由：manager/dealer 額外開放，admin/system_admin 一律放行 */
function canViewRestockRequests(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager' || role === 'dealer';
}

/** 只有 dealer/admin/system_admin 能把補貨請求標記完成；manager 自己提的請求要由經銷商確認，不能自己打勾 */
function canCompleteRestockRequests(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'dealer';
}

/**
 * 庫存管理：manager 看自己分店的庫存快照＋能提出補貨請求；dealer 看自己區域內所有分店送來的
 * 補貨請求，補完貨後打勾標記完成（這就是「向同區經銷商發送補貨訊息」的實際機制——不是真的
 * 推訊息，而是經銷商本來就只查得到自己區域的請求，店長一提出，對應經銷商自然看得到）；
 * admin/system_admin 可以切換查看任何分店的庫存，也能看到全部補貨請求並標記完成。
 */
export default function InventoryPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number>();
  const [inventory, setInventory] = useState<StoreInventorySummary[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string>();

  const [requests, setRequests] = useState<RestockRequestSummary[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string>();
  const [completingId, setCompletingId] = useState<number>();
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'system_admin';

  useEffect(() => {
    if (!isAdmin) return;
    listStores()
      .then((result) => {
        setStores(result);
        setSelectedStoreId((prev) => prev ?? result[0]?.id);
      })
      .catch(() => setStores([]));
  }, [isAdmin]);

  const loadInventory = useCallback(async () => {
    if (!canViewStockLevels(user?.role)) return;
    if (isAdmin && !selectedStoreId) return;
    setInventoryLoading(true);
    setInventoryError(undefined);
    try {
      const result = await listInventory(isAdmin ? selectedStoreId : undefined);
      setInventory(result);
    } catch (error) {
      setInventoryError(error instanceof ApiError ? error.message : '載入庫存資料失敗，請稍後再試');
    } finally {
      setInventoryLoading(false);
    }
  }, [user, isAdmin, selectedStoreId]);

  const loadRequests = useCallback(async () => {
    if (!canViewRestockRequests(user?.role)) return;
    setRequestsLoading(true);
    setRequestsError(undefined);
    try {
      const result = await listRestockRequests();
      setRequests(result);
    } catch (error) {
      setRequestsError(error instanceof ApiError ? error.message : '載入補貨請求失敗，請稍後再試');
    } finally {
      setRequestsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (checkedAuth) void loadInventory();
  }, [checkedAuth, loadInventory]);

  useEffect(() => {
    if (checkedAuth) void loadRequests();
  }, [checkedAuth, loadRequests]);

  async function handleComplete(request: RestockRequestSummary) {
    setCompletingId(request.id);
    try {
      const updated = await completeRestockRequest(request.id);
      setRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setRequestsError(error instanceof ApiError ? error.message : '標記完成失敗，請稍後再試');
    } finally {
      setCompletingId(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canViewStockLevels(user?.role) && !canViewRestockRequests(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  const pendingRequests = requests.filter((request) => !request.isCompleted);
  const completedRequests = requests.filter((request) => request.isCompleted);
  const isDealer = user?.role === 'dealer';

  return (
    <div className="flex flex-col gap-8 pb-24 md:pb-0">
      <h1 className="text-kiosk-xl font-bold text-slate-900">庫存管理</h1>

      {canViewStockLevels(user?.role) && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-kiosk-lg font-bold text-slate-900">目前庫存</h2>
            {user?.role === 'manager' && (
              <KioskButton onClick={() => setRequestModalOpen(true)}>＋ 提出補貨請求</KioskButton>
            )}
          </div>

          {isAdmin && (
            <div className="max-w-sm">
              <KioskSelect
                label="查看分店"
                options={stores.map((store) => ({ value: String(store.id), label: `${store.code} ${store.name}` }))}
                value={selectedStoreId ? String(selectedStoreId) : ''}
                onChange={(event) => setSelectedStoreId(Number(event.target.value))}
              />
            </div>
          )}

          {inventoryError && (
            <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {inventoryError}
            </p>
          )}
          {inventoryLoading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
          {!inventoryLoading && !inventoryError && inventory.length === 0 && (
            <p className="text-kiosk-base text-slate-500">這間分店目前沒有任何庫存紀錄</p>
          )}
          {!inventoryLoading && inventory.length > 0 && (
            <table className="w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-kiosk-base text-slate-500">
                  <th className="px-4">商品</th>
                  <th className="px-4">SKU</th>
                  <th className="px-4">目前數量</th>
                  <th className="px-4">最後更新</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item.id} className="rounded-kiosk bg-white text-kiosk-base text-slate-800 shadow-sm">
                    <td className="rounded-l-kiosk px-4 py-4 font-semibold">{item.productName}</td>
                    <td className="px-4 py-4 font-mono text-slate-500">{item.productSku}</td>
                    <td className="px-4 py-4">{item.quantity}</td>
                    <td className="rounded-r-kiosk px-4 py-4 text-slate-500">{formatDate(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {canViewRestockRequests(user?.role) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-kiosk-lg font-bold text-slate-900">{isDealer ? '我負責區域的補貨請求' : '補貨請求'}</h2>

          {requestsError && (
            <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {requestsError}
            </p>
          )}
          {requestsLoading && <p className="text-kiosk-base text-slate-500">載入中…</p>}

          {!requestsLoading && !requestsError && (
            <>
              <div className="flex flex-col gap-3">
                <h3 className="text-kiosk-base font-bold text-slate-700">待補貨（{pendingRequests.length}）</h3>
                <RestockRequestList
                  requests={pendingRequests}
                  onComplete={canCompleteRestockRequests(user?.role) ? handleComplete : undefined}
                  completingId={completingId}
                  showStore={!isAdmin ? isDealer : true}
                />
              </div>
              {completedRequests.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-kiosk-base font-bold text-slate-700">已完成（{completedRequests.length}）</h3>
                  <RestockRequestList requests={completedRequests} showStore={!isAdmin ? isDealer : true} />
                </div>
              )}
            </>
          )}
        </section>
      )}

      {user?.role === 'manager' && (
        <RestockRequestModal
          open={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          onCreated={(created) => {
            setRequests((prev) => [created, ...prev]);
          }}
        />
      )}
    </div>
  );
}
