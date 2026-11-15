import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

/**
 * 打卡端點：staff / manager / dealer / admin 皆可打卡（凡有 storeId 的帳號）。
 * class 層級掛 JWT guard，每支路由再依需要疊加 RolesGuard。
 */
@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /** 上班打卡 — 所有有 storeId 的角色皆可呼叫 */
  @Post('check-in')
  @UseGuards(RolesGuard)
  @Roles('staff', 'manager')
  checkIn(@CurrentUser() actor: AuthenticatedUser) {
    return this.attendanceService.checkIn(actor);
  }

  /** 下班打卡 */
  @Post('check-out')
  @UseGuards(RolesGuard)
  @Roles('staff', 'manager')
  checkOut(@CurrentUser() actor: AuthenticatedUser) {
    return this.attendanceService.checkOut(actor);
  }

  /**
   * 查詢打卡紀錄。
   * - staff：只能看自己（忽略 userId 參數）
   * - manager/admin：可傳 ?userId=N 看特定員工；不傳則看自己
   */
  @Get('records')
  @UseGuards(RolesGuard)
  @Roles('staff', 'manager', 'accountant')
  listRecords(@CurrentUser() actor: AuthenticatedUser, @Query('userId') userId?: string) {
    return this.attendanceService.listRecords(actor, userId ? Number(userId) : undefined);
  }

  /** 目前尚未下班的員工清單（open clocks），限 manager/admin 查看 */
  @Get('open-clocks')
  @UseGuards(RolesGuard)
  @Roles('manager')
  listOpenClocks(@CurrentUser() actor: AuthenticatedUser) {
    return this.attendanceService.listOpenClocks(actor);
  }

  /** 分店員工本月考勤摘要（天數 + 工時），限 manager/admin */
  @Get('stores/:storeId/monthly-summary')
  @UseGuards(RolesGuard)
  @Roles('manager', 'accountant')
  monthlySummary(  // accountant 可看考勤月報
    @CurrentUser() actor: AuthenticatedUser,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query('month') month?: string,
  ) {
    return this.attendanceService.monthlySummary(actor, storeId, month);
  }
}
