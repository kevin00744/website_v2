'use client';

import { useCallback, useEffect, useState } from 'react';
import { CONTACT_ROLE_LABEL, type ChatManageableUser } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { listChatManageableUsers } from '@/lib/chat-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { ChatContactPermissionModal } from '@/components/admin/chat/ChatContactPermissionModal';

/** 對齊後端 ChatController 的 contact-permissions 系列路由：@Roles('system_admin')（admin 透過 isAdminRole 超集放行） */
function canManageChatContacts(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

const REGION_LABEL: Record<string, string> = { A: '北區', B: '中區', C: '南區' };

/**
 * 只有經銷商/店長帳號才有「可聊天清單」需要調整（admin/system_admin 預設就看得到全部，
 * 不受這套限制），所以這頁的目標清單只列這兩種角色；候選聯絡人（勾選清單）則包含全部四種角色。
 */
export default function ChatContactsPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [allUsers, setAllUsers] = useState<ChatManageableUser[]>();
  const [loadError, setLoadError] = useState<string>();
  const [editingTarget, setEditingTarget] = useState<ChatManageableUser>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const result = await listChatManageableUsers();
      setAllUsers(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '載入帳號清單失敗，請稍後再試');
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageChatContacts(user?.role)) {
      void loadUsers();
    }
  }, [checkedAuth, user, loadUsers]);

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageChatContacts(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">調整聊天清單只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  const targets = allUsers?.filter((candidate) => candidate.role === 'dealer' || candidate.role === 'manager') ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-kiosk-xl font-bold text-slate-900">聊天清單管理</h1>
      <p className="text-kiosk-base text-slate-600">
        經銷商與店長帳號預設只能看到自己的上游與下游（依分店所屬區域自動算出），這裡可以針對個別帳號調整成自訂清單。
      </p>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {!loadError && !allUsers && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {allUsers && targets.length === 0 && <p className="text-kiosk-base text-slate-500">目前沒有經銷商或店長帳號</p>}

      <div className="flex flex-col gap-3">
        {targets.map((target) => (
          <div
            key={target.id}
            className="flex items-center justify-between rounded-kiosk border-2 border-slate-200 bg-white p-4"
          >
            <div className="flex flex-col">
              <span className="text-kiosk-base font-bold text-slate-900">{target.name}</span>
              <span className="text-kiosk-base text-slate-500">
                {CONTACT_ROLE_LABEL[target.role]}
                {target.region ? `・${REGION_LABEL[target.region]}` : ''}
              </span>
            </div>
            <KioskButton variant="secondary" onClick={() => setEditingTarget(target)}>
              調整清單
            </KioskButton>
          </div>
        ))}
      </div>

      {editingTarget && allUsers && (
        <ChatContactPermissionModal
          open
          onClose={() => setEditingTarget(undefined)}
          target={editingTarget}
          candidates={allUsers.filter((candidate) => candidate.id !== editingTarget.id)}
        />
      )}
    </div>
  );
}
