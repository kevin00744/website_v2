import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/errors/app-error';
import { requireLineConfig } from './line.config';
import type { LineProfile } from './line.service';

export type LiffRequest = Request & { lineProfile: LineProfile };

/**
 * LIFF 頁面呼叫 API 時帶 `Authorization: Bearer <liff.getIDToken()>`，
 * 這裡向 LINE 驗證 ID token（確認是發給我們 LINE Login channel 的），把顧客的 LINE 身分掛到 req.lineProfile。
 */
@Injectable()
export class LiffAuthGuard implements CanActivate {
  private readonly logger = new Logger(LiffAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = requireLineConfig();
    if (!config.loginChannelId) throw new AppError('LINE_NOT_CONFIGURED', 'LINE_LOGIN_CHANNEL_ID missing', 503);

    const req = context.switchToHttp().getRequest<LiffRequest>();
    const header = req.headers.authorization ?? '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!idToken) throw new AppError('LINE_AUTH_FAILED', 'missing id token', 401);

    let payload: { sub?: string; name?: string; picture?: string };
    try {
      const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: config.loginChannelId }).toString(),
      });
      if (!res.ok) throw new AppError('LINE_AUTH_FAILED', `verify ${res.status}`, 401);
      payload = (await res.json()) as typeof payload;
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.logger.warn(`LIFF verify error: ${(err as Error).message}`);
      throw new AppError('LINE_AUTH_FAILED', 'verify request failed', 401);
    }
    if (!payload.sub) throw new AppError('LINE_AUTH_FAILED', 'no sub', 401);

    req.lineProfile = {
      lineUserId: payload.sub,
      displayName: payload.name?.trim() || 'LINE 使用者',
      pictureUrl: payload.picture ?? null,
    };
    return true;
  }
}
