import { Module } from '@nestjs/common';
import { LineMessagingModule } from './line-messaging.module';
import { LineService } from './line.service';
import { LineWebhookController } from './line-webhook.controller';
import { LiffController } from './liff.controller';
import { LineAdminController } from './line-admin.controller';
import { LiffAuthGuard } from './liff-auth.guard';

@Module({
  imports: [LineMessagingModule],
  controllers: [LineWebhookController, LiffController, LineAdminController],
  providers: [LineService, LiffAuthGuard],
})
export class LineModule {}
