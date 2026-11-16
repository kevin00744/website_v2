import { Injectable, Logger } from '@nestjs/common';
import { readLineConfig } from './line.config';

export type LineMessage = Record<string, unknown>;

const API_BASE = 'https://api.line.me/v2/bot';

/**
 * 呼叫 LINE Messaging API（reply / push）。使用 Node 20 內建 fetch，不另外安裝 SDK。
 * 這裡的失敗一律只寫 log、回傳 false，不往外丟錯，避免 LINE 端異常影響後台主流程。
 */
@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  async reply(replyToken: string, messages: LineMessage[]): Promise<boolean> {
    return this.post('/message/reply', { replyToken, messages: messages.slice(0, 5) });
  }

  async push(lineUserId: string, messages: LineMessage[]): Promise<boolean> {
    return this.post('/message/push', { to: lineUserId, messages: messages.slice(0, 5) });
  }

  private async post(path: string, body: unknown): Promise<boolean> {
    const { channelAccessToken } = readLineConfig();
    if (!channelAccessToken) {
      this.logger.warn(`skip ${path}: LINE_CHANNEL_ACCESS_TOKEN not set`);
      return false;
    }
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(`LINE ${path} failed: ${res.status} ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`LINE ${path} error: ${(err as Error).message}`);
      return false;
    }
  }
}
