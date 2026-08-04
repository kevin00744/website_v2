import { Module } from '@nestjs/common';
import { PromotionPlansController } from './promotion-plans.controller';
import { PromotionPlansService } from './promotion-plans.service';

@Module({
  controllers: [PromotionPlansController],
  providers: [PromotionPlansService],
  exports: [PromotionPlansService],
})
export class PromotionPlansModule {}
