import { Module } from '@nestjs/common';
import { ServiceItemsController, StoreServiceItemsController } from './service-items.controller';
import { ServiceItemsService } from './service-items.service';

@Module({
  controllers: [ServiceItemsController, StoreServiceItemsController],
  providers: [ServiceItemsService],
  exports: [ServiceItemsService],
})
export class ServiceItemsModule {}
