import type { AuthUser } from './auth';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roleGuard?: (role: AuthUser['role']) => boolean;
}

const isAdmin = (r: AuthUser['role']) => r === 'admin' || r === 'system_admin';
const isAdminOrManager = (r: AuthUser['role']) => isAdmin(r) || r === 'manager';
const isAdminManagerOrAccountant = (r: AuthUser['role']) => isAdminOrManager(r) || r === 'accountant';

export const NAVIGATION_CONFIG: NavItem[] = [
  { href: '/customers',         label: '顧客資料',   icon: '👥' },
  { href: '/calendar',          label: '預約行事曆', icon: '📅', roleGuard: (r) => r === 'staff' || isAdminOrManager(r) },
  { href: '/attendance',        label: '打卡',       icon: '🕐', roleGuard: (r) => r === 'staff' || r === 'manager' || isAdmin(r) },
  { href: '/manager-dashboard', label: '考勤 & 業績', icon: '📊', roleGuard: isAdminManagerOrAccountant },
  { href: '/financial',         label: '財務帳務',   icon: '💰', roleGuard: isAdminManagerOrAccountant },
  { href: '/petty-cash',        label: '備用金管理',  icon: '💵', roleGuard: isAdminOrManager },
  { href: '/expenses',          label: '支出管理',   icon: '🧾', roleGuard: (r) => r === 'staff' || isAdminOrManager(r) },
  { href: '/store-staff',       label: '員工帳號',   icon: '👤', roleGuard: isAdminOrManager },
  { href: '/store-service-items', label: '服務品項', icon: '✂️', roleGuard: isAdminOrManager },
  { href: '/promotion-plans',   label: '促銷方案',   icon: '🎁', roleGuard: isAdminOrManager },
  // LINE：除了會計以外都開放（頁內「設定狀態」只有 system_admin 看得到）
  { href: '/line',              label: 'LINE',       icon: '💬', roleGuard: (r) => r !== 'accountant' },
  { href: '/settings',          label: '個人設定',   icon: '⚙️' },
];
