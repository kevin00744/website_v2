import type { CreateUserInput, UpdateUserInput, UpdateSelfInput, UserSummary } from '@website-v2/shared-types';
import { apiRequest } from './api-client';

export function listUsers(): Promise<UserSummary[]> {
  return apiRequest<UserSummary[]>('/users');
}

export function createUser(input: CreateUserInput): Promise<UserSummary> {
  return apiRequest<UserSummary>('/users', { method: 'POST', json: input });
}

export function updateUser(id: number, input: UpdateUserInput): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${id}`, { method: 'PATCH', json: input });
}

/** 列表上的快速啟用/停用按鈕用，不走完整的編輯表單驗證——後端 PATCH /users/:id 本來就接受局部更新 */
export function setUserActive(id: number, isActive: boolean): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${id}`, { method: 'PATCH', json: { isActive } });
}

/** 修改自己的帳號（username / password / phone），不可改 role */
export function updateSelf(input: UpdateSelfInput): Promise<UserSummary> {
  return apiRequest<UserSummary>('/users/me', { method: 'PATCH', json: input });
}

/** 管理員強制幫其他員工重設密碼，不需要驗證舊密碼 */
export function resetUserPassword(id: number, newPassword: string): Promise<void> {
  return apiRequest<void>(`/users/${id}/password`, { method: 'PATCH', json: { newPassword } });
}

/** 軟刪除帳號（後端設 deletedAt，不是真的砍掉資料列），不能刪自己、不能刪 system_admin */
export function deleteUser(id: number): Promise<void> {
  return apiRequest<void>(`/users/${id}`, { method: 'DELETE' });
}
