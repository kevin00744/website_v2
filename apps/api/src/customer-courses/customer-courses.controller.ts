import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { PaymentMethod } from '@prisma/client';
import { CustomerCoursesService } from './customer-courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

@Controller('customer-courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager', 'system_admin')
export class CustomerCoursesController {
  constructor(private readonly service: CustomerCoursesService) {}

  /** 退費試算：剩餘堂數、單堂價與計算依據 */
  @Get(':id/refund-quote')
  refundQuote(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.refundQuote(actor, id);
  }

  /** 課程退費（現金 / 轉帳 / LINE Pay / 信用卡） */
  @Post(':id/refund')
  refund(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      refundedSessions: number;
      calculatedAmount: number;
      finalAmount: number;
      paymentMethod: PaymentMethod;
      adjustNote?: string;
    },
  ) {
    return this.service.refund(actor, id, dto);
  }

  @Post(':id/refund-to-credit')
  refundToCredit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      refundedSessions: number;
      calculatedAmount: number;
      finalAmount: number;
      remark?: string;
      adjustNote?: string;
    },
  ) {
    return this.service.refundToCredit(actor, id, dto);
  }

  @Post(':id/convert')
  convertCourse(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      newServiceItemId: number;
      newTotalSessions: number;
      newPurchasePrice?: number;
      convertedSessions: number;
      remark?: string;
    },
  ) {
    return this.service.convertCourse(actor, id, dto);
  }
}
