import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';

// Controllers
import {
  PaymentsController,
  PaymentsWebhookController,
} from './controllers/payments.controller';

// Services
import { EarnedWageService } from './services/earned-wage.service';
import { PayrollSyncService } from './services/payroll-sync.service';

// Gateways
import { PaymentsGateway } from './gateways/payments.gateway';

// Clients
import { DailyPayClient } from './clients/dailypay.client';

// Config
import { dailypayConfig } from './config/dailypay.config';

// Common modules
import { PrismaModule } from '@/common/prisma/prisma.module';
import { RedisModule } from '@/common/redis/redis.module';

// Other modules
import { NotificationModule } from '@/modules/notification/notification.module';

/**
 * Payments Module
 *
 * Provides earned wage access / instant pay functionality:
 * - DailyPay integration for instant wage access
 * - Worker enrollment management
 * - Balance and transfer operations
 * - Payroll synchronization and reporting
 * - Reconciliation between instant and regular pay
 *
 * Features:
 * - Real-time earned wage calculations
 * - Configurable fees (flat or percentage)
 * - Daily/weekly transfer limits
 * - Automatic shift-to-earnings sync
 * - Payroll export for integration with external systems
 * - Webhook handling for transfer status updates
 *
 * Business Rules:
 * - Only completed shifts count toward earned wages
 * - Configurable percentage of earnings available for transfer
 * - Minimum transfer amount enforced
 * - Maximum daily/weekly transfer limits
 * - Fee structure configurable per deployment
 */
@Module({
  imports: [
    ConfigModule.forFeature(dailypayConfig),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [
    PaymentsController,
    PaymentsWebhookController,
  ],
  providers: [
    // Services
    EarnedWageService,
    PayrollSyncService,

    // Gateways
    PaymentsGateway,

    // Clients
    DailyPayClient,
  ],
  exports: [
    EarnedWageService,
    PayrollSyncService,
    PaymentsGateway,
    DailyPayClient,
  ],
})
export class PaymentsModule {}
