import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { InventoryMovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface AdjustInventoryDto {
  storeId: number;
  productId: number;
  type: InventoryMovementType;
  quantity: number;
  customerId?: number;
  reason?: string;
}

interface CreateRestockRequestDto {
  storeId?: number;
  productId: number;
  quantity: number;
  note?: string;
}

/**
 * 對齊任務需求：admin/system_admin 可操作全店（透過 RolesGuard 的 isAdminRole 超集放行），
 * manager 只能操作自己所屬分店（實際檢查在 service 層的 assertCanOperateStore，
 * 這裡的 @Roles 只負責「manager 這個角色能不能呼叫這支 API」）。
 * dealer 原本不開放庫存異動（不負責庫存盤點），但補貨請求系列路由額外開放給 dealer——
 * 經銷商要能查看/標記完成「自己區域」分店送來的補貨請求（範圍由 service 層依 actor.region 過濾）。
 */
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('adjust')
  @Roles('manager')
  adjust(@CurrentUser() actor: AuthenticatedUser, @Body() dto: AdjustInventoryDto) {
    return this.inventoryService.adjust(actor, dto);
  }

  /** 查目前庫存快照；manager 不帶 storeId 時預設查自己的店 */
  @Get()
  @Roles('manager')
  list(@CurrentUser() actor: AuthenticatedUser, @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number) {
    return this.inventoryService.listByStore(actor, storeId);
  }

  /** 補貨請求要選「補哪個商品」用的商品目錄，manager/dealer 都要查得到 */
  @Get('products')
  @Roles('manager', 'dealer', 'general_agent')
  listProducts() {
    return this.inventoryService.listProducts();
  }

  /** 店長提出補貨請求：跟同區經銷商「發送補貨訊息」的實際機制——經銷商查得到自己區域內的這些請求 */
  @Post('restock-requests')
  @Roles('manager')
  createRestockRequest(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateRestockRequestDto) {
    return this.inventoryService.createRestockRequest(actor, dto);
  }

  /** manager 看自己分店；dealer 看自己區域；admin/system_admin 看全部。?isCompleted=true/false 篩選待處理/已完成 */
  @Get('restock-requests')
  @Roles('manager', 'dealer', 'general_agent')
  listRestockRequests(@CurrentUser() actor: AuthenticatedUser, @Query('isCompleted') isCompleted?: string) {
    const parsed = isCompleted === undefined ? undefined : isCompleted === 'true';
    return this.inventoryService.listRestockRequests(actor, parsed);
  }

  /** 經銷商補完貨後打勾標記完成；manager 自己不能標記，要由經銷商確認 */
  @Patch('restock-requests/:id/complete')
  @Roles('dealer', 'general_agent')
  completeRestockRequest(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.completeRestockRequest(actor, id);
  }

  /**
   * 顧客檔案的「商品使用紀錄」：沒有掛 @Roles，能不能看由 service 內的
   * canActorAccessCustomer 決定（跟顧客詳細頁同一套資料隔離規則），不是看角色清單。
   */
  @Get('customers/:customerId/logs')
  listByCustomer(@CurrentUser() actor: AuthenticatedUser, @Param('customerId', ParseIntPipe) customerId: number) {
    return this.inventoryService.listByCustomer(actor, customerId);
  }
}
