import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { Role } from '@prisma/client';
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
  phone?: string;
}

interface UpdateUserDto {
  username?: string;
  name?: string;
  email?: string;
  role?: Role;
  storeId?: number;
  phone?: string;
  isActive?: boolean;
}

interface ResetPasswordDto {
  newPassword: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** 所有登入者都可以更新自己的個人設定 */
  @Patch('me')
  @Roles('staff', 'manager', 'admin', 'system_admin')
  updateMe(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: { username?: string; password?: string; phone?: string; name?: string; email?: string },
  ) {
    return this.usersService.updateSelf(actor.id, dto);
  }

  /** admin/manager 都可以列出帳號（manager 只看自己分店的 staff） */
  @Get()
  @Roles('manager')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.listUsers(actor);
  }

  /** admin/manager 都可以建立帳號（依矩陣限制可建立的角色） */
  @Post()
  @Roles('manager')
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

  /** 管理員強制重設密碼（不需舊密碼），manager 也可重設自己分店的 staff 密碼 */
  @Patch(':id/password')
  @Roles('manager')
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
