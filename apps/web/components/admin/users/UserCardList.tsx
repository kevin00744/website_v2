import { ROLE_LABEL, type UserSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

interface UserCardListProps {
  users: UserSummary[];
  currentUserId: number;
  onEdit: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
  onToggleActive: (user: UserSummary) => void;
  togglingId?: number;
  onDelete: (user: UserSummary) => void;
  deletingId?: number;
  readOnly?: boolean;
}

const REGION_LABEL: Record<string, string> = { A: '北部', B: '中部', C: '南部' };

function canManage(target: UserSummary, currentUserId: number): boolean {
  return target.role !== 'system_admin' || target.id === currentUserId;
}

/** 手機版（<768px）：卡片式列表，重點突出姓名與角色，表格在小螢幕擠成一團很難點 */
export function UserCardList({
  users,
  currentUserId,
  onEdit,
  onResetPassword,
  onToggleActive,
  togglingId,
  onDelete,
  deletingId,
  readOnly,
}: UserCardListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {users.map((user) => {
        const manageable = canManage(user, currentUserId);
        return (
          <li key={user.id} className="flex flex-col gap-3 rounded-kiosk bg-white px-5 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-kiosk-lg font-bold text-slate-900">{user.name}</span>
                <span className="text-kiosk-base text-slate-600">{user.email}</span>
                <span className="text-kiosk-base text-slate-500">
                  {ROLE_LABEL[user.role]} ·{' '}
                  {user.storeName ?? (user.region ? REGION_LABEL[user.region] : '—')}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-kiosk px-3 py-1 text-kiosk-base font-semibold ${
                  user.isActive ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {user.isActive ? '啟用中' : '已停用'}
              </span>
            </div>
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
          </li>
        );
      })}
    </ul>
  );
}
