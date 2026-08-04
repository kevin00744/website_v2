import { Module } from '@nestjs/common';
import { ServiceRecordController } from './service-record.controller';
import { ServiceRecordService } from './service-record.service';

@Module({
  controllers: [ServiceRecordController],
  providers: [ServiceRecordService],
  exports: [ServiceRecordService],
})
export class ServiceRecordModule {}
