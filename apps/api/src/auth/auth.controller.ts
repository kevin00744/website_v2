import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './types';

interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  /** 給前端在 token 還沒過期前快速確認「我現在是誰」；storeFeatures 即時從 DB 查（不存在 JWT 裡） */
  @Post('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const storeFeatures = await this.authService.getStoreFeatures(user.storeId);
    return { ...user, storeFeatures };
  }

  /** 任何登入帳號都能改自己的密碼，一定要驗證舊密碼；管理員幫別人重設密碼走 PATCH /users/:id/password */
  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changeOwnPassword(user.id, dto.oldPassword, dto.newPassword);
  }
}
