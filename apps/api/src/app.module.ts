import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SignatureModule } from './signature/signature.module';
import { CustomersModule } from './customers/customers.module';
import { ContentModule } from './content/content.module';
import { StoresModule } from './stores/stores.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { InventoryModule } from './inventory/inventory.module';
import { CmsModule } from './cms/cms.module';
import { ProductsModule } from './products/products.module';
import { ContactModule } from './contact/contact.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SignatureModule,
    CustomersModule,
    ContentModule,
    StoresModule,
    UsersModule,
    ChatModule,
    InventoryModule,
    CmsModule,
    ProductsModule,
    ContactModule,
  ],
})
export class AppModule {}
