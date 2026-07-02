'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PageTemplateSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteCmsTemplate, listCmsTemplates } from '@/lib/cms-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { TemplateSettingsModal } from '@/components/admin/cms/TemplateSettingsModal';
import { TemplateContentEditor } from '@/components/admin/cms/TemplateContentEditor';
import { formatDate } from '@/lib/format';

/** 對齊後端 CmsController 的 admin/templates 系列路由 @Roles('admin')：system_admin 透過 isAdminRole 超集自動放行 */
function canManageCms(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 範本庫管理：跟「官網頁面管理」（/cms）是平行的兩個畫面——這裡管理的是可重複套用的範本本身，
 * 不是某一個實際發布的頁面。建立/編輯範本內容用的是同一套 Puck 全螢幕編輯器（TemplateContentEditor），
 * 跟頁面編輯器只差在存去 PageTemplate 這張表而不是 Page。
 */
export default function CmsTemplatesPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [templates, setTemplates] = useState<PageTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [deletingId, setDeletingId] = useState<number>();
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number>();
  const [editingContentTemplate, setEditingContentTemplate] = useState<PageTemplateSummary>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listCmsTemplates();
      setTemplates(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageCms(user?.role)) {
      void loadTemplates();
    }
  }, [checkedAuth, user, loadTemplates]);

  function openCreateModal() {
    setEditingTemplateId(undefined);
    setSettingsModalOpen(true);
  }

  function openSettingsModal(template: PageTemplateSummary) {
    setEditingTemplateId(template.id);
    setSettingsModalOpen(true);
  }

  function handleSaved(saved: PageTemplateSummary) {
    setTemplates((prev) => {
      const exists = prev.some((item) => item.id === saved.id);
      return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
    });
  }

  async function handleDelete(template: PageTemplateSummary) {
    setDeletingId(template.id);
    try {
      await deleteCmsTemplate(template.id);
      setTemplates((prev) => prev.filter((item) => item.id !== template.id));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除範本失敗，請稍後再試');
    } finally {
      setDeletingId(undefined);
    }
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageCms(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">範本庫管理只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  if (editingContentTemplate) {
    return (
      <TemplateContentEditor
        templateId={editingContentTemplate.id}
        title={editingContentTemplate.name}
        onClose={() => {
          setEditingContentTemplate(undefined);
          void loadTemplates();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">範本庫管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增範本
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && templates.length === 0 && <p className="text-kiosk-base text-slate-500">目前還沒有任何範本</p>}

      <div className="flex flex-col gap-3">
        {templates.map((template) => (
          <div key={template.id} className="flex flex-col gap-2 rounded-kiosk border-2 border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col">
              <span className="text-kiosk-base font-bold text-slate-900">{template.name}</span>
              {template.description && <span className="text-kiosk-base text-slate-500">{template.description}</span>}
              <span className="text-kiosk-base text-slate-400">最後更新：{formatDate(template.updatedAt)}</span>
            </div>
            <div className="flex gap-2">
              <KioskButton variant="secondary" onClick={() => openSettingsModal(template)}>
                設定
              </KioskButton>
              <KioskButton variant="primary" onClick={() => setEditingContentTemplate(template)}>
                編輯內容
              </KioskButton>
              <KioskButton variant="danger" onClick={() => handleDelete(template)} disabled={deletingId === template.id}>
                {deletingId === template.id ? '刪除中…' : '刪除'}
              </KioskButton>
            </div>
          </div>
        ))}
      </div>

      {/* 手機版：重點按鈕固定置底，永遠在大拇指範圍內 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增範本
        </KioskButton>
      </div>

      <TemplateSettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSaved={handleSaved}
        editingTemplateId={editingTemplateId}
      />
    </div>
  );
}
