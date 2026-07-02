import type {
  ChatContact,
  ChatContactPermissionState,
  ChatManageableUser,
  ChatMessage,
  ConversationSummary,
} from '@website-v2/shared-types';
import { apiRequest } from './api-client';

export function listConversations(): Promise<ConversationSummary[]> {
  return apiRequest<ConversationSummary[]>('/chat/conversations');
}

/** 「找人聊天」用的聯絡人清單：經銷商/店長預設只看得到自己的上游與下游，可被 admin 覆寫 */
export function listContacts(): Promise<ChatContact[]> {
  return apiRequest<ChatContact[]>('/chat/contacts');
}

/** 開始（或沿用既有）跟某位聯絡人的一對一對話，回傳的 id 直接拿去切換進該對話 */
export function startConversation(participantUserId: number): Promise<{ id: number; created: boolean }> {
  return apiRequest<{ id: number; created: boolean }>('/chat/conversations', { method: 'POST', json: { participantUserId } });
}

/** cursor 帶上一頁最舊一筆訊息的 id 往前翻頁；不帶等於拿最新一頁 */
export function listMessages(conversationId: number, cursor?: number): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', String(cursor));
  const query = params.toString();
  return apiRequest<ChatMessage[]>(`/chat/conversations/${conversationId}/messages${query ? `?${query}` : ''}`);
}

/** 以下三支只有 admin/system_admin 能呼叫，給「調整可聊天清單」管理畫面用 */
export function listChatManageableUsers(): Promise<ChatManageableUser[]> {
  return apiRequest<ChatManageableUser[]>('/chat/contact-permissions/users');
}

export function getContactPermissionState(userId: number): Promise<ChatContactPermissionState> {
  return apiRequest<ChatContactPermissionState>(`/chat/contact-permissions/${userId}`);
}

export function setContactPermissions(userId: number, contactUserIds: number[]): Promise<ChatContactPermissionState> {
  return apiRequest<ChatContactPermissionState>(`/chat/contact-permissions/${userId}`, {
    method: 'PUT',
    json: { contactUserIds },
  });
}

export function clearContactPermissions(userId: number): Promise<ChatContactPermissionState> {
  return apiRequest<ChatContactPermissionState>(`/chat/contact-permissions/${userId}`, { method: 'DELETE' });
}
