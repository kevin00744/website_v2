'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProductAdminSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteProduct, listProductsForAdmin, updateProduct } from '@/lib/products-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { ProductSettingsModal } from '@/components/admin/products/ProductSettingsModal';
import { formatDate } from '@/lib/format';

/** 對齊後端 ProductsController 的 @Roles('system_admin')：admin/system_admin 才能進來 */
function canManageProducts(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/** 商品管理：建立/編輯/上下架/刪除商品目錄——補貨請求、商品使用紀錄選的商品清單都來自這裡 */
export default function ProductsPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [products, setProducts] = useState<ProductAdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [togglingId, setTogglingId] = useState<number>();
  const [deletingId, setDeletingId] = useState<number>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductAdminSummary>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listProductsForAdmin();
      setProducts(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageProducts(user?.role)) {
      void loadProducts();
    }
  }, [checkedAuth, user, loadProducts]);

  function openCreateModal() {
    setEditingProduct(undefined);
    setModalOpen(true);
  }

  function openEditModal(product: ProductAdminSummary) {
    setEditingProduct(product);
    setModalOpen(true);
  }

  function handleSaved(saved: ProductAdminSummary) {
    setProducts((prev) => {
      const exists = prev.some((item) => item.id === saved.id);
      return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
    });
  }

  async function handleToggleActive(product: ProductAdminSummary) {
    setTogglingId(product.id);
    try {
      const updated = await updateProduct(product.id, {
        sku: product.sku,
        name: product.name,
        unit: product.unit ?? '',
        description: product.description ?? '',
        isActive: !product.isActive,
      });
      setProducts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '更新商品狀態失敗，請稍後再試');
    } finally {
      setTogglingId(undefined);
    }
  }

  async function handleDelete(product: ProductAdminSummary) {
    if (!window.confirm(`確定要刪除商品「${product.name}」嗎？這個動作無法復原。`)) return;
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除商品失敗，請稍後再試');
    } finally {
      setDeletingId(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageProducts(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">商品管理只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">商品管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增商品
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && products.length === 0 && <p className="text-kiosk-base text-slate-500">目前還沒有任何商品</p>}

      {/* 桌機版表格 */}
      {products.length > 0 && (
        <table className="hidden w-full border-separate border-spacing-y-3 md:table">
          <thead>
            <tr className="text-left text-kiosk-base text-slate-500">
              <th className="px-4">商品名稱</th>
              <th className="px-4">SKU</th>
              <th className="px-4">單位</th>
              <th className="px-4">狀態</th>
              <th className="px-4">最後更新</th>
              <th className="px-4" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="rounded-kiosk bg-white text-kiosk-base text-slate-800 shadow-sm">
                <td className="rounded-l-kiosk px-4 py-5 font-semibold">{product.name}</td>
                <td className="px-4 py-5 font-mono text-slate-600">{product.sku}</td>
                <td className="px-4 py-5">{product.unit ?? '—'}</td>
                <td className="px-4 py-5">
                  <span
                    className={`rounded-kiosk px-3 py-1 font-semibold ${
                      product.isActive ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {product.isActive ? '上架中' : '已下架'}
                  </span>
                </td>
                <td className="px-4 py-5">{formatDate(product.updatedAt)}</td>
                <td className="rounded-r-kiosk px-4 py-5">
                  <div className="flex flex-wrap gap-2">
                    <KioskButton variant="secondary" onClick={() => openEditModal(product)}>
                      編輯
                    </KioskButton>
                    <KioskButton
                      variant={product.isActive ? 'ghost' : 'secondary'}
                      onClick={() => handleToggleActive(product)}
                      disabled={togglingId === product.id}
                    >
                      {product.isActive ? '下架' : '上架'}
                    </KioskButton>
                    <KioskButton variant="danger" onClick={() => handleDelete(product)} disabled={deletingId === product.id}>
                      {deletingId === product.id ? '刪除中…' : '刪除'}
                    </KioskButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 手機版卡片 */}
      <ul className="flex flex-col gap-3 md:hidden">
        {products.map((product) => (
          <li key={product.id} className="flex flex-col gap-3 rounded-kiosk bg-white px-5 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-kiosk-lg font-bold text-slate-900">{product.name}</span>
                <span className="font-mono text-kiosk-base text-slate-500">{product.sku}</span>
                <span className="text-kiosk-base text-slate-500">{product.unit ?? '—'}</span>
              </div>
              <span
                className={`shrink-0 rounded-kiosk px-3 py-1 text-kiosk-base font-semibold ${
                  product.isActive ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {product.isActive ? '上架中' : '已下架'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <KioskButton variant="secondary" fullWidth onClick={() => openEditModal(product)}>
                編輯
              </KioskButton>
              <KioskButton
                variant={product.isActive ? 'ghost' : 'secondary'}
                fullWidth
                onClick={() => handleToggleActive(product)}
                disabled={togglingId === product.id}
              >
                {product.isActive ? '下架' : '上架'}
              </KioskButton>
              <KioskButton variant="danger" fullWidth onClick={() => handleDelete(product)} disabled={deletingId === product.id}>
                {deletingId === product.id ? '刪除中…' : '刪除'}
              </KioskButton>
            </div>
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增商品
        </KioskButton>
      </div>

      <ProductSettingsModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} editingProduct={editingProduct} />
    </div>
  );
}
