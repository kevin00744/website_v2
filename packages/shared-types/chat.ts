/** 跟 index.ts 不衝突的本地型別，沿用 store.ts 的命名慣例（不重新 export 同名型別） */
type ConversationTypeValue = 'inventory_request' | 'customer_inquiry' | 'general_chat';
type ConversationStatusValue = 'open' | 'resolved';
type MessageStatusValue = 'sent' | 'delivered' | 'read';
type ContactRoleValue = 'dealer' | 'general_agent' | 'manager' | 'admin' | 'system_admin';
type RegionValue = 'north' | 'central' | 'south';

export const CONTACT_ROLE_LABEL: Record<ContactRoleValue, string> = {
  dealer: '區域代理',
  general_agent: '總代理',
  manager: '店長',
  admin: '管理員',
  system_admin: '系統管理員',
};

/**
 * 對應後端 ChatService.listContacts()：經銷商/店長預設只看得到自己的上游與下游
 * （dealer 看得到所屬區域的 manager + 全部 admin/system_admin；manager 看得到所屬區域的 dealer + 全部 admin/system_admin），
 * 除非 admin/system_admin 用下面的 ChatContactPermission 系列 API 覆寫過。
 */
export interface ChatContact {
  id: number;
  name: string;
  role: ContactRoleValue;
  region: RegionValue | null;
}

/** 對應後端 ChatService.listManageableUsers()，給「調整可聊天清單」管理畫面的選人清單用 */
export interface ChatManageableUser {
  id: number;
  name: string;
  role: ContactRoleValue;
  region: RegionValue | null;
  storeId: number | null;
}

/** 對應後端 ChatService.getContactPermissionState() / setContactPermissions() */
export interface ChatContactPermissionState {
  usingDefault: boolean;
  contactUserIds: number[];
  defaultContactUserIds: number[];
}

export const CONVERSATION_TYPE_LABEL: Record<ConversationTypeValue, string> = {
  inventory_request: '調貨需求',
  customer_inquiry: '顧客詢問',
  general_chat: '一般聊天',
};

/** 對應後端 ChatService.listConversations() 回傳的形狀，給收件箱列表用 */
export interface ConversationSummary {
  id: number;
  type: ConversationTypeValue;
  status: ConversationStatusValue;
  title: string;
  storeId: number;
  unreadCount: number;
  lastMessage: {
    body: string;
    senderName: string;
    createdAt: string;
  } | null;
  updatedAt: string;
}

/** 對應後端 ChatService 的 toMessageDto()，REST 歷史查詢跟 WebSocket message:received 都是這個形狀 */
export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderRole: string;
  body: string;
  status: MessageStatusValue;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: string;
}

export interface MessageReadEvent {
  conversationId: number;
  readBy: number;
  messageIds: number[];
}

export interface InboxUpdatedEvent {
  conversationId: number;
}
