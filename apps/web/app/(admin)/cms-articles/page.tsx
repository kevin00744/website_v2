'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ArticleSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteCmsArticle, listCmsArticles } from '@/lib/cms-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { ArticleSettingsModal } from '@/components/admin/cms/ArticleSettingsModal';
import { ArticleContentEditor } from '@/components/admin/cms/ArticleContentEditor';
import { formatDate } from '@/lib/format';

/** 對齊後端 CmsController 的 admin/articles 系列路由 @Roles('admin')：system_admin 透過 isAdminRole 超集自動放行 */
function canManageCms(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 文章（最新消息）管理：跟「官網頁面管理」（/cms）是平行的畫面，差別是文章會持續累積、
 * 需要列表＋未來的站內搜尋，所以獨立一張表（Article）而不是塞進 Page。內容編輯一樣用
 * 同一套 Puck 全螢幕編輯器（ArticleContentEditor）。
 */
export default function CmsArticlesPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [deletingSlug, setDeletingSlug] = useState<string>();
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string>();
  const [editingContentArticle, setEditingContentArticle] = useState<ArticleSummary>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listCmsArticles();
      setArticles(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageCms(user?.role)) {
      void loadArticles();
    }
  }, [checkedAuth, user, loadArticles]);

  function openCreateModal() {
    setEditingSlug(undefined);
    setSettingsModalOpen(true);
  }

  function openSettingsModal(article: ArticleSummary) {
    setEditingSlug(article.slug);
    setSettingsModalOpen(true);
  }

  function handleSaved(saved: ArticleSummary) {
    setArticles((prev) => {
      const exists = prev.some((item) => item.slug === saved.slug);
      return exists ? prev.map((item) => (item.slug === saved.slug ? saved : item)) : [saved, ...prev];
    });
  }

  async function handleDelete(article: ArticleSummary) {
    setDeletingSlug(article.slug);
    try {
      await deleteCmsArticle(article.slug);
      setArticles((prev) => prev.filter((item) => item.slug !== article.slug));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除文章失敗，請稍後再試');
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
        <p className="text-kiosk-base text-slate-600">文章管理只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  if (editingContentArticle) {
    return (
      <ArticleContentEditor
        slug={editingContentArticle.slug}
        title={editingContentArticle.title}
        onClose={() => {
          setEditingContentArticle(undefined);
          void loadArticles();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">文章管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增文章
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && articles.length === 0 && <p className="text-kiosk-base text-slate-500">目前還沒有任何文章</p>}

      <div className="flex flex-col gap-3">
        {articles.map((article) => (
          <div key={article.slug} className="flex flex-col gap-2 rounded-kiosk border-2 border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col">
              <span className="text-kiosk-base font-bold text-slate-900">
                {article.title} {!article.isPublished && <span className="text-kiosk-danger">（草稿）</span>}
              </span>
              <span className="text-kiosk-base text-slate-400">
                最後更新：{formatDate(article.updatedAt)}
                {article.categoryPageTitle && ` · 分類：${article.categoryPageTitle}`}
              </span>
            </div>
            <div className="flex gap-2">
              <KioskButton variant="secondary" onClick={() => openSettingsModal(article)}>
                設定
              </KioskButton>
              <KioskButton variant="primary" onClick={() => setEditingContentArticle(article)}>
                編輯內容
              </KioskButton>
              <KioskButton variant="danger" onClick={() => handleDelete(article)} disabled={deletingSlug === article.slug}>
                {deletingSlug === article.slug ? '刪除中…' : '刪除'}
              </KioskButton>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增文章
        </KioskButton>
      </div>

      <ArticleSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSaved={handleSaved}
        editingSlug={editingSlug}
      />
    </div>
  );
}
