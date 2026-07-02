import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../errors/app-error';

/**
 * 全域攔截：對外永遠只回 { code }，絕不洩漏 exception message/stack。
 * 真正的訊息留在 server log，畫面文字一律由前端 packages/copy/zh-TW.ts 轉譯。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof AppError) {
      this.logger.warn(`[${exception.code}] ${exception.message}`);
      response.status(exception.httpStatus).json({ code: exception.code });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(`HttpException ${status}: ${exception.message}`);
      response.status(status).json({ code: 'HTTP_ERROR' });
      return;
    }

    this.logger.error('Unhandled exception', exception as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'DEFAULT' });
  }
}
