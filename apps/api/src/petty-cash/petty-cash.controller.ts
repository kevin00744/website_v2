import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { PettyCashService } from './petty-cash.service';

@Controller('stores/:storeId/petty-cash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PettyCashController {
  constructor(private readonly svc: PettyCashService) {}

  @Get('balance')
  @Roles('manager')
  getBalance(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
  ) {
    return this.svc.getBalance(actor, storeId);
  }

  @Get('logs')
  @Roles('manager')
  listLogs(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listLogs(actor, storeId, from, to);
  }

  @Post('adjust')
  @Roles('manager')
  adjust(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: { action: 'add' | 'remove'; amount: number; note?: string },
  ) {
    return this.svc.adjust(actor, storeId, dto);
  }
}
