import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { Region, Role } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
}

interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
  isActive?: boolean;
}

interface ResetPasswordDto {
  newPassword: string;
}

/**
 * 帳號管理是最高核心權限，完全對齊 Version 1：預設只有 system_admin/admin 能進來
 * （@Roles('system_admin') 加上 RolesGuard 的 isAdminRole 超集放行，admin 本來就會通過）。
 * dealer/manager/editor 連 GET 清單都看不到，不是只擋寫入——
 * 唯一例外是 GET/POST 這兩支故意額外覆寫加開 @Roles('dealer')：經銷商可以開立、查看「自己區域」
 * 的店長帳號（範圍由 UsersService 依 actor.region 過濾/檢查，不是在這裡擋），編輯/重設密碼/刪除
 * 仍然只開放給 admin/system_admin，經銷商不能動別人已經開好的帳號。
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('dealer')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.listUsers(actor);
  }

  @Post()
  @Roles('dealer')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(actor, dto);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(actor, id, dto);
  }

  /** 管理員強制幫其他員工重設密碼；自己改自己密碼走 PATCH /auth/change-password（需要驗證舊密碼） */
  @Patch(':id/password')
  resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(actor, id, dto.newPassword);
  }

  /** 軟刪除（deletedAt），不是真的砍掉資料列——保留歷史紀錄的關聯完整性（簽名/對話/庫存異動都還連著這個帳號） */
  @Delete(':id')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteUser(actor, id);
  }
}
