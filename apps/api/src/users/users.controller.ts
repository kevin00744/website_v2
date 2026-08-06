import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { Region, Role } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CreateUserDto {
  username: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  storeId?: number;
  region?: Region;
  phone?: string;
}

interface UpdateUserDto {
  username?: string;
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
 * 帳號管理路由：依角色分層開放。
 * - GET / POST：system_admin, admin, general_agent, dealer, manager 均可進入（各自有資料範圍限制）
 * - PATCH / DELETE / 重設密碼：admin 以上（system_admin 自動通過 RolesGuard 超集）
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @Roles('staff', 'manager', 'accountant', 'dealer', 'general_agent', 'admin', 'editor')
  updateMe(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: { username?: string; password?: string; phone?: string },
  ) {
    return this.usersService.updateSelf(actor.id, dto);
  }

  @Get()
  @Roles('general_agent', 'dealer', 'manager')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.listUsers(actor);
  }

  @Post()
  @Roles('general_agent', 'dealer', 'manager')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(actor, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(actor, id, dto);
  }

  /** 指定（或清除）帳號的負責代理，僅 admin/system_admin 可操作 */
  @Patch(':id/dealer')
  @Roles('admin')
  assignDealer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { dealerId: number | null },
  ) {
    return this.usersService.assignUserDealer(id, dto.dealerId ?? null);
  }

  @Patch(':id/password')
  resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(actor, id, dto.newPassword);
  }

  @Delete(':id')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.deleteUser(actor, id);
  }
}
