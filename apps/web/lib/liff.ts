'use client';

import { ApiError, resolveApiBaseUrl } from './api-client';

/**
 * LINE LIFF SDK：用官方 CDN script 載入（不另外裝 npm 套件），只用到少數幾個 API。
 * 顧客端 LIFF 頁面不使用後台 JWT，身分一律是 liff.getIDToken()，由後端 LiffAuthGuard 驗證。
 */
interface LiffSdk {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(config?: { redirectUri?: string }): void;
  getIDToken(): string | null;
  isInClient(): boolean;
  closeWindow(): void;
}

declare global {
  interface Window {
    liff?: LiffSdk;
  }
}

const SDK_URL = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
let initPromise: Promise<LiffSdk> | null = null;

export function getLiffId(): string {
  return process.env.NEXT_PUBLIC_LIFF_ID ?? '';
}

function loadScript(): Promise<void> {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('LIFF SDK 載入失敗'));
    document.head.appendChild(s);
  });
}

/** 初始化 LIFF；未登入時會導去 LINE 登入（回來後重新執行），所以這個 Promise 可能不會 resolve */
export function initLiff(): Promise<LiffSdk> {
  if (!initPromise) {
    initPromise = (async () => {
      const liffId = getLiffId();
      if (!liffId) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID');
      await loadScript();
      const liff = window.liff!;
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        await new Promise(() => undefined);
      }
      return liff;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/** 呼叫 /api/v2/line/liff/*，自動帶 LIFF ID token；錯誤轉成 ApiError（訊息已是白話文） */
export async function liffFetch<T>(path: string, options: { method?: string; json?: unknown } = {}): Promise<T> {
  const liff = await initLiff();
  const idToken = liff.getIDToken();
  const res = await fetch(`${resolveApiBaseUrl()}/line/liff${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
  if (!res.ok) {
    let code = 'DEFAULT';
    try {
      code = (await res.json())?.code ?? 'DEFAULT';
    } catch {
      // ignore
    }
    throw new ApiError(code, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function errorMessage(err: unknown, fallback = '發生錯誤，請稍後再試'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

// ── 型別 ──

export interface LiffMe {
  bound: boolean;
  displayName: string;
  customer: { name: string; phoneMasked: string | null; customerCode: string | null } | null;
}

export interface LiffSummary {
  customerName: string;
  courses: Array<{ name: string; remaining: number; total: number }>;
  wallet: { balance: number; bonusBalance: number; storeCredit: number };
}

/** 預約頁選項（後台「LINE」頁設定） */
export interface LiffBookingOptions {
  items: Array<{ id: number; name: string; durationMin: number }>;
  staff: Array<{ id: number; name: string }>;
  slots: { defaultDurationMin: number; firstSlot: string; lastSlot: string; slotIntervalMin: number };
}

export interface LiffAppointment {
  id: number;
  startAt: string;
  endAt: string;
  status: 'booked' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show';
  note: string | null;
  serviceItem: { id: number; name: string } | null;
  staff: { id: number; name: string } | null;
}
