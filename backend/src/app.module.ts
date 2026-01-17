import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { IdentityModule } from './modules/identity/identity.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { ShiftPoolModule } from './modules/shift-pool/shift-pool.module';
import { NotificationModule } from './modules/notification/notification.module';
import { GhostKitchenModule } from './modules/ghost-kitchen/ghost-kitchen.module';
import { NetworkModule } from './modules/network/network.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { databaseConfig } from './config/database.config';
import { authConfig } from './config/auth.config';
import { notificationConfig } from './config/notification.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig, notificationConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),

    // Infrastructure
    PrismaModule,
    RedisModule,

    // Feature modules
    IdentityModule,
    SchedulingModule,
    ShiftPoolModule,
    NotificationModule,
    GhostKitchenModule,
    NetworkModule,
    PaymentsModule,
    MarketplaceModule,
  ],
})
export class AppModule {}
