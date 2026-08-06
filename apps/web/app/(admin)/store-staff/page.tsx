'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteUser, listUsers, setUserActive } from '@/lib/users-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { UserTable } from '@/components/admin/users/UserTable';
import { UserCardList } from '@/components/admin/users/UserCardList';
import { NewUserModal } from '@/components/admin/users/NewUserModal';
import { ResetPasswordModal } from '@/components/admin/users/ResetPasswordModal';

function canManageStaff(role: AuthUser['role'] | undefined): boolean {
  return role === 'manager' || role === 'admin' || role === 'system_admin';
}

export default function StoreStaffPage() {
  const [user, setUser] = useState<AuthUser>();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [togglingId, setTogglingId] = useState<number>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary>();
  const [resettingUser, setResettingUser] = useState<UserSummary>();
  const [deletingId, setDeletingId] = useState<number>();

  useEffect(() => {
    setUser(getAuthUser());
    setCheckedAuth(true);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await listUsers();
      setUsers(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth && canManageStaff(user?.role)) {
      void loadUsers();
    }
  }, [checkedAuth, user, loadUsers]);

  async function handleToggleActive(target: UserSummary) {
    setTogglingId(target.id);
    try {
      const updated = await setUserActive(target.id, !target.isActive);
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '更新帳號狀態失敗，請稍後再試');
    } finally {
      setTogglingId(undefined);
    }
  }

  async function handleDelete(target: UserSummary) {
    if (!window.confirm(`確定要刪除帳號「${target.name}」嗎？這個動作無法復原。`)) return;
    setDeletingId(target.id);
    try {
      await deleteUser(target.id);
      setUsers((prev) => prev.filter((item) => item.id !== target.id));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '刪除帳號失敗，請稍後再試');
    } finally {
      setDeletingId(undefined);
    }
  }

  function handleSaved(saved: UserSummary) {
    setUsers((prev) => {
      const exists = prev.some((item) => item.id === saved.id);
      return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved];
    });
  }

  function openCreateModal() {
    setEditingUser(undefined);
    setModalOpen(true);
  }

  function openEditModal(target: UserSummary) {
    setEditingUser(target);
    setModalOpen(true);
  }

  if (!checkedAuth) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  if (!canManageStaff(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">員工帳號管理只開放給店長及管理員</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">員工帳號管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增員工帳號
        </KioskButton>
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && users.length === 0 && (
        <p className="text-kiosk-base text-slate-500">目前還沒有任何員工帳號</p>
      )}

      {user && (
        <>
          <UserTable
            users={users}
            currentUserId={user.id}
            currentUserRole={user.role}
            onEdit={openEditModal}
            onResetPassword={setResettingUser}
            onToggleActive={handleToggleActive}
            togglingId={togglingId}
            onDelete={handleDelete}
            deletingId={deletingId}
            readOnly={false}
          />
          <UserCardList
            users={users}
            currentUserId={user.id}
            currentUserRole={user.role}
            onEdit={openEditModal}
            onResetPassword={setResettingUser}
            onToggleActive={handleToggleActive}
            togglingId={togglingId}
            onDelete={handleDelete}
            deletingId={deletingId}
            readOnly={false}
          />
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增員工帳號
        </KioskButton>
      </div>

      <NewUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        editingUser={editingUser}
      />

      {resettingUser && (
        <ResetPasswordModal
          user={resettingUser}
          onClose={() => setResettingUser(undefined)}
          onDone={() => setResettingUser(undefined)}
        />
      )}
    </div>
  );
}
