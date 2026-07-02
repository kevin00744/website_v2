import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppError } from '../common/errors/app-error';

/** 驗證 JWT 是否存在且有效；失敗一律轉成語意化 AppError，跟其餘錯誤走同一套白話文字典 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'missing or invalid token', 401);
    }
    return user;
  }
}
