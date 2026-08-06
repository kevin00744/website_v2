import { Injectable } from '@nestjs/common';
import type { MessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

export interface SendMessageInput {
  conversationId: number;
  body: string;
  /** 先把欄位留著、原樣存進 DB；之後要接 S3/MinIO 真實上傳時，這裡完全不用改，
   *  只要前端改傳「上傳完成後拿到的 URL」即可，呼叫端的契約不變。 */
  attachmentUrl?: string;
  attachmentType?: string;
}

export interface MarkReadInput {
  conversationId: number;
  upToMessageId: number;
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 連線建立時要自動加入的「組織範圍」房間（store_x / region_y），給之後的店務廣播
   * （如「調貨需求已建立」之類的店內公告）用。這跟下面 conversation room 是不同層級：
   * 這裡是粗粒度的「我在哪個店/哪個區域」，conversation room 才是「我在哪個對話串」，
   * 訊息一律只送進 conversation room，不會因為加入了 store room 就能看到別人的私訊。
   */
  resolveOrgRooms(actor: AuthenticatedUser): string[] {
    const rooms: string[] = [];
    if (actor.storeId) rooms.push(`store_${actor.storeId}`);
    if (actor.region) rooms.push(`region_${actor.region}`);
    return rooms;
  }

  conversationRoom(conversationId: number): string {
    return `conversation_${conversationId}`;
  }

  /**
   * 光是「token 有效」不代表「能看這個對話串」，這裡是每個訊息事件都要過的二次資料隔離檢查——
   * admin/system_admin 視為可以介入任何對話（如總部需要的時候），其餘角色必須是
   * ConversationParticipant 裡確實存在的一筆紀錄才放行。
   */
  async assertParticipant(actor: AuthenticatedUser, conversationId: number): Promise<void> {
    if (isAdminRole(actor.role)) return;

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
    });
    if (!participant) {
      throw new AppError('CHAT_NOT_PARTICIPANT', `user ${actor.id} is not a participant of conversation ${conversationId}`, 403);
    }
  }

  /**
   * 送出新訊息：寫入 DB（status 一律從 sent 起算）；之後的 delivered/read 由 markRead 等事件更新。
   * 額外回傳 conversation.storeId，給 gateway 廣播輕量的 inbox:updated 事件用——
   * 收件箱未讀數要能即時更新，但對方不一定已經 join 過這個 conversation room（可能根本還沒打開過這個對話），
   * 所以訊息本體只送進 conversation room，另外再對整個 store room 發一個「不含內容、只是個信號」的事件，
   * 讓側邊欄圖示能重新打 REST API 拿最新未讀數，不用整個訊息內容都廣播到全店造成隱私外洩。
   */
  async createMessage(actor: AuthenticatedUser, input: SendMessageInput) {
    await this.assertParticipant(actor, input.conversationId);

    const message = await this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: actor.id,
        body: input.body,
        attachmentUrl: input.attachmentUrl,
        attachmentType: input.attachmentType,
      },
      include: { sender: { select: { id: true, name: true, role: true } }, conversation: { select: { storeId: true } } },
    });

    return { message: toMessageDto(message), storeId: message.conversation.storeId };
  }

  /**
   * 標記「我已經讀到這則訊息為止」：更新 ConversationParticipant.lastReadAt（未讀數計算基準），
   * 並把「我自己沒送過的、且還沒標記過 read」的訊息狀態推進到 read，回傳被更新的訊息 id
   * 讓 gateway 廣播給其他參與者（讓對方畫面上看到「已讀」勾勾）。
   */
  async markRead(actor: AuthenticatedUser, input: MarkReadInput): Promise<{ updatedMessageIds: number[] }> {
    await this.assertParticipant(actor, input.conversationId);

    const upToMessage = await this.prisma.message.findFirst({
      where: { id: input.upToMessageId, conversationId: input.conversationId },
    });
    if (!upToMessage) {
      throw new AppError('CHAT_MESSAGE_NOT_FOUND', 'message not found in this conversation', 404);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.updateMany({
        where: { conversationId: input.conversationId, userId: actor.id },
        data: { lastReadAt: upToMessage.createdAt },
      });

      const toUpdate = await tx.message.findMany({
        where: {
          conversationId: input.conversationId,
          id: { lte: input.upToMessageId },
          senderId: { not: actor.id },
          status: { not: 'read' as MessageStatus },
        },
        select: { id: true },
      });

      if (toUpdate.length > 0) {
        await tx.message.updateMany({
          where: { id: { in: toUpdate.map((m) => m.id) } },
          data: { status: 'read' },
        });
      }

      return { updatedMessageIds: toUpdate.map((m) => m.id) };
    });
  }

  /**
   * 「我的收件箱」列表：只列出 actor 自己確實是參與者的對話串（admin 的角色超集放行
   * 是給「我被允許看某一個特定對話」用的，不代表「收件箱要列出全公司所有對話」，
   * 這是兩個不同語意，所以這裡不呼叫 isAdminRole 直接過濾，一律照 ConversationParticipant 查）。
   * unreadCount 用 lastReadAt 跟訊息 createdAt 比較算出來，跟 markRead() 用的是同一套基準。
   */
  async listConversations(actor: AuthenticatedUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId: actor.id } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: { where: { userId: actor.id } },
        messages: {
          orderBy: { id: 'desc' },
          take: 1,
          include: { sender: { select: { name: true } } },
        },
      },
    });

    return Promise.all(
      conversations.map(async (conversation) => {
        const lastReadAt = conversation.participants[0]?.lastReadAt ?? null;
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: actor.id },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        const [lastMessage] = conversation.messages;

        return {
          id: conversation.id,
          type: conversation.type,
          status: conversation.status,
          title: conversation.title,
          storeId: conversation.storeId,
          unreadCount,
          lastMessage: lastMessage
            ? {
                body: lastMessage.body,
                senderName: lastMessage.sender.name,
                createdAt: lastMessage.createdAt.toISOString(),
              }
            : null,
          updatedAt: conversation.updatedAt.toISOString(),
        };
      }),
    );
  }

  /**
   * 算出某個 user「預設」看得到的聊天對象（沒有被 admin 用 ChatContactPermission 覆寫過時用這份）：
   * - admin/system_admin：看得到所有經銷商/店長/管理員（他們是設定別人清單的人，本身不受限）。
   * - dealer：上游是全部 admin/system_admin，下游是「自己負責區域」的 manager。
   * - manager：上游是「自己分店所屬區域」的 dealer，加上全部 admin/system_admin；manager 是最底層，沒有下游。
   * - editor 等其他角色：不參與這套店務溝通鏈，回空清單。
   */
  private async resolveDefaultContactIds(subject: {
    id: number;
    role: AuthenticatedUser['role'];
    region: AuthenticatedUser['region'];
    storeId: AuthenticatedUser['storeId'];
  }): Promise<number[]> {
    if (isAdminRole(subject.role)) {
      const users = await this.prisma.user.findMany({
        where: { id: { not: subject.id }, deletedAt: null, isActive: true, role: { in: ['dealer', 'manager', 'admin', 'system_admin'] } },
        select: { id: true },
      });
      return users.map((user) => user.id);
    }

    if (subject.role === 'dealer' || subject.role === 'general_agent') {
      if (!subject.region) return [];
      const [admins, managers] = await Promise.all([
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, role: { in: ['admin', 'system_admin'] } },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, role: 'manager', store: { region: subject.region } },
          select: { id: true },
        }),
      ]);
      return [...admins, ...managers].map((user) => user.id);
    }

    if (subject.role === 'manager') {
      if (!subject.storeId) return [];
      const store = await this.prisma.store.findUnique({ where: { id: subject.storeId }, select: { region: true } });
      if (!store) return [];
      const [admins, dealers, storeStaff] = await Promise.all([
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, role: { in: ['admin', 'system_admin'] } },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, role: 'dealer', region: store.region },
          select: { id: true },
        }),
        // 同一分店的 staff 也在清單裡
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, role: 'staff', storeId: subject.storeId, id: { not: subject.id } },
          select: { id: true },
        }),
      ]);
      return [...admins, ...dealers, ...storeStaff].map((user) => user.id);
    }

    // staff / accountant：自己店的店長 + 所有 admin + system_admin
    if (subject.role === 'staff' || subject.role === 'accountant') {
      if (!subject.storeId) return [];
      const [storeManagers, admins] = await Promise.all([
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, storeId: subject.storeId, role: 'manager' },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: { deletedAt: null, isActive: true, role: { in: ['admin', 'system_admin'] } },
          select: { id: true },
        }),
      ]);
      return [...storeManagers, ...admins].map((user) => user.id);
    }

    return [];
  }

  /**
   * 「找人聊天」的聯絡人清單。經銷商/店長預設只看得到自己的上游與下游（resolveDefaultContactIds），
   * 除非 admin/system_admin 在 ChatContactPermission 留了覆寫紀錄——一旦有任何一筆，
   * 就完全改用覆寫清單，不是「預設清單再加減」（細節見 ChatContactPermission 的 model 註解）。
   * admin/system_admin 本身永遠用預設（看得到全部），不受覆寫機制限制。
   */
  async listContacts(actor: AuthenticatedUser) {
    let contactIds: number[];
    if (actor.role === 'dealer' || actor.role === 'general_agent' || actor.role === 'manager') {
      const overrides = await this.prisma.chatContactPermission.findMany({
        where: { userId: actor.id },
        select: { contactUserId: true },
      });
      contactIds = overrides.length > 0 ? overrides.map((o) => o.contactUserId) : await this.resolveDefaultContactIds(actor);
    } else {
      // staff / accountant / admin / system_admin / general_agent 全部走預設清單
      contactIds = await this.resolveDefaultContactIds(actor);
    }

    if (contactIds.length === 0) return [];

    const contacts = await this.prisma.user.findMany({
      where: { id: { in: contactIds }, deletedAt: null, isActive: true },
      select: { id: true, name: true, role: true, region: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return contacts;
  }

  /** 給 admin 管理畫面用：可以被設定清單的對象（dealer/general_agent/manager），以及可以被勾選進清單的候選人（含 admin/system_admin） */
  async listManageableUsers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null, isActive: true, role: { in: ['dealer', 'general_agent', 'manager', 'admin', 'system_admin'] } },
      select: { id: true, name: true, role: true, region: true, storeId: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  private async assertManageableTarget(targetUserId: number) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true, role: true, region: true, storeId: true },
    });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', `user ${targetUserId} not found`, 404);
    }
    if (target.role !== 'dealer' && target.role !== 'general_agent' && target.role !== 'manager') {
      throw new AppError(
        'CHAT_CONTACT_PERMISSION_NOT_APPLICABLE',
        'only dealer/general_agent/manager accounts have a configurable contact list',
        400,
      );
    }
    return target;
  }

  /** 回傳某個 dealer/manager 目前是用預設清單還是被覆寫過，連同兩份清單的 id 都給前端，方便畫面上對照顯示 */
  async getContactPermissionState(targetUserId: number) {
    const target = await this.assertManageableTarget(targetUserId);
    const [overrides, defaultContactUserIds] = await Promise.all([
      this.prisma.chatContactPermission.findMany({ where: { userId: targetUserId }, select: { contactUserId: true } }),
      this.resolveDefaultContactIds(target),
    ]);

    return {
      usingDefault: overrides.length === 0,
      contactUserIds: overrides.length > 0 ? overrides.map((o) => o.contactUserId) : defaultContactUserIds,
      defaultContactUserIds,
    };
  }

  /**
   * 整批覆寫某個 dealer/manager 的可聊天清單（先清空、再寫入新的一份，不提供單筆增減 API——
   * 見 ChatContactPermission 的 model 註解，避免「現在到底是不是預設」的狀態難以追蹤）。
   */
  async setContactPermissions(actor: AuthenticatedUser, targetUserId: number, contactUserIds: number[]) {
    await this.assertManageableTarget(targetUserId);

    const uniqueIds = [...new Set(contactUserIds)].filter((id) => id !== targetUserId);
    if (uniqueIds.length > 0) {
      const validContacts = await this.prisma.user.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null, isActive: true, role: { in: ['dealer', 'general_agent', 'manager', 'admin', 'system_admin'] } },
        select: { id: true },
      });
      if (validContacts.length !== uniqueIds.length) {
        throw new AppError('CHAT_CONTACT_INVALID', 'one or more contactUserIds are invalid', 400);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chatContactPermission.deleteMany({ where: { userId: targetUserId } });
      if (uniqueIds.length > 0) {
        await tx.chatContactPermission.createMany({
          data: uniqueIds.map((contactUserId) => ({ userId: targetUserId, contactUserId, createdBy: actor.id })),
        });
      }
    });

    return this.getContactPermissionState(targetUserId);
  }

  /** 清空覆寫紀錄＝恢復成預設的上游/下游清單，不需要額外的旗標欄位 */
  async clearContactPermissions(targetUserId: number) {
    await this.assertManageableTarget(targetUserId);
    await this.prisma.chatContactPermission.deleteMany({ where: { userId: targetUserId } });
    return this.getContactPermissionState(targetUserId);
  }

  /**
   * 開始（或沿用既有）跟某位聯絡人的一對一對話。先找「剛好兩人、且這兩人就是 actor 跟對方」
   * 的既有對話串直接回傳，避免每點一次聯絡人就生出一個新的重複對話。
   * Conversation.storeId 是必填欄位（設計上每個對話都掛在一個分店底下做歸屬），
   * 雙方都沒有 storeId（例如兩個 admin 互聊）目前先擋掉，請其中一方換成有店籍的角色再聊。
   */
  async startDirectConversation(actor: AuthenticatedUser, targetUserId: number, title?: string) {
    if (targetUserId === actor.id) {
      throw new AppError('CHAT_CANNOT_MESSAGE_SELF', 'cannot start a conversation with yourself', 400);
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, isActive: true },
      select: { id: true, name: true, storeId: true },
    });
    if (!target) {
      throw new AppError('USER_NOT_FOUND', `user ${targetUserId} not found`, 404);
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        AND: [{ participants: { some: { userId: actor.id } } }, { participants: { some: { userId: targetUserId } } }],
      },
      include: { participants: true },
    });
    const existingDirect = existing && existing.participants.length === 2 ? existing : undefined;
    if (existingDirect) {
      return { id: existingDirect.id, created: false };
    }

    const storeId = actor.storeId ?? target.storeId;
    if (!storeId) {
      throw new AppError('CHAT_STORE_REQUIRED', 'neither participant has a store to attach this conversation to', 400);
    }

    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          type: 'general_chat',
          title: title?.trim() || `與 ${target.name} 的對話`,
          creatorId: actor.id,
          storeId,
        },
      });
      await tx.conversationParticipant.createMany({
        data: [
          { conversationId: created.id, userId: actor.id },
          { conversationId: created.id, userId: targetUserId },
        ],
      });
      return created;
    });

    return { id: conversation.id, created: true };
  }

  /** HTTP 端的歷史訊息分頁查詢（cursor 用 message id，由舊到新分頁載入） */
  async listMessages(actor: AuthenticatedUser, conversationId: number, cursor?: number, take = 50) {
    await this.assertParticipant(actor, conversationId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take,
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    return messages.map(toMessageDto).reverse();
  }
}

function toMessageDto(message: {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  status: MessageStatus;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: Date;
  sender: { id: number; name: string; role: string };
}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender.name,
    senderRole: message.sender.role,
    body: message.body,
    status: message.status,
    attachmentUrl: message.attachmentUrl,
    attachmentType: message.attachmentType,
    createdAt: message.createdAt.toISOString(),
  };
}
