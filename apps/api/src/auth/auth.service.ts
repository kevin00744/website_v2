import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AuthenticatedUser } from './types';

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, name: true, role: true, storeId: true, region: true, password: true, isActive: true },
    });

    // 帳號不存在跟密碼錯誤回同一個錯誤碼，不讓門市人員（或攻擊者）從錯誤訊息分辨出帳號是否存在
    if (!user || !user.isActive) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'invalid email or password', 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'invalid email or password', 401);
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      region: user.region,
    };

    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return { accessToken, user: authenticatedUser };
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
    if (!newPassword || newPassword.length < 8) {
      throw new AppError('USER_PASSWORD_TOO_SHORT', 'password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: passwordHash } });
  }
}
