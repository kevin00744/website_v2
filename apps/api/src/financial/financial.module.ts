import { Module } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { OutsourcePayoutService } from './outsource-payout.service';

@Module({
  controllers: [FinancialController],
  providers: [FinancialService, OutsourcePayoutService],
  exports: [FinancialService, OutsourcePayoutService],
})
export class FinancialModule {}
