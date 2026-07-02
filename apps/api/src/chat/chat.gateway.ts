import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { AppError } from '../common/errors/app-error';
import type { AuthenticatedUser } from '../auth/types';

interface SendMessagePayload {
  conversationId: number;
  body: string;
  attachmentUrl?: string;
  attachmentType?: string;
}

interface MarkReadPayload {
  conversationId: number;
  upToMessageId: number;
}

interface JoinConversationPayload {
  conversationId: number;
}

/**
 * 與 REST API（/api/v2/*）並存，共用同一個 PrismaService/JWT_SECRET，不是另一套系統。
 * 房間分兩個層級：
 *  - org room（store_x / region_y）：連線時自動加入，給之後的店內/區域公告類廣播用。
 *  - conversation room（conversation_x）：只有實際是該對話串參與者才能加入，
 *    訊息一律只送進這個房間，避免同店但不同對話串的人互相偷看（org room 只是「在場」，
 *    不等於「有權限看特定對話內容」）。
 */
@WebSocketGateway({
  namespace: '/ws/chat',
  cors: { origin: process.env.WEB_ORIGIN, credentials: true },
})
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  /**
   * @UseGuards(WsJwtGuard) 不會包住這個生命週期 hook（只包 @SubscribeMessage），
   * 所以這裡要顯式呼叫 authenticate() 驗證 token——這是連線是否被接受的真正關卡，
   * 沒帶合法 token 的連線會在這裡直接被斷開，不會等到對方送出第一個事件才發現。
   */
  async handleConnection(client: Socket): Promise<void> {
    const actor = await this.wsJwtGuard.authenticate(client);
    if (!actor) {
      client.disconnect();
      return;
    }

    const rooms = this.chatService.resolveOrgRooms(actor);
    await Promise.all(rooms.map((room) => client.join(room)));
  }

  handleDisconnect(_client: Socket): void {
    // 目前沒有「線上狀態」功能，先留空；之後要做的話會在這裡清理 in-memory 的線上名單。
  }

  /** 加入某個 conversation 的 room：要先確認是該對話串的參與者才能加入，避免猜 id 偷聽 */
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinConversationPayload,
  ): Promise<void> {
    const actor = this.getActor(client);
    try {
      await this.chatService.assertParticipant(actor, payload.conversationId);
      await client.join(this.chatService.conversationRoom(payload.conversationId));
      client.emit('conversation:joined', { conversationId: payload.conversationId });
    } catch (error) {
      this.emitError(client, error);
    }
  }

  /**
   * 送出新訊息：寫入 DB（status = sent）後廣播給同一個 conversation room 的所有成員（含自己，方便多裝置同步），
   * 另外對 store room 發一個輕量的 inbox:updated 信號（不含訊息內容），讓沒打開這個對話的人
   * 側邊欄收件箱圖示也能即時知道「有更新了」去重新拉未讀數，不用整個訊息內容廣播到全店。
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: SendMessagePayload): Promise<void> {
    const actor = this.getActor(client);
    try {
      const { message, storeId } = await this.chatService.createMessage(actor, payload);
      this.server.to(this.chatService.conversationRoom(payload.conversationId)).emit('message:received', message);
      this.server.to(`store_${storeId}`).emit('inbox:updated', { conversationId: payload.conversationId });
    } catch (error) {
      this.emitError(client, error);
    }
  }

  /** 標記已讀：更新 lastReadAt/訊息狀態後，廣播已讀事件讓對話串內其他人看到已讀勾勾 */
  @SubscribeMessage('message:read')
  async handleMarkRead(@ConnectedSocket() client: Socket, @MessageBody() payload: MarkReadPayload): Promise<void> {
    const actor = this.getActor(client);
    try {
      const { updatedMessageIds } = await this.chatService.markRead(actor, payload);
      if (updatedMessageIds.length > 0) {
        this.server.to(this.chatService.conversationRoom(payload.conversationId)).emit('message:read', {
          conversationId: payload.conversationId,
          readBy: actor.id,
          messageIds: updatedMessageIds,
        });
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  private getActor(client: Socket): AuthenticatedUser {
    return (client.data as { user: AuthenticatedUser }).user;
  }

  /** 業務例外（AppError）一律轉成 code 回給前端，跟 REST API 同一套白話文字典轉譯規則，不外露 stack */
  private emitError(client: Socket, error: unknown): void {
    if (error instanceof AppError) {
      client.emit('error', { code: error.code });
      return;
    }
    client.emit('error', { code: 'UNKNOWN_ERROR' });
    throw error;
  }
}
