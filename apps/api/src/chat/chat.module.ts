import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../auth/jwt-secret.const';

/**
 * 跟 AuthModule 各自註冊一份 JwtModule（同一組 JWT_SECRET/JWT_EXPIRES_IN 常數），
 * 不是共用同一個 JwtModule instance——AuthModule 沒有 export JwtModule，
 * 而 JwtModule.register() 是 stateless 的設定模組，重新 register 一份不會有副作用。
 */
@Module({
  imports: [
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: JWT_EXPIRES_IN },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, WsJwtGuard],
})
export class ChatModule {}
