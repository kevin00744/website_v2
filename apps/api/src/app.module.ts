import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SignatureModule } from './signature/signature.module';
import { CustomersModule } from './customers/customers.module';
import { StoresModule } from './stores/stores.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { InventoryModule } from './inventory/inventory.module';
import { ContactModule } from './contact/contact.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FinancialModule } from './financial/financial.module';
import { ServiceRecordModule } from './service-records/service-record.module';
import { ServiceItemsModule } from './service-items/service-items.module';
import { PromotionPlansModule } from './promotion-plans/promotion-plans.module';
import { PettyCashModule } from './petty-cash/petty-cash.module';
import { CustomerCoursesModule } from './customer-courses/customer-courses.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CustomerTransactionsModule } from './customer-transactions/customer-transactions.module';
import { ConsentTemplatesModule } from './consent-templates/consent-templates.module';
import { LineModule } from './line/line.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SignatureModule,
    CustomersModule,
    StoresModule,
    UsersModule,
    ChatModule,
    InventoryModule,
    ContactModule,
    AttendanceModule,
    FinancialModule,
    ServiceRecordModule,
    ServiceItemsModule,
    PromotionPlansModule,
    PettyCashModule,
    CustomerCoursesModule,
    AppointmentsModule,
    CustomerTransactionsModule,
    ConsentTemplatesModule,
    LineModule,
  ],
})
export class AppModule {}
