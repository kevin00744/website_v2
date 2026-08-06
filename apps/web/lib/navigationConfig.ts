import type { AuthUser } from './auth';

export type FeatureKey = 'pos' | 'attendance' | 'crm';

export interface NavItem {
  href: string;
  label: string;
  /** 設定後，admin/system_admin 自動通過；其他角色需要分店啟用此 feature */
  featureKey?: FeatureKey;
  /** 未設定則所有角色皆可見（需先通過 featureKey 守門） */
  roleGuard?: (role: AuthUser['role']) => boolean;
}

const isAdmin = (r: AuthUser['role']) => r === 'admin' || r === 'system_admin';
const isDealer = (r: AuthUser['role']) => r === 'dealer' || r === 'general_agent';

export const NAVIGATION_CONFIG: NavItem[] = [
  // ── 基礎功能 ──────────────────────────────────────────────────────────────
  { href: '/customers', label: '顧客資料', roleGuard: (r) => r === 'staff' || r === 'manager' || isDealer(r) || isAdmin(r) },
  { href: '/inventory', label: '庫存管理', roleGuard: (r) => r === 'manager' || isDealer(r) || isAdmin(r) },

  // ── 打卡模組（只限 staff / manager / accountant，admin 不操作打卡）────────
  { href: '/attendance', label: '打卡', featureKey: 'attendance', roleGuard: (r) => r === 'staff' || r === 'manager' },
  { href: '/manager-dashboard', label: '考勤 & 業績', featureKey: 'attendance', roleGuard: (r) => r === 'manager' || r === 'accountant' },

  // ── 財務（只限 manager / accountant，admin/dealer 不操作分店財務）──────────
  { href: '/financial', label: '財務帳務', roleGuard: (r) => r === 'manager' || r === 'accountant' },
  { href: '/petty-cash', label: '備用金管理', roleGuard: (r) => r === 'manager' },
  { href: '/expenses', label: '支出管理', featureKey: 'pos', roleGuard: (r) => r === 'manager' || r === 'staff' },

  // ── 分店管理 ──────────────────────────────────────────────────────────────
  { href: '/stores', label: '分店管理', roleGuard: (r) => isAdmin(r) || isDealer(r) },
  { href: '/store-settings', label: '分店功能設定', roleGuard: (r) => isAdmin(r) || r === 'manager' },
  { href: '/store-staff', label: '員工帳號管理', roleGuard: (r) => r === 'manager' },
  { href: '/store-service-items', label: '服務品項管理', featureKey: 'pos', roleGuard: (r) => r === 'manager' },
  { href: '/promotion-plans', label: '促銷方案管理', roleGuard: (r) => r === 'manager' },

  // ── 聯絡訊息 ──────────────────────────────────────────────────────────────
  { href: '/contact-messages', label: '聯絡訊息', roleGuard: (r) => isAdmin(r) || isDealer(r) || r === 'manager' },
  { href: '/contact-categories', label: '詢問類別管理', roleGuard: isAdmin },

  // ── 帳號管理（所有可建立下屬帳號的角色）──────────────────────────────────
  { href: '/users', label: '帳號管理', roleGuard: (r) => isAdmin(r) || isDealer(r) },

  // ── 即時通訊 ──────────────────────────────────────────────────────────────
  { href: '/chat-contacts', label: '聊天清單管理', roleGuard: isAdmin },

  // ── 個人設定（所有登入者）────────────────────────────────────────────────
  { href: '/settings', label: '個人設定' },
];
