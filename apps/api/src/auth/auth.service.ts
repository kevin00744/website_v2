import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AuthenticatedUser } from './types';

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
  /** 只有「記住這台裝置」/ PIN 帳號才會拿到；用來在 access token 過期後換新 */
  refreshToken?: string;
}

/**
 * Refresh token：給「記住這台裝置」與 PIN 快速切換用，只能拿來換新的 access token。
 * 跟 access token 一樣用 JWT_SECRET 簽章、不存 DB，所以重新部署/重啟 API 不會讓裝置登出
 * （前提是正式環境的 JWT_SECRET 固定不變）。每次換新都會重簽（滑動延長）。
 */
export const REFRESH_TOKEN_EXPIRES_IN = '180d';
export const REFRESH_TOKEN_TYP = 'refresh';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async issueRefreshToken(userId: number): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, typ: REFRESH_TOKEN_TYP }, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  }

  /** 以 refresh token 換新的 access token（+ 新的 refresh token）；帳號停用/刪除則失敗 */
  async refresh(refreshToken: string | undefined): Promise<Required<LoginResult>> {
    let payload: { sub?: number; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken ?? '');
    } catch {
      throw new AppError('AUTH_SESSION_EXPIRED', 'invalid refresh token', 401);
    }
    if (payload.typ !== REFRESH_TOKEN_TYP || !payload.sub) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'not a refresh token', 401);
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: { id: true, username: true, email: true, name: true, role: true, storeId: true },
    });
    if (!user) throw new AppError('AUTH_SESSION_EXPIRED', 'user not found or deactivated', 401);

    const storeFeatures = await this.getStoreFeatures(user.storeId);
    const [accessToken, nextRefresh] = await Promise.all([
      this.jwtService.signAsync({ sub: user.id }),
      this.issueRefreshToken(user.id),
    ]);
    return { accessToken, refreshToken: nextRefresh, user: { ...user, storeFeatures } };
  }

  async login(username: string, password: string, rememberDevice = false): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true, username: true, email: true, name: true, role: true, storeId: true, password: true, isActive: true },
    });

    // 帳號不存在跟密碼錯誤回同一個錯誤碼，不讓門市人員（或攻擊者）從錯誤訊息分辨出帳號是否存在
    if (!user || !user.isActive) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'invalid username or password', 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'invalid username or password', 401);
    }

    const storeFeatures = await this.getStoreFeatures(user.storeId);

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      storeFeatures,
    };

    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    if (!rememberDevice) return { accessToken, user: authenticatedUser };
    return { accessToken, user: authenticatedUser, refreshToken: await this.issueRefreshToken(user.id) };
  }

  /** 給 /me 端點即時查詢（features 可能被店長更新，不能靠 JWT payload 的快取值） */
  async getStoreFeatures(storeId: number | null): Promise<Record<string, boolean> | null> {
    if (!storeId) return null;
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { features: true } });
    return (store?.features as Record<string, boolean> | null) ?? null;
  }

  /**
   * 任何登入帳號都能改自己的密碼，但一定要先驗證舊密碼——跟管理員強制重設（UsersService.resetPassword，
   * 不需要舊密碼）是兩條故意分開的路徑，避免「忘記密碼」跟「帳號被偷用」混在同一支 API 裡。
   */
  async changeOwnPassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'user not found', 401);
    }

    const matches = await bcrypt.compare(oldPassword, user.password);
    if (!matches) {
      throw new AppError('AUTH_OLD_PASSWORD_INVALID', 'old password does not match', 400);
    }
    if (!newPassword || newPassword.length < 4) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 4 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: passwordHash } });
  }
}
