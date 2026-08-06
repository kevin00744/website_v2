'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserSummary } from '@website-v2/shared-types';
import { REGION_LABEL, ROLE_LABEL } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { assignUserDealer, deleteUser, listUsers, setUserActive } from '@/lib/users-api';
import { listStores } from '@/lib/stores-api';
import type { StoreSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';
import { UserTable } from '@/components/admin/users/UserTable';
import { UserCardList } from '@/components/admin/users/UserCardList';
import { NewUserModal } from '@/components/admin/users/NewUserModal';
import { ResetPasswordModal } from '@/components/admin/users/ResetPasswordModal';
import { AssignDealerModal } from '@/components/admin/shared/AssignDealerModal';

/** 對齊後端 UsersController：system_admin/admin/general_agent/dealer/manager 都可進入（各有資料範圍限制） */
function canManageUsers(role: AuthUser['role'] | undefined): boolean {
  return role === 'system_admin' || role === 'admin' || role === 'general_agent' || role === 'dealer' || role === 'manager';
}

function canSeeCreator(role: AuthUser['role'] | undefined): boolean {
  return role === 'system_admin' || role === 'admin';
}

function canFilterByRegionOrStore(role: AuthUser['role'] | undefined): boolean {
  return role === 'system_admin' || role === 'admin';
}

const REGION_OPTIONS = [
  { value: '', label: '全部區域' },
  { value: 'A', label: REGION_LABEL['A'] },
  { value: 'B', label: REGION_LABEL['B'] },
  { value: 'C', label: REGION_LABEL['C'] },
];

const ROLE_FILTER_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'general_agent', label: ROLE_LABEL['general_agent'] },
  { value: 'dealer', label: ROLE_LABEL['dealer'] },
  { value: 'manager', label: ROLE_LABEL['manager'] },
  { value: 'accountant', label: ROLE_LABEL['accountant'] },
  { value: 'staff', label: ROLE_LABEL['staff'] },
  { value: 'admin', label: ROLE_LABEL['admin'] },
];

export default function UsersPage() {
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
  const [assignDealerUser, setAssignDealerUser] = useState<UserSummary | null>(null);
  const [dealerList, setDealerList] = useState<UserSummary[]>([]);
  const [filterRole, setFilterRole] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterStoreId, setFilterStoreId] = useState('');
  const [stores, setStores] = useState<StoreSummary[]>([]);

  useEffect(() => {
    const authUser = getAuthUser();
    setUser(authUser);
    setCheckedAuth(true);
    if (canFilterByRegionOrStore(authUser?.role)) {
      listStores().then(setStores).catch(() => setStores([]));
    }
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
    if (checkedAuth && canManageUsers(user?.role)) {
      void loadUsers();
    }
  }, [checkedAuth, user, loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterRole && u.role !== filterRole) return false;
      if (filterRegion && u.region !== filterRegion) return false;
      if (filterStoreId && String(u.storeId) !== filterStoreId) return false;
      return true;
    });
  }, [users, filterRole, filterRegion, filterStoreId]);

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

  if (!canManageUsers(user?.role)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-kiosk border-2 border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-kiosk-lg font-bold text-slate-900">這個功能目前的帳號沒有權限使用</p>
        <p className="text-kiosk-base text-slate-600">帳號管理只開放給管理員，請聯絡管理員協助處理</p>
        <KioskButton variant="primary" onClick={() => (window.location.href = '/customers')}>
          回到顧客資料
        </KioskButton>
      </div>
    );
  }

  const showFilters = canFilterByRegionOrStore(user?.role);
  const showCreator = canSeeCreator(user?.role);
  const isAdminUser = user?.role === 'admin' || user?.role === 'system_admin';

  async function openAssignDealerForUser(target: UserSummary) {
    setAssignDealerUser(target);
    if (dealerList.length === 0) {
      try {
        const all = await listUsers();
        setDealerList(all.filter((u) => u.role === 'dealer' && u.isActive));
      } catch { /* ignore */ }
    }
  }
  const storeOptions = [
    { value: '', label: '全部分店' },
    ...stores
      .filter((s) => !filterRegion || s.region === filterRegion)
      .map((s) => ({ value: String(s.id), label: s.name })),
  ];
  const hasActiveFilter = filterRole || filterRegion || filterStoreId;

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">帳號管理</h1>
        <KioskButton onClick={openCreateModal} className="hidden md:inline-flex">
          ＋ 新增帳號
        </KioskButton>
      </div>

      {/* 篩選器：admin/system_admin 可過濾角色、區域、分店 */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[150px]">
          <KioskSelect
            label="角色"
            options={ROLE_FILTER_OPTIONS}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          />
        </div>
        {showFilters && (
          <>
            <div className="min-w-[140px]">
              <KioskSelect
                label="區域"
                options={REGION_OPTIONS}
                value={filterRegion}
                onChange={(e) => { setFilterRegion(e.target.value); setFilterStoreId(''); }}
              />
            </div>
            <div className="min-w-[180px]">
              <KioskSelect
                label="分店"
                options={storeOptions}
                value={filterStoreId}
                onChange={(e) => setFilterStoreId(e.target.value)}
              />
            </div>
          </>
        )}
        {hasActiveFilter && (
          <div className="flex items-end">
            <KioskButton variant="ghost" onClick={() => { setFilterRole(''); setFilterRegion(''); setFilterStoreId(''); }}>
              清除篩選
            </KioskButton>
          </div>
        )}
      </div>

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && filteredUsers.length === 0 && (
        <p className="text-kiosk-base text-slate-500">
          {hasActiveFilter ? '沒有符合篩選條件的帳號' : '目前還沒有任何帳號資料'}
        </p>
      )}

      {user && (
        <>
          <UserTable
            users={filteredUsers}
            currentUserId={user.id}
            currentUserRole={user.role}
            onEdit={openEditModal}
            onResetPassword={setResettingUser}
            onToggleActive={handleToggleActive}
            togglingId={togglingId}
            onDelete={handleDelete}
            deletingId={deletingId}
            readOnly={false}
            showCreator={showCreator}
            onAssignDealer={isAdminUser ? openAssignDealerForUser : undefined}
          />
          <UserCardList
            users={filteredUsers}
            currentUserId={user.id}
            currentUserRole={user.role}
            onEdit={openEditModal}
            onResetPassword={setResettingUser}
            onToggleActive={handleToggleActive}
            togglingId={togglingId}
            onDelete={handleDelete}
            deletingId={deletingId}
            readOnly={false}
            showCreator={showCreator}
            onAssignDealer={isAdminUser ? openAssignDealerForUser : undefined}
          />
        </>
      )}

      {/* 手機版：重點按鈕固定置底，永遠在大拇指範圍內 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
        <KioskButton fullWidth onClick={openCreateModal}>
          ＋ 新增帳號
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

      <AssignDealerModal
        open={Boolean(assignDealerUser)}
        targetName={assignDealerUser?.name ?? ''}
        currentDealerId={assignDealerUser?.dealerId ?? null}
        dealers={dealerList}
        onAssign={async (dealerId) => {
          if (!assignDealerUser) return;
          const updated = await assignUserDealer(assignDealerUser.id, dealerId);
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
          setAssignDealerUser(null);
        }}
        onClose={() => setAssignDealerUser(null)}
      />
    </div>
  );
}
