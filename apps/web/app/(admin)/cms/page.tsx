'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PageSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteCmsPage, listCmsPages } from '@/lib/cms-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { CmsPageTable } from '@/components/admin/cms/CmsPageTable';
import { CmsPageCardList } from '@/components/admin/cms/CmsPageCardList';
import { PageSettingsModal } from '@/components/admin/cms/PageSettingsModal';
import { PageContentEditor } from '@/components/admin/cms/PageContentEditor';

/** 對齊後端 CmsController 的 admin/pages 系列路由 @Roles('admin')：system_admin 透過 isAdminRole 超集自動放行 */
function canManageCms(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 「編輯內容」開的是全螢幕覆蓋層（PageContentEditor），不是 CenteredModal——GrapesJS 需要完整畫面寬度。
 * 「設定」開的才是一般大小的置中 Modal（PageSettingsModal），只動標題/SEO/發布狀態，不碰 content。
 */
export default function CmsPagesPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string>();
  const [editingContentPage, setEditingContentPage] = useState<PageSummary>();
  const [deletingSlug, setDeletingSlug] = useState<string>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listCmsPages();
      setPages(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageCms(user?.role)) {
      void loadPages();
    }
  }, [checkedAuth, user, loadPages]);

  function openCreateModal() {
    setEditingSlug(undefined);
    setSettingsModalOpen(true);
  }

  function openSettingsModal(page: PageSummary) {
    setEditingSlug(page.slug);
    setSettingsModalOpen(true);
  }

  function handleSaved(saved: PageSummary) {
    setPages((prev) => {
      const exists = prev.some((item) => item.id === saved.id);
      return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
    });
  }

  async function handleDelete(page: PageSummary) {
    if (!window.confirm(`確定要刪除頁面「${page.title}」嗎？這個動作無法復原。`)) return;
    setDeletingSlug(page.slug);
    try {
      await deleteCmsPage(page.slug);
      setPages((prev) => prev.filter((item) => item.slug !== page.slug));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除頁面失敗，請稍後再試');
    } finally {
      setDeletingSlug(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageCms(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">官網頁面管理只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  if (editingContentPage) {
    return (
      <PageContentEditor
        slug={editingContentPage.slug}
        title={editingContentPage.title}
        onClose={() => {
          setEditingContentPage(undefined);
          void loadPages();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">官網頁面管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增頁面
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && pages.length === 0 && <p className="text-kiosk-base text-slate-500">目前還沒有任何頁面</p>}

      <CmsPageTable
        pages={pages}
        onEditSettings={openSettingsModal}
        onEditContent={setEditingContentPage}
        onDelete={handleDelete}
        deletingSlug={deletingSlug}
      />
      <CmsPageCardList
        pages={pages}
        onEditSettings={openSettingsModal}
        onEditContent={setEditingContentPage}
        onDelete={handleDelete}
        deletingSlug={deletingSlug}
      />

      {/* 手機版：重點按鈕固定置底，永遠在大拇指範圍內 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增頁面
        </KioskButton>
      </div>

      <PageSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSaved={handleSaved}
        editingSlug={editingSlug}
      />
    </div>
  );
}
