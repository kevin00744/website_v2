import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerDocumentService } from './customer-document.service';
import { CustomerDisclaimerService } from './customer-disclaimer.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerDocumentService, CustomerDisclaimerService],
  exports: [CustomersService, CustomerDocumentService, CustomerDisclaimerService],
})
export class CustomersModule {}
