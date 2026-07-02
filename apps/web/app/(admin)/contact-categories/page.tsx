'use client';

import { useCallback, useEffect, useState } from 'react';
import { INQUIRY_CATEGORY_KIND_LABEL, type InquiryCategorySummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteInquiryCategory, listInquiryCategories } from '@/lib/contact-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { InquiryCategoryModal } from '@/components/admin/contact/InquiryCategoryModal';

/** 對齊後端 ContactController 的 @Roles('system_admin')：只有 admin/system_admin 看得到 */
function canManageCategories(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/** 詢問類別管理：決定「聯絡我們」表單的下拉選單有哪些選項，以及每個選項建立的訊息要怎麼分派 */
export default function ContactCategoriesPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [categories, setCategories] = useState<InquiryCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [deletingId, setDeletingId] = useState<number>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InquiryCategorySummary>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listInquiryCategories();
      setCategories(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageCategories(user?.role)) {
      void loadCategories();
    }
  }, [checkedAuth, user, loadCategories]);

  function openCreateModal() {
    setEditingCategory(undefined);
    setModalOpen(true);
  }

  function openEditModal(category: InquiryCategorySummary) {
    setEditingCategory(category);
    setModalOpen(true);
  }

  function handleSaved(saved: InquiryCategorySummary) {
    setCategories((prev) => {
      const exists = prev.some((item) => item.id === saved.id);
      return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved];
    });
  }

  async function handleDelete(category: InquiryCategorySummary) {
    if (!window.confirm(`確定要刪除「${category.name}」嗎？這個動作無法復原。`)) return;
    setDeletingId(category.id);
    try {
      await deleteInquiryCategory(category.id);
      setCategories((prev) => prev.filter((item) => item.id !== category.id));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除失敗，請稍後再試');
    } finally {
      setDeletingId(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageCategories(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">詢問類別管理只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">詢問類別管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增類別
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && categories.length === 0 && <p className="text-kiosk-base text-slate-500">目前還沒有任何類別</p>}

      <div className="flex flex-col gap-3">
        {categories.map((category) => (
          <div key={category.id} className="flex flex-col gap-2 rounded-kiosk border-2 border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col">
              <span className="text-kiosk-base font-bold text-slate-900">
                {category.name} {!category.isActive && <span className="text-kiosk-danger">（已下架）</span>}
              </span>
              <span className="text-kiosk-base text-slate-500">{INQUIRY_CATEGORY_KIND_LABEL[category.kind]}</span>
            </div>
            <div className="flex gap-2">
              <KioskButton variant="secondary" onClick={() => openEditModal(category)}>
                編輯
              </KioskButton>
              <KioskButton variant="danger" onClick={() => handleDelete(category)} disabled={deletingId === category.id}>
                {deletingId === category.id ? '刪除中…' : '刪除'}
              </KioskButton>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增類別
        </KioskButton>
      </div>

      <InquiryCategoryModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} editingCategory={editingCategory} />
    </div>
  );
}
