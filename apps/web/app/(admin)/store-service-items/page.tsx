'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  listStoreServiceItems,
  createStoreServiceItem,
  updateStoreServiceItem,
  deactivateStoreServiceItem,
  type StoreServiceItem,
} from '@/lib/store-service-items-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

export default function StoreServiceItemsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [items, setItems] = useState<StoreServiceItem[]>();
  const [loadError, setLoadError] = useState<string>();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreServiceItem | null>(null);
  // 編輯表單的暫存值
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editIsOutsourced, setEditIsOutsourced] = useState(false);
  const [editOutsourceCost, setEditOutsourceCost] = useState('');
  const [editError, setEditError] = useState<string>();
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formIsOutsourced, setFormIsOutsourced] = useState(false);
  const [formOutsourceCost, setFormOutsourceCost] = useState('');
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
    void loadItems(user.storeId);
  }, []);

  async function loadItems(sid: number) {
    setLoadError(undefined);
    try {
      setItems(await listStoreServiceItems(sid));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗，請稍後再試');
    }
  }

  function resetForm() {
    setFormName('');
    setFormPrice('');
    setFormIsOutsourced(false);
    setFormOutsourceCost('');
    setFormError(undefined);
    setShowForm(false);
  }

  async function handleCreate() {
    if (!storeId) return;
    setFormError(undefined);

    if (!formName.trim()) { setFormError('請輸入品項名稱'); return; }
    const price = Number(formPrice);
    if (!price || price <= 0) { setFormError('請輸入正確的售價'); return; }
    if (formIsOutsourced && formOutsourceCost) {
      const cost = Number(formOutsourceCost);
      if (isNaN(cost) || cost < 0) { setFormError('外包成本必須為非負整數'); return; }
    }

    setSubmitting(true);
    try {
      await createStoreServiceItem(storeId, {
        name: formName.trim(),
        price,
        isOutsourced: formIsOutsourced,
        outsourceCost: formIsOutsourced && formOutsourceCost ? Number(formOutsourceCost) : undefined,
      });
      resetForm();
      void loadItems(storeId);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '新增失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(item: StoreServiceItem) {
    setEditingItem(item);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditIsOutsourced(item.isOutsourced);
    setEditOutsourceCost(item.outsourceCost != null ? String(item.outsourceCost) : '');
    setEditError(undefined);
  }

  async function handleUpdate() {
    if (!storeId || !editingItem) return;
    if (!editName.trim()) { setEditError('品項名稱不能空白'); return; }
    const price = Number(editPrice);
    if (!price || price <= 0) { setEditError('請輸入正確的售價'); return; }
    setEditSubmitting(true);
    setEditError(undefined);
    try {
      const updated = await updateStoreServiceItem(storeId, editingItem.id, {
        name: editName.trim(),
        price,
        isOutsourced: editIsOutsourced,
        outsourceCost: editIsOutsourced && editOutsourceCost ? Number(editOutsourceCost) : undefined,
      });
      setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)));
      setEditingItem(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : '更新失敗，請稍後再試');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeactivate(itemId: number, itemName: string) {
    if (!storeId) return;
    if (!window.confirm(`確定要下架「${itemName}」嗎？下架後不影響歷史紀錄。`)) return;
    try {
      await deactivateStoreServiceItem(storeId, itemId);
      void loadItems(storeId);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失敗');
    }
  }

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號尚未設定所屬門市，請聯絡系統管理員。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-kiosk-xl font-bold text-slate-900">服務品項管理</h1>
          <p className="mt-1 text-sm text-slate-500">管理門市的服務項目與單次定價。</p>
        </div>
        {!showForm && (
          <KioskButton variant="primary" onClick={() => setShowForm(true)}>
            ＋ 新增品項
          </KioskButton>
        )}
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="mb-6 rounded-kiosk border-2 border-kiosk-primary/30 bg-white p-6">
          <h2 className="mb-4 text-kiosk-lg font-bold text-slate-800">新增服務品項</h2>
          <div className="flex flex-col gap-4">
            <KioskInput
              label="品項名稱"
              required
              placeholder="例：基礎臉部保養"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <KioskInput
              label="單次購買售價（元）"
              required
              type="number"
              min={1}
              placeholder="例：1500"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
            />

            {/* 外包選項 */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is-outsourced"
                checked={formIsOutsourced}
                onChange={(e) => {
                  setFormIsOutsourced(e.target.checked);
                  if (!e.target.checked) setFormOutsourceCost('');
                }}
                className="h-5 w-5 cursor-pointer accent-kiosk-primary"
              />
              <label htmlFor="is-outsourced" className="cursor-pointer text-kiosk-base font-semibold text-slate-800">
                此品項為外包項目
              </label>
            </div>
            {formIsOutsourced && (
              <KioskInput
                label="外包成本（元，可留空）"
                type="number"
                min={0}
                placeholder="例：800"
                value={formOutsourceCost}
                onChange={(e) => setFormOutsourceCost(e.target.value)}
              />
            )}

            {formError && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {formError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <KioskButton variant="ghost" onClick={resetForm} disabled={submitting} fullWidth>
                取消
              </KioskButton>
              <KioskButton variant="primary" onClick={() => void handleCreate()} disabled={submitting} fullWidth>
                {submitting ? '新增中…' : '確認新增'}
              </KioskButton>
            </div>
          </div>
        </div>
      )}

      {/* 品項列表 */}
      {loadError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}
      {!items && !loadError && <p className="text-kiosk-base text-slate-400">載入中…</p>}
      {items && items.length === 0 && (
        <p className="rounded-kiosk bg-slate-50 p-6 text-center text-kiosk-base text-slate-500">
          尚無服務品項，請點「＋ 新增品項」建立。
        </p>
      )}
      {items?.map((item) => (
        <div key={item.id} className="mb-3 rounded-kiosk border border-slate-200 bg-white">
          {/* 品項行 */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-kiosk-base font-bold text-slate-900">{item.name}</p>
                {item.isOutsourced && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">外包</span>
                )}
              </div>
              <p className="text-kiosk-base font-semibold text-kiosk-primary">
                售價 ${item.price.toLocaleString()} 元
                {item.isOutsourced && item.outsourceCost != null && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    外包成本 ${item.outsourceCost.toLocaleString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <KioskButton variant="secondary" onClick={() => openEdit(item)}>編輯</KioskButton>
              <KioskButton variant="danger" onClick={() => void handleDeactivate(item.id, item.name)}>下架</KioskButton>
            </div>
          </div>

          {/* Inline 編輯表單 */}
          {editingItem?.id === item.id && (
            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-3">
                <KioskInput label="品項名稱" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                <KioskInput label="售價（元）" required type="number" min={1} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                <div className="flex items-center gap-3">
                  <input type="checkbox" id={`edit-outsourced-${item.id}`} checked={editIsOutsourced}
                    onChange={(e) => { setEditIsOutsourced(e.target.checked); if (!e.target.checked) setEditOutsourceCost(''); }}
                    className="h-5 w-5 cursor-pointer accent-kiosk-primary"
                  />
                  <label htmlFor={`edit-outsourced-${item.id}`} className="cursor-pointer text-kiosk-base font-semibold text-slate-800">外包項目</label>
                </div>
                {editIsOutsourced && (
                  <KioskInput label="外包成本（元）" type="number" min={0} value={editOutsourceCost} onChange={(e) => setEditOutsourceCost(e.target.value)} />
                )}
                {editError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {editError}</p>}
                <div className="flex gap-2">
                  <KioskButton variant="ghost" onClick={() => setEditingItem(null)} disabled={editSubmitting} fullWidth>取消</KioskButton>
                  <KioskButton variant="primary" onClick={() => void handleUpdate()} disabled={editSubmitting} fullWidth>
                    {editSubmitting ? '儲存中…' : '儲存'}
                  </KioskButton>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
