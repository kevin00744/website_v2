import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AppError } from '../common/errors/app-error';
import type { Region } from '@prisma/client';
import { StoresService } from './stores.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CreateStoreDto {
  name: string;
  region: Region;
  phone?: string;
  address?: string;
  note?: string;
}

interface SetStoreStatusDto {
  isActive: boolean;
}

/**
 * 分店是跨區域的營運基礎資料，建立/停用權限比顧客資料更高。
 * 對齊 Version 1：admin/system_admin 不受區域限制，dealer 可以管理但僅限自己負責的區域
 * （地域鎖定的實際檢查在 service 層的 createStore()/listStores()，這裡的 @Roles 只負責
 * 「這個角色能不能呼叫這支 API」，不負責「能呼叫之後能動哪些資料」——兩層各管各的)。
 */
@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  /**
   * 任何登入的店務角色都可以查清單（例如 admin 建立顧客時要選店），editor 不開放。
   * ?all=true 只有 admin/system_admin 才會真的拿到停用中的分店（見 service 裡的 includeInactive 判斷）；
   * dealer 不管帶不帶這個參數，一律只看得到自己區域的分店（見 service 裡的 regionFilter）。
   */
  @Get()
  @Roles('dealer', 'manager')
  list(@CurrentUser() actor: AuthenticatedUser, @Query('all') all?: string) {
    return this.storesService.listStores(actor, all === 'true');
  }

  /** dealer 也能建店，但 service 層會強制檢查 region 必須等於自己負責的區域 */
  @Post()
  @Roles('dealer')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateStoreDto) {
    return this.storesService.createStore(actor, dto);
  }

  /** 更新商店基本資訊（名稱、電話、地址、備註），限 admin/system_admin */
  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; phone?: string; address?: string; note?: string },
  ) {
    return this.storesService.updateStore(id, dto);
  }

  /** 啟用/停用快速切換，跟刪除是兩件事 */
  @Patch(':id/status')
  @Roles('system_admin')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: SetStoreStatusDto) {
    return this.storesService.setActive(id, dto.isActive);
  }

  /** 軟刪除分店，admin/system_admin 均可 */
  @Delete(':id')
  @Roles('admin')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.deleteStore(id);
  }

  /** POS 結帳「選擇服務人員」清單，回傳分店啟用中員工（含 staff / manager） */
  @Get(':id/staff')
  @Roles('staff', 'manager', 'dealer')
  listStaff(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.listStoreStaff(id);
  }

  /**
   * 建立分店員工帳號（role 強制鎖定為 staff）。
   * manager 限操作自己所屬的分店；admin/system_admin 無限制。
   */
  @Post(':id/staff')
  @Roles('manager')
  createStaff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name: string; email: string; password: string },
  ) {
    return this.storesService.createStoreStaff(actor, id, dto);
  }

  /** 更新分店員工資訊（名稱/Email/啟用狀態），manager 限自己分店的 staff */
  @Patch(':id/staff/:staffId')
  @Roles('manager')
  updateStaff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('staffId', ParseIntPipe) staffId: number,
    @Body() dto: { name?: string; email?: string; isActive?: boolean },
  ) {
    return this.storesService.updateStoreStaff(actor, id, staffId, dto);
  }

  /** 刪除分店員工，manager 限自己分店的 staff */
  @Delete(':id/staff/:staffId')
  @Roles('manager')
  deleteStaff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('staffId', ParseIntPipe) staffId: number,
  ) {
    return this.storesService.deleteStoreStaff(actor, id, staffId);
  }

  /** 更新分店功能開關。manager 限操作自己的分店；admin/system_admin 任意分店 */
  @Patch(':id/features')
  @Roles('manager')
  async updateFeatures(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { features: Record<string, boolean> },
  ) {
    if (actor.role === 'manager' && actor.storeId !== id) {
      throw new AppError('PERMISSION_DENIED', '只能管理自己所屬的分店', 403);
    }
    return this.storesService.updateStoreFeatures(id, dto.features);
  }
}
