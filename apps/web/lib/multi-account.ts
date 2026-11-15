'use client';

import type { AuthUser } from './auth';

const STORAGE_KEY = 'wv2_saved_accounts';

export interface SavedAccount {
  token: string;
  user: AuthUser;
  pin: string; // 4-digit PIN, stored in plaintext (kiosk internal system)
  savedAt: number; // timestamp
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function getSavedAccounts(): SavedAccount[] {
  return readAll();
}

export function saveAccount(token: string, user: AuthUser, pin: string) {
  const all = readAll().filter((a) => a.user.id !== user.id);
  all.push({ token, user, pin, savedAt: Date.now() });
  writeAll(all);
}

export function removeSavedAccount(userId: number) {
  writeAll(readAll().filter((a) => a.user.id !== userId));
}

export function updateSavedAccountToken(userId: number, token: string, user: AuthUser) {
  const all = readAll().map((a) => (a.user.id === userId ? { ...a, token, user, savedAt: Date.now() } : a));
  writeAll(all);
}

export function validatePin(userId: number, pin: string): SavedAccount | null {
  const account = readAll().find((a) => a.user.id === userId);
  if (!account || account.pin !== pin) return null;
  return account;
}
