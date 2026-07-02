import { ROLE_LABEL, type UserSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

interface UserTableProps {
  users: UserSummary[];
  currentUserId: number;
  onEdit: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
  onToggleActive: (user: UserSummary) => void;
  togglingId?: number;
  onDelete: (user: UserSummary) => void;
  deletingId?: number;
  /** dealer 進來看到的是唯讀清單（自己區域的店長帳號），後端編輯/重設密碼/刪除/停用路由本來就還是只開放 admin/system_admin */
  readOnly?: boolean;
}

const REGION_LABEL: Record<string, string> = { north: '北部', central: '中部', south: '南部' };

/** system_admin 帳號只能本人自己改，其他人（包含 admin）連編輯/重設密碼按鈕都不顯示，避免點下去得到 403 */
function canManage(target: UserSummary, currentUserId: number): boolean {
  return target.role !== 'system_admin' || target.id === currentUserId;
}

/** iPad/桌機版（≥768px）：大氣留白的資料表格，手機版隱藏改用 UserCardList */
export function UserTable({
  users,
  currentUserId,
  onEdit,
  onResetPassword,
  onToggleActive,
  togglingId,
  onDelete,
  deletingId,
  readOnly,
}: UserTableProps) {
  return (
    <table className="hidden w-full border-separate border-spacing-y-3 md:table">
      <thead>
        <tr className="text-left text-kiosk-base text-slate-500">
          <th className="px-4">姓名</th>
          <th className="px-4">Email</th>
          <th className="px-4">角色</th>
          <th className="px-4">所屬分店/區域</th>
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
              <td className="px-4 py-5">{user.email}</td>
              <td className="px-4 py-5">{ROLE_LABEL[user.role]}</td>
              <td className="px-4 py-5">
                {user.storeName ?? (user.region ? REGION_LABEL[user.region] : '—')}
              </td>
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
