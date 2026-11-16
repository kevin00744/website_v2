import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';
import { LineNotifyService } from './line-notify.service';

/** 只負責「發訊息」，讓 AppointmentsModule 可以匯入而不會和 LineModule 形成循環依賴 */
@Module({
  providers: [LineMessagingService, LineNotifyService],
  exports: [LineMessagingService, LineNotifyService],
})
export class LineMessagingModule {}
