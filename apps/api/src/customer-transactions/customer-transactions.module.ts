import { Module } from '@nestjs/common';
import { CustomerTransactionsController } from './customer-transactions.controller';
import { CustomerTransactionsService } from './customer-transactions.service';

@Module({
  controllers: [CustomerTransactionsController],
  providers: [CustomerTransactionsService],
})
export class CustomerTransactionsModule {}
