import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ServiceItemsService } from './service-items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CreateServiceItemDto {
  name: string;
  price: number;
  isOutsourced?: boolean;
  outsourceCost?: number;
}

@Controller('service-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'manager', 'dealer')
export class ServiceItemsController {
  constructor(private readonly serviceItemsService: ServiceItemsService) {}

  /** POS 結帳用：全域 + 分店自訂項目（storeId 為 query param） */
  @Get()
  list(@Query('storeId', ParseIntPipe) storeId: number) {
    return this.serviceItemsService.listForStore(storeId);
  }
}

/**
 * 分店品項自治管理（store-scoped CRUD）。
 * 與全域 GET /service-items 分開，這裡只管理「某分店自己建立的品項」。
 */
@Controller('stores/:storeId/service-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager')
export class StoreServiceItemsController {
  constructor(private readonly serviceItemsService: ServiceItemsService) {}

  /** 列出分店自己建立的品項（不含全域通用項目） */
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.serviceItemsService.listOwnedByStore(actor, storeId);
  }

  /** 建立分店品項（manager 操作時 storeId 強制鎖定為自己的分店） */
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreateServiceItemDto,
  ) {
    return this.serviceItemsService.create(actor, storeId, dto);
  }

  /** 更新品項資訊 */
  @Patch(':itemId')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Partial<CreateServiceItemDto>,
  ) {
    return this.serviceItemsService.update(actor, storeId, itemId, dto);
  }

  /** 軟刪除品項（下架） */
  @Delete(':itemId')
  deactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.serviceItemsService.deactivate(actor, storeId, itemId);
  }
}
