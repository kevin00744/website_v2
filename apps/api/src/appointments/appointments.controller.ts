import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { AppointmentsService, type AppointmentInput } from './appointments.service';

/**
 * 行事曆預約（store-scoped）。
 * staff / manager 只能操作自己分店；admin / system_admin 透過 RolesGuard 超集放行。
 */
@Controller('stores/:storeId/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'manager')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** 查詢區間內的預約（from/to 為 ISO 字串）；帶 customerId 時改回傳該顧客最近 50 筆 */
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId', new ParseIntPipe({ optional: true })) customerId?: number,
  ) {
    return this.appointmentsService.list(actor, storeId, from, to, customerId);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: AppointmentInput,
  ) {
    return this.appointmentsService.create(actor, storeId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AppointmentInput,
  ) {
    return this.appointmentsService.update(actor, storeId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.appointmentsService.remove(actor, storeId, id);
  }
}
