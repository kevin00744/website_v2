import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { ContentController } from './content.controller';
import { CustomersService } from './customers.service';
import { CustomerDocumentService } from './customer-document.service';
import { CustomerDisclaimerService } from './customer-disclaimer.service';
import { CustomerTreatmentService } from './customer-treatment.service';

@Module({
  controllers: [CustomersController, ContentController],
  providers: [CustomersService, CustomerDocumentService, CustomerDisclaimerService, CustomerTreatmentService],
  exports: [CustomersService, CustomerDocumentService, CustomerDisclaimerService, CustomerTreatmentService],
})
export class CustomersModule {}
