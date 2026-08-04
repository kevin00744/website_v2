import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { ConsumptionType, PaymentMethod } from '@prisma/client';
import { ServiceRecordService } from './service-record.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CreateServiceRecordDto {
  customerId: number;
  staffId?: number;
  serviceItemId: number;
  consumptionType: ConsumptionType;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
  sessionsDeducted?: number;
  customerSignatureUrl?: string;
  note?: string;
}

/**
 * POS 服務結帳路由。
 *
 * URL 設計：以 storeId 為頂層 namespace，讓前端一次帶入分店 context。
 * - staff / manager 只能操作自己的分店（Service 層再做 storeId 隔離）
 * - admin / system_admin 超集放行
 */
@Controller('stores/:storeId/service-records')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'manager', 'dealer')
export class ServiceRecordController {
  constructor(private readonly serviceRecordService: ServiceRecordService) {}

  /** POS 結帳：建立一筆服務紀錄，依 consumptionType 自動觸發扣款/扣堂 */
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreateServiceRecordDto,
  ) {
    return this.serviceRecordService.createServiceRecord(actor, storeId, dto);
  }

  /** 顧客的服務紀錄列表（staff 只看自己服務的紀錄） */
  @Get('by-customer/:customerId')
  listByCustomer(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('customerId', ParseIntPipe) customerId: number,
  ) {
    return this.serviceRecordService.listByCustomer(actor, storeId, customerId);
  }

  /** 員工業績帳目（限 manager / admin，可指定日期範圍） */
  @Get('by-staff/:staffId')
  @Roles('manager')
  listByStaff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('staffId', ParseIntPipe) staffId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.serviceRecordService.listByStaff(actor, storeId, staffId, from, to);
  }

  /** 分店當日服務紀錄總覽（限 manager / admin） */
  @Get('daily')
  @Roles('manager')
  listDaily(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
  ) {
    return this.serviceRecordService.listDaily(actor, storeId);
  }
}
