import { Controller, Headers, HttpCode, Logger, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/errors/app-error';
import { readLineConfig } from './line.config';
import { verifyLineSignature } from './line.util';
import { LineService } from './line.service';
import { LineMessagingService, type LineMessage } from './line-messaging.service';
import {
  bindPromptMessage,
  bookingLinkMessage,
  coursesMessage,
  helpMessage,
  walletMessage,
  welcomeMessages,
} from './line-flex';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
  postback?: { data?: string };
}

type Action = 'courses' | 'wallet' | 'booking' | 'bind' | 'help';

const KEYWORDS: Array<[RegExp, Action]> = [
  [/堂數|課程|剩餘/, 'courses'],
  [/儲值|餘額|錢包/, 'wallet'],
  [/預約|訂位/, 'booking'],
  [/綁定|會員/, 'bind'],
];

/**
 * LINE Messaging API webhook：POST /api/v2/line/webhook
 * 不掛 JWT；以 x-line-signature 驗證來源。LINE_ENABLED 未開啟時一律回 200 但不處理。
 */
@Controller('line/webhook')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private readonly lineService: LineService,
    private readonly messaging: LineMessagingService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() req: RawBodyRequest<Request>, @Headers('x-line-signature') signature?: string) {
    const config = readLineConfig();
    if (!config.enabled) return { ok: true };

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    if (!verifyLineSignature(raw, signature, config.channelSecret)) {
      throw new AppError('LINE_SIGNATURE_INVALID', 'bad signature', 401);
    }

    const events = ((req.body as { events?: LineEvent[] })?.events ?? []).slice(0, 20);
    for (const event of events) {
      try {
        await this.handleEvent(event);
      } catch (err) {
        this.logger.warn(`event ${event.type} failed: ${(err as Error).message}`);
      }
    }
    return { ok: true };
  }

  private async handleEvent(event: LineEvent) {
    const userId = event.source?.type === 'user' ? event.source.userId : undefined;
    if (!event.replyToken || !userId) return;

    if (event.type === 'follow') {
      const bound = await this.lineService.findBoundCustomer(userId);
      await this.messaging.reply(
        event.replyToken,
        bound ? [{ type: 'text', text: `${bound.name} 您好，歡迎回來！請使用下方選單。` }] : welcomeMessages(),
      );
      return;
    }

    let action: Action | null = null;
    if (event.type === 'postback') {
      const data = new URLSearchParams(event.postback?.data ?? '');
      action = (data.get('action') as Action | null) ?? null;
    } else if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text ?? '';
      action = KEYWORDS.find(([re]) => re.test(text))?.[1] ?? 'help';
    }
    if (!action) return;

    const messages = await this.buildReply(userId, action);
    if (messages.length) await this.messaging.reply(event.replyToken, messages);
  }

  private async buildReply(userId: string, action: Action): Promise<LineMessage[]> {
    if (action === 'help') return [helpMessage()];
    if (action === 'booking') return [bookingLinkMessage()];

    const customer = await this.lineService.findBoundCustomer(userId);
    if (!customer) return [bindPromptMessage()];
    if (action === 'bind') return [{ type: 'text', text: `您已綁定會員：${customer.name}` }];
    if (action === 'courses') return [coursesMessage(customer.name, await this.lineService.getCourses(customer.id))];
    if (action === 'wallet') return [walletMessage(customer.name, await this.lineService.getWallet(customer.id))];
    return [helpMessage()];
  }
}
