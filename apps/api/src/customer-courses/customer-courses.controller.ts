import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
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
