import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface StartConversationDto {
  participantUserId: number;
  title?: string;
}

interface SetContactPermissionsDto {
  contactUserIds: number[];
}

/**
 * 大部分路由不掛 @Roles——任何登入角色都可能是某個對話串的參與者，能不能看是看
 * ConversationParticipant 裡有沒有這筆紀錄（ChatService.assertParticipant 做二次檢查），
 * 不是看角色清單。只有 contact-permissions 這組「調整別人聊天清單」的管理路由才限制
 * @Roles('system_admin')（admin 透過 isAdminRole 超集自動放行，dealer/manager 不行）。
 */
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** 我的收件箱：列出有參與的對話串＋未讀數，給側邊欄圖示跟對話列表用 */
  @Get('conversations')
  listConversations(@CurrentUser() actor: AuthenticatedUser) {
    return this.chatService.listConversations(actor);
  }

  /** 「找人聊天」用的聯絡人清單：經銷商/店長預設只看得到自己的上游與下游，可被 admin 覆寫 */
  @Get('contacts')
  listContacts(@CurrentUser() actor: AuthenticatedUser) {
    return this.chatService.listContacts(actor);
  }

  /** 開始（或沿用既有）跟某位聯絡人的一對一對話，回傳的 id 給前端直接切換進該對話 */
  @Post('conversations')
  startConversation(@CurrentUser() actor: AuthenticatedUser, @Body() dto: StartConversationDto) {
    return this.chatService.startDirectConversation(actor, dto.participantUserId, dto.title);
  }

  /** cursor 用上一頁最舊一筆訊息的 id，由新到舊往前翻頁，回傳時已轉成由舊到新排序 */
  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) conversationId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) {
    return this.chatService.listMessages(actor, conversationId, cursor, take);
  }

  /** 管理畫面用：列出所有 dealer/manager/admin/system_admin，給「選對象」「勾選聯絡人」共用 */
  @Get('contact-permissions/users')
  @Roles('system_admin')
  listManageableUsers() {
    return this.chatService.listManageableUsers();
  }

  /** 查某個 dealer/manager 目前是用預設清單還是被覆寫過 */
  @Get('contact-permissions/:userId')
  @Roles('system_admin')
  getContactPermissionState(@Param('userId', ParseIntPipe) userId: number) {
    return this.chatService.getContactPermissionState(userId);
  }

  /** 整批覆寫某個 dealer/manager 的可聊天清單 */
  @Put('contact-permissions/:userId')
  @Roles('system_admin')
  setContactPermissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetContactPermissionsDto,
  ) {
    return this.chatService.setContactPermissions(actor, userId, dto.contactUserIds);
  }

  /** 清空覆寫紀錄，恢復成預設的上游/下游清單 */
  @Delete('contact-permissions/:userId')
  @Roles('system_admin')
  clearContactPermissions(@Param('userId', ParseIntPipe) userId: number) {
    return this.chatService.clearContactPermissions(userId);
  }
}
