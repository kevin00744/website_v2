import { apiRequest, resolveApiBaseUrl, ApiError } from './api-client';
import type { AuthUser } from './auth';

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  /** rememberDevice=true 時才會有：裝置長期保持登入、PIN 切換用 */
  refreshToken?: string;
}

export function login(username: string, password: string, rememberDevice = false): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    json: { username, password, rememberDevice },
    skipAuth: true,
  });
}

/**
 * 用指定的 refresh token 換新的 access token（PIN 切換到「別的帳號」時用；
 * 目前帳號的自動換新在 api-client 的 refreshSession 處理）。失敗丟 ApiError。
 */
export async function exchangeRefreshToken(refreshToken: string): Promise<Required<LoginResponse>> {
  const res = await fetch(`${resolveApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    let code = 'AUTH_SESSION_EXPIRED';
    try {
      code = (await res.json())?.code ?? code;
    } catch {
      /* ignore */
    }
    throw new ApiError(code, res.status);
  }
  return res.json();
}

/** 替目前登入的帳號取得 refresh token（設定 PIN 時呼叫） */
export function issueRefreshToken(): Promise<{ refreshToken: string }> {
  return apiRequest<{ refreshToken: string }>('/auth/refresh-token', { method: 'POST' });
}

/** 改自己的密碼，後端會驗證 oldPassword 是否正確（AUTH_OLD_PASSWORD_INVALID） */
export function changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/change-password', { method: 'PATCH', json: { oldPassword, newPassword } });
}
