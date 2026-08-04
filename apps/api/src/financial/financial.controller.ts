import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { FinancialCategory, FinancialRecordType, PaymentMethod } from '@prisma/client';
import type { Response } from 'express';
import { FinancialService } from './financial.service';
import { OutsourcePayoutService } from './outsource-payout.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface AddRecordDto {
  storeId: number;
  type: FinancialRecordType;
  category: FinancialCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  description?: string;
}

@Controller('financial')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'manager', 'dealer')
export class FinancialController {
  constructor(
    private readonly financialService: FinancialService,
    private readonly outsourcePayoutService: OutsourcePayoutService,
  ) {}

  /** 新增一筆流水帳（staff 限 outsource_payout；manager 可全分類） */
  @Post('records')
  addRecord(@CurrentUser() actor: AuthenticatedUser, @Body() dto: AddRecordDto) {
    return this.financialService.addRecord(actor, dto);
  }

  /**
   * 外包給付：驗證 ServiceRecord.serviceItem.isOutsourced，
   * 自動以 outsourceCost 扣除 pettyCashBalance，限 manager / admin。
   */
  @Post('stores/:storeId/outsource-payout')
  @Roles('manager')
  outsourcePayout(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: { serviceRecordId: number; note?: string },
  ) {
    return this.outsourcePayoutService.createPayout(actor, storeId, dto);
  }

  /** 分店當日帳務摘要 + 備用金水位 */
  @Get('stores/:storeId/daily-balance')
  @Roles('manager')
  getDailyBalance(@CurrentUser() actor: AuthenticatedUser, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.financialService.getDailyBalance(actor, storeId);
  }

  /**
   * 帳務明細列表，支援 ?from, ?to, ?category, ?type 篩選。
   * category 可傳逗號分隔多個值（e.g. sales,top_up）。
   */
  @Get('stores/:storeId/records')
  @Roles('manager')
  listRecords(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('staffId') staffId?: string,
  ) {
    const categories = category ? (category.split(',') as FinancialCategory[]) : undefined;
    const types = type ? (type.split(',') as FinancialRecordType[]) : undefined;
    return this.financialService.listRecords(actor, storeId, from, to, categories, types, staffId ? Number(staffId) : undefined);
  }

  /** 備用金管理（補充 / 移除），限 manager / admin */
  @Post('stores/:storeId/petty-cash')
  @Roles('manager')
  adjustPettyCash(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: { action: 'add' | 'remove'; amount: number; note?: string },
  ) {
    return this.financialService.adjustPettyCash(actor, storeId, dto);
  }

  /** 新增日常支出（staff / manager 均可，現金自動扣備用金） */
  @Post('stores/:storeId/expenses')
  @Roles('staff', 'manager')
  addExpense(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: { amount: number; paymentMethod: string; description?: string; note?: string },
  ) {
    return this.financialService.addExpense(actor, storeId, dto);
  }

  /** 外包待給付清單（staff / manager 均可查看） */
  @Get('stores/:storeId/pending-outsource')
  @Roles('staff', 'manager')
  listPendingOutsource(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
  ) {
    return this.financialService.listPendingOutsourcePayout(actor, storeId);
  }

  /**
   * CSV 匯出（會計師版本），自動排除 petty_cash_replenish（備用金補充為內部資金移動，不屬於營業收支）。
   * 欄位：日期、單據編號、操作員工、科目分類、金額、說明備註。
   */
  @Get('stores/:storeId/export-csv')
  @Roles('manager')
  async exportCsv(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const csv = await this.financialService.exportCsv(actor, storeId, from, to);
    const filename = `financial_${storeId}_${from ?? 'all'}_${to ?? 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM for Excel UTF-8
  }
}
