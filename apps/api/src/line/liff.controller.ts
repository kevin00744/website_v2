import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { LiffAuthGuard, type LiffRequest } from './liff-auth.guard';
import { LineService, type BindInput, type LineBookingInput } from './line.service';

/**
 * LIFF 頁面（apps/web/app/liff/*）呼叫的 API：/api/v2/line/liff/*
 * 身分一律來自 LIFF ID token（LiffAuthGuard），不吃前端傳來的 userId。
 */
@Controller('line/liff')
@UseGuards(LiffAuthGuard)
export class LiffController {
  constructor(private readonly lineService: LineService) {}

  @Get('me')
  me(@Req() req: LiffRequest) {
    return this.lineService.getMe(req.lineProfile);
  }

  @Post('bind')
  bind(@Req() req: LiffRequest, @Body() dto: BindInput) {
    return this.lineService.bind(req.lineProfile, dto);
  }

  @Get('summary')
  summary(@Req() req: LiffRequest) {
    return this.lineService.getSummary(req.lineProfile.lineUserId);
  }

  /** 預約頁選項：開放項目（含時長）、可指定服務人員、時段設定 */
  @Get('booking-options')
  bookingOptions() {
    return this.lineService.getBookingOptions();
  }

  @Get('appointments')
  appointments(@Req() req: LiffRequest) {
    return this.lineService.listMyAppointments(req.lineProfile.lineUserId);
  }

  /** 送出預約申請。結果只在網頁顯示，不另外推播（節省 LINE 訊息額度） */
  @Post('appointments')
  book(@Req() req: LiffRequest, @Body() dto: LineBookingInput) {
    return this.lineService.createBooking(req.lineProfile.lineUserId, dto);
  }

  @Post('appointments/:id/cancel')
  cancel(@Req() req: LiffRequest, @Param('id', ParseIntPipe) id: number) {
    return this.lineService.cancelBooking(req.lineProfile.lineUserId, id);
  }
}
