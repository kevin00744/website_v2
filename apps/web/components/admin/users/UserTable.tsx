import { ROLE_LABEL, type UserSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import type { AuthUser } from '@/lib/auth';

interface UserTableProps {
  users: UserSummary[];
  currentUserId: number;
  currentUserRole: AuthUser['role'];
  onEdit: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
  onToggleActive: (user: UserSummary) => void;
  togglingId?: number;
  onDelete: (user: UserSummary) => void;
  deletingId?: number;
  readOnly?: boolean;
  showCreator?: boolean;
}

function canManage(target: UserSummary, currentUserId: number): boolean {
  return target.role !== 'system_admin' || target.id === currentUserId;
}

export function UserTable({
  users,
  currentUserId,
  currentUserRole,
  onEdit,
  onResetPassword,
  onToggleActive,
  togglingId,
  onDelete,
  deletingId,
  readOnly,
  showCreator,
}: UserTableProps) {
  return (
    <table className="hidden w-full border-separate border-spacing-y-3 md:table">
      <thead>
        <tr className="text-left text-kiosk-base text-slate-500">
          <th className="px-4">姓名</th>
          <th className="px-4">帳號</th>
          <th className="px-4">角色</th>
          {showCreator && <th className="px-4">建立者</th>}
          <th className="px-4">狀態</th>
          <th className="px-4" />
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const manageable = canManage(user, currentUserId);
          return (
            <tr key={user.id} className="rounded-kiosk bg-white text-kiosk-base text-slate-800 shadow-sm">
              <td className="rounded-l-kiosk px-4 py-5 font-semibold">{user.name}</td>
              <td className="px-4 py-5 font-mono text-slate-500">{user.username}</td>
              <td className="px-4 py-5">{(ROLE_LABEL as Record<string, string>)[user.role] ?? user.role}</td>
              {showCreator && (
                <td className="px-4 py-5 text-slate-500">{user.creatorName ?? '—'}</td>
              )}
              <td className="px-4 py-5">
                <span
                  className={`rounded-kiosk px-3 py-1 font-semibold ${
                    user.isActive ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {user.isActive ? '啟用中' : '已停用'}
                </span>
              </td>
              <td className="rounded-r-kiosk px-4 py-5">
                {!readOnly && manageable && (
                  <div className="flex flex-wrap gap-2">
                    <KioskButton variant="secondary" onClick={() => onEdit(user)}>
                      編輯
                    </KioskButton>
                    <KioskButton variant="ghost" onClick={() => onResetPassword(user)}>
                      重設密碼
                    </KioskButton>
                    {user.role !== 'system_admin' && (
                      <KioskButton
                        variant={user.isActive ? 'ghost' : 'secondary'}
                        onClick={() => onToggleActive(user)}
                        disabled={togglingId === user.id}
                      >
                        {user.isActive ? '停用' : '啟用'}
                      </KioskButton>
                    )}
                    {user.role !== 'system_admin' && user.id !== currentUserId && (
                      <KioskButton variant="danger" onClick={() => onDelete(user)} disabled={deletingId === user.id}>
                        {deletingId === user.id ? '刪除中…' : '刪除'}
                      </KioskButton>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
