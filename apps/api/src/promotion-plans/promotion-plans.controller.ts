import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { PaymentMethod, PromotionPlanType } from '@prisma/client';
import { PromotionPlansService } from './promotion-plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CreatePromotionPlanDto {
  name: string;
  type: PromotionPlanType;
  price: number;
  bonusAmount?: number;
  items?: { serviceItemId: number; sessions: number }[];
}

interface PurchasePromotionPlanDto {
  customerId: number;
  staffId?: number;
  paymentMethod: PaymentMethod;
}

/** 促銷方案：staff 可讀（POS 結帳選方案）；manager/admin 可建立/刪除 */
@Controller('stores/:storeId/promotion-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'manager')
export class PromotionPlansController {
  constructor(private readonly promotionPlansService: PromotionPlansService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.promotionPlansService.listForStore(actor, storeId);
  }

  @Post()
  @Roles('manager')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreatePromotionPlanDto,
  ) {
    return this.promotionPlansService.create(actor, storeId, dto);
  }

  /**
   * 顧客購買促銷方案（POS 操作）：
   * - top_up_bonus → 儲值 + 贈點
   * - course_bundle → 為顧客派發每個品項的 CustomerCourse
   * 同時寫入 FinancialRecord，現金付款連動 pettyCashBalance。
   */
  @Post(':planId/purchase')
  @Roles('staff', 'manager')
  purchase(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: PurchasePromotionPlanDto,
  ) {
    return this.promotionPlansService.purchase(actor, storeId, planId, dto);
  }

  /** 更新促銷方案（名稱、售價、贈點、課程品項） */
  @Patch(':planId')
  @Roles('manager')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: {
      name?: string;
      price?: number;
      bonusAmount?: number;
      items?: { serviceItemId: number; sessions: number }[];
    },
  ) {
    return this.promotionPlansService.update(actor, storeId, planId, dto);
  }

  /** 軟刪除（停用）方案 */
  @Delete(':planId')
  @Roles('manager')
  deactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('planId', ParseIntPipe) planId: number,
  ) {
    return this.promotionPlansService.deactivate(actor, storeId, planId);
  }
}
