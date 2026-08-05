'use client';

const TOKEN_COOKIE = 'wv2_token';
const USER_COOKIE = 'wv2_user';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'system_admin' | 'general_agent' | 'admin' | 'editor' | 'dealer' | 'manager' | 'accountant' | 'staff';
  storeId: number | null;
  region: 'A' | 'B' | 'C' | null;
  dealerId: number | null;
  phone: string | null;
  /** 登入時從後端取得，store 功能開關（例如 { pos: true, attendance: true }）。
   *  admin/system_admin 不受此限制（由 hasFeature 的超集邏輯處理）。 */
  storeFeatures: Record<string, boolean> | null;
}

/**
 * 用一般（非 httpOnly）cookie 存 token，不是因為它最安全，而是因為 middleware.ts
 * 跑在 edge runtime，需要能直接讀到 request 上的 cookie 來做路由守門；
 * 這是 kiosk 內部系統先求「能動、夠用」的取捨，不是要拿來扛公開網路的高風險場景。
 */
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function saveAuth(token: string, user: AuthUser) {
  setCookie(TOKEN_COOKIE, token, 1);
  setCookie(USER_COOKIE, JSON.stringify(user), 1);
}

export function getAuthToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return getCookie(TOKEN_COOKIE);
}

export function getAuthUser(): AuthUser | undefined {
  if (typeof document === 'undefined') return undefined;
  const raw = getCookie(USER_COOKIE);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return undefined;
  }
}

export function clearAuth() {
  clearCookie(TOKEN_COOKIE);
  clearCookie(USER_COOKIE);
}
