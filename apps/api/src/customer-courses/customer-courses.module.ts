import { Module } from '@nestjs/common';
import { CustomerCoursesController } from './customer-courses.controller';
import { CustomerCoursesService } from './customer-courses.service';

@Module({
  controllers: [CustomerCoursesController],
  providers: [CustomerCoursesService],
})
export class CustomerCoursesModule {}
