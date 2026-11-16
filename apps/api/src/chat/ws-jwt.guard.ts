import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JWT_SECRET } from '../auth/jwt-secret.const';
import type { AuthenticatedUser } from '../auth/types';

interface JwtPayload {
  sub: number;
}

/**
 * WebSocket handshake 沒有標準的 Authorization header 機制可用，前端改用
 * `io(url, { auth: { token } })` 帶 token，這裡從 handshake.auth 讀（fallback 到
 * headers.authorization 是給用 query/header 方式連線的舊版 client 用）。
 *
 * 跟 JwtStrategy 一樣每次連線都重新查一次最新使用者狀態（角色/門店/區域/啟用狀態），
 * 不只信任 token payload，避免帳號被停用/調動後舊 token 還能連進來。
 *
 * 這裡只負責「token 有效嗎、使用者還存在嗎」，不檢查「這個使用者能不能看這個 conversation」——
 * 那是每個 @SubscribeMessage handler 自己要做的二次資料隔離檢查（沿用 REST API
 * Guard 攔角色、Service 內再用 canActorAccessCustomer 類的函式做資料隔離的雙重防護精神）。
 *
 * 重要：NestJS 的 @UseGuards() 掛在 Gateway 類別上只會包住 @SubscribeMessage 的 handler，
 * **不會**包住 handleConnection 這個生命週期 hook——Socket.IO 的傳輸層連線在 canActivate
 * 第一次真正被呼叫之前就已經完成了（要等到 client 送出第一個被攔截的事件才會觸發 guard）。
 * 所以拿 token 驗證身分這件事必須在 ChatGateway.handleConnection 裡顯式呼叫 authenticate()，
 * 才能在連線當下就把沒帶合法 token 的人斷開，而不是等到他們送出訊息才被擋。
 * canActivate 沿用同一份 authenticate() 邏輯，作為每個事件的二次防護（即使連線時驗證過，
 * 帳號也可能在連線期間被停用，這裡會用最新的 DB 狀態重新檢查一次）。
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const user = await this.authenticate(client);
    if (!user) {
      client.disconnect();
      return false;
    }
    return true;
  }

  /** 驗證成功時把使用者資訊掛到 client.data.user 並回傳；失敗回傳 null，不負責斷線（呼叫端決定）。 */
  async authenticate(client: Socket): Promise<AuthenticatedUser | null> {
    const token = this.extractToken(client);
    if (!token) return null;

    try {
      const payload = this.jwtService.verify<JwtPayload & { typ?: string }>(token, { secret: JWT_SECRET });
      // refresh token 只能用來換 access token，不能拿來連 WebSocket
      if (payload.typ) return null;
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, isActive: true },
        select: { id: true, username: true, email: true, name: true, role: true, storeId: true },
      });
      if (!user) return null;

      const enriched: AuthenticatedUser = { ...user, storeFeatures: null };
      (client.data as { user: AuthenticatedUser }).user = enriched;
      return enriched;
    } catch {
      return null;
    }
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;

    const header = client.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  }
}
