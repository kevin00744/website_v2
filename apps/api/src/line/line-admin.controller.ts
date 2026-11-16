import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SystemAdminGuard } from '../auth/system-admin.guard';
import { AppError } from '../common/errors/app-error';
import { readLineConfig } from './line.config';
import { LineService, type BookingSettingsInput } from './line.service';
import { LineMessagingService, type LineMessage } from './line-messaging.service';

/** LINE 圖片訊息的預覽圖上限 1MB；原圖與預覽共用同一檔，所以整體限制 1MB */
const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * 後台「LINE」頁 API：/api/v2/line/admin/*
 * 除了會計以外都能使用（RolesGuard：staff/manager，admin/system_admin 超集放行）；
 * 設定狀態（status）只有 system_admin 看得到。
 */
@Controller('line/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'manager')
export class LineAdminController {
  constructor(
    private readonly lineService: LineService,
    private readonly messaging: LineMessagingService,
  ) {}

  /** 設定檢查：只回是否已設定，不回密鑰本身（僅 system_admin） */
  @Get('status')
  @UseGuards(SystemAdminGuard)
  status() {
    const c = readLineConfig();
    return {
      enabled: c.enabled,
      storeId: c.storeId || null,
      liffId: c.liffId || null,
      hasChannelSecret: !!c.channelSecret,
      hasChannelAccessToken: !!c.channelAccessToken,
      hasLoginChannelId: !!c.loginChannelId,
      hasPublicOrigin: publicOrigin() !== null,
    };
  }

  @Get('booking-settings')
  bookingSettings() {
    return this.lineService.getBookingSettings();
  }

  @Put('booking-settings')
  saveBookingSettings(@Body() dto: BookingSettingsInput) {
    return this.lineService.saveBookingSettings(dto);
  }

  @Get('accounts')
  accounts() {
    return this.lineService.listAccounts();
  }

  @Delete('accounts/:id')
  async unbind(@Param('id', ParseIntPipe) id: number) {
    await this.lineService.unbind(id);
    return { ok: true };
  }

  @Get('customers/:customerId/binding')
  binding(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.lineService.getBindingByCustomer(customerId);
  }

  @Get('pending-appointments')
  pending() {
    return this.lineService.listPendingLineAppointments();
  }

  /** 推播給已綁定帳號：文字＋（選填）圖片，一次推播只算 1 則 */
  @Post('push')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } }))
  async push(
    @Body() dto: { accountId?: string; text?: string },
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const account = await this.lineService.findAccount(Number(dto.accountId));
    const text = dto.text?.trim().slice(0, 1000) ?? '';
    if (!text && !image) throw new AppError('LINE_PUSH_EMPTY', undefined, 400);

    const messages: LineMessage[] = [];
    if (text) messages.push({ type: 'text', text });
    if (image) {
      const ext = IMAGE_EXT[image.mimetype];
      if (!ext) throw new AppError('LINE_PUSH_IMAGE_INVALID', image.mimetype, 400);
      const origin = publicOrigin();
      if (!origin) throw new AppError('LINE_PUSH_IMAGE_UNAVAILABLE', 'WEB_ORIGIN must be https', 503);
      const fileName = `${randomUUID()}.${ext}`;
      const dir = join(process.cwd(), 'storage', 'uploads', 'line');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, fileName), image.buffer);
      const url = `${origin}/api/v2/uploads/line/${fileName}`;
      messages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url });
    }

    const ok = await this.messaging.push(account.lineUserId, messages);
    if (!ok) throw new AppError('LINE_PUSH_FAILED', undefined, 502);
    return { ok: true };
  }
}

/** LINE 圖片訊息需要公開的 https 網址：取 WEB_ORIGIN（例：https://example.com） */
function publicOrigin(): string | null {
  const origin = (process.env.WEB_ORIGIN ?? '').trim().replace(/\/+$/, '');
  return origin.startsWith('https://') ? origin : null;
}
