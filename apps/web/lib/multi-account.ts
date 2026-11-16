'use client';

import type { AuthUser } from './auth';

const STORAGE_KEY = 'wv2_saved_accounts';

export interface SavedAccount {
  token: string;
  user: AuthUser;
  pin: string; // 4-digit PIN, stored in plaintext (kiosk internal system)
  savedAt: number; // timestamp
  /**
   * 長效 refresh token：PIN 切換時用它向後端換新的 access token，
   * 所以只要沒登出，PIN 切換就不會因為 token 過期而要求重打密碼。
   * 舊資料可能沒有這個欄位，切換時會請使用者輸入一次密碼補上。
   */
  refreshToken?: string;
}

function readAll(): SavedAccount[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAll(accounts: SavedAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
}

export function getSavedAccounts(): SavedAccount[] {
  return readAll();
}

export function saveAccount(token: string, user: AuthUser, pin: string, refreshToken?: string) {
  const all = readAll().filter((a) => a.user.id !== user.id);
  all.push({ token, user, pin, savedAt: Date.now(), refreshToken });
  writeAll(all);
}

export function removeSavedAccount(userId: number) {
  writeAll(readAll().filter((a) => a.user.id !== userId));
}

/** 帳號 token 換新後同步更新（只更新已儲存的帳號，不會新增） */
export function updateSavedAccountToken(userId: number, token: string, user: AuthUser, refreshToken?: string) {
  const all = readAll().map((a) =>
    a.user.id === userId
      ? { ...a, token, user, savedAt: Date.now(), refreshToken: refreshToken ?? a.refreshToken }
      : a,
  );
  writeAll(all);
}

export function validatePin(userId: number, pin: string): SavedAccount | null {
  const account = readAll().find((a) => a.user.id === userId);
  if (!account || account.pin !== pin) return null;
  return account;
}
