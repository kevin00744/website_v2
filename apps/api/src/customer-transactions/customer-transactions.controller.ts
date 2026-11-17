import { Body, Controller, Delete, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { CustomerTransactionsService } from './customer-transactions.service';

/**
 * 顧客交易紀錄（POS 結帳 / 購買方案 / 直接儲值）。
 * 查看：staff / manager（service 層再檢查分店）；刪除：只限 system_admin（service 層明確檢查）。
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerTransactionsController {
  constructor(private readonly service: CustomerTransactionsService) {}

  @Get('customers/:customerId/transactions')
  @Roles('staff', 'manager')
  list(@CurrentUser() actor: AuthenticatedUser, @Param('customerId', ParseIntPipe) customerId: number) {
    return this.service.listForCustomer(actor, customerId);
  }

  /** 刪除前預覽會回溯的項目（不寫入） */
  @Get('customer-transactions/:id/delete-preview')
  @Roles('system_admin')
  preview(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.previewDelete(actor, id);
  }

  @Delete('customer-transactions/:id')
  @Roles('system_admin')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
  ) {
    return this.service.remove(actor, id, body?.reason);
  }
}
