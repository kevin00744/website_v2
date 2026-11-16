'use client';

const TOKEN_COOKIE = 'wv2_token';
const USER_COOKIE = 'wv2_user';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'system_admin' | 'admin' | 'manager' | 'accountant' | 'staff';
  storeId: number | null;
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

export function saveAuth(token: string, user: AuthUser, rememberDays = 1) {
  setCookie(TOKEN_COOKIE, token, rememberDays);
  setCookie(USER_COOKIE, JSON.stringify(user), rememberDays);
}

/**
 * Refresh token：「記住這台裝置」與 PIN 帳號才會有，用來在 access token（12 小時）過期後自動換新，
 * 讓裝置不會因為時間到或系統重新部署而被登出。存在 localStorage（middleware 不需要讀它）。
 */
const REFRESH_KEY = 'wv2_refresh';
/** 有 refresh token 的裝置：cookie 也保留 180 天，避免 middleware 因 cookie 過期把人導回 /login */
export const REMEMBER_DAYS = 180;

export function getRefreshToken(): string | undefined {
  try {
    return localStorage.getItem(REFRESH_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setRefreshToken(token: string | undefined) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

export interface SessionResult {
  accessToken: string;
  user: AuthUser;
  refreshToken?: string;
}

/** 登入 / 換新 / PIN 切換後統一呼叫：有 refresh token 就長期保存，否則只保存 1 天 */
export function saveSession(result: SessionResult) {
  setRefreshToken(result.refreshToken);
  saveAuth(result.accessToken, result.user, result.refreshToken ? REMEMBER_DAYS : 1);
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
  setRefreshToken(undefined);
}
