import { apiRequest } from './api-client';
import type { AuthUser } from './auth';

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', json: { username, password }, skipAuth: true });
}

/** 改自己的密碼，後端會驗證 oldPassword 是否正確（AUTH_OLD_PASSWORD_INVALID） */
export function changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/change-password', { method: 'PATCH', json: { oldPassword, newPassword } });
}
