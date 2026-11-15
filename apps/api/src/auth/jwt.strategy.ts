import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { JWT_SECRET } from './jwt-secret.const';
import type { AuthenticatedUser } from './types';

interface JwtPayload {
  sub: number;
}

/**
 * 每個請求都重新查一次最新的使用者狀態（角色/門店/區域/啟用狀態），
 * 不是只信任 token 裡簽發當下凍結的角色資訊——避免帳號被停用或調動分店後，
 * 舊 token 在過期前還能用舊權限操作。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: { id: true, username: true, email: true, name: true, role: true, storeId: true },
    });
    if (!user) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'user not found or deactivated', 401);
    }
    // storeFeatures 不存進 JWT（features 可被店長即時更新），req.user 上設為 null。
    // 需要即時 features 時由 /auth/me 端點從 DB 查詢。
    return { ...user, storeFeatures: null };
  }
}
