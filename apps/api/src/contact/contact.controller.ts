import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { InquiryCategoryKind } from '@prisma/client';
import { ContactService } from './contact.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface SubmitContactMessageDto {
  name: string;
  phone?: string;
  email?: string;
  city: string;
  categoryId: number;
  message?: string;
}

interface CreateInquiryCategoryDto {
  name: string;
  kind?: InquiryCategoryKind;
}

interface UpdateInquiryCategoryDto {
  name?: string;
  kind?: InquiryCategoryKind;
  isActive?: boolean;
  sortOrder?: number;
}

interface ForwardContactMessageDto {
  storeId: number;
}

interface MarkHandledDto {
  isHandled: boolean;
}

/**
 * 公開端點（前台「聯絡我們」表單）跟 admin 端點混在同一個 controller，跟 CmsController 同樣的理由：
 * main.ts 沒有全域套用 guard，公開路由完全不掛 @UseGuards，admin 路由各自掛。
 */
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /** 前台表單下拉選單，完全公開 */
  @Get('categories')
  listPublicCategories() {
    return this.contactService.listPublicCategories();
  }

  /** 訪客送出表單，完全公開、不需要登入 */
  @Post()
  submit(@Body() dto: SubmitContactMessageDto) {
    return this.contactService.submitMessage(dto);
  }

  /** 詢問類別管理，只有 admin/system_admin 能用 */
  @Get('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('system_admin')
  listCategoriesForAdmin() {
    return this.contactService.listCategoriesForAdmin();
  }

  @Post('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('system_admin')
  createCategory(@Body() dto: CreateInquiryCategoryDto) {
    return this.contactService.createCategory(dto);
  }

  @Patch('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('system_admin')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInquiryCategoryDto) {
    return this.contactService.updateCategory(id, dto);
  }

  @Delete('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('system_admin')
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.deleteCategory(id);
  }

  /**
   * 聯絡訊息清單：admin/system_admin 看全部；dealer 額外開放（只看自己區域）；
   * manager 額外開放（只看轉給自己分店的訊息）。?isHandled=true/false 篩選待處理/已處理。
   */
  @Get('admin/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('dealer', 'manager')
  listMessages(@CurrentUser() actor: AuthenticatedUser, @Query('isHandled') isHandled?: string) {
    const parsed = isHandled === undefined ? undefined : isHandled === 'true';
    return this.contactService.listMessages(actor, parsed);
  }

  /** 經銷商把體驗諮詢轉給特定分店；manager 不能轉（轉發是經銷商的事），admin 不受區域限制 */
  @Patch('admin/messages/:id/forward')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('dealer')
  forward(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ForwardContactMessageDto) {
    return this.contactService.forwardMessage(actor, id, dto.storeId);
  }

  /** 打勾標記已處理／取消，dealer/manager 都能標記自己看得到的訊息 */
  @Patch('admin/messages/:id/handled')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('dealer', 'manager')
  markHandled(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MarkHandledDto) {
    return this.contactService.markHandled(actor, id, dto.isHandled);
  }

  /** 刪除聯絡訊息，只有 admin/system_admin 能用 */
  @Delete('admin/messages/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('system_admin')
  deleteMessage(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.deleteMessage(id);
  }
}
