import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';

// Controllers
import { GhostKitchenController, GhostKitchenWebhookController } from './controllers/ghost-kitchen.controller';
import { GhostModeController } from './controllers/ghost-mode.controller';
import { ForecastController } from './controllers/forecast.controller';
import { KitchenHubWebhookController } from './webhooks/kitchenhub.webhook.controller';

// Services
import { GhostKitchenService } from './services/ghost-kitchen.service';
import { GhostModeService } from './services/ghost-mode.service';
import { SessionService } from './services/session.service';
import { AnalyticsService } from './services/analytics.service';
import { AggregatorClientService } from './services/aggregator-client.service';
import { OrderService } from './services/order.service';
import { CapacityService } from './services/capacity.service';

// Forecasting services
import { DemandForecasterService } from './services/demand-forecaster.service';
import { OpportunityDetectorService } from './services/opportunity-detector.service';
import { StaffingRecommenderService } from './services/staffing-recommender.service';
import { WeatherService } from './services/weather.service';

// Jobs
import { ForecastJob } from './jobs/forecast.job';

// Gateways
import { GhostKitchenGateway } from './gateways/ghost-kitchen.gateway';

// Clients
import { KitchenHubClient } from './clients/kitchenhub.client';

// Config
import { kitchenhubConfig } from './config/kitchenhub.config';

// Common modules
import { PrismaModule } from '@/common/prisma/prisma.module';
import { RedisModule } from '@/common/redis/redis.module';

// Other modules
import { NotificationModule } from '@/modules/notification/notification.module';

/**
 * Ghost Kitchen Module
 *
 * Provides ghost kitchen / delivery-only mode functionality:
 * - Ghost mode toggle (enable/disable/pause)
 * - KitchenHub integration for order aggregation
 * - Order lifecycle management
 * - Kitchen capacity management
 * - Session tracking and analytics
 * - P&L calculations and reporting
 * - Demand forecasting
 * - Real-time WebSocket updates
 * - Webhook handling for delivery platforms
 *
 * Supported platforms (via KitchenHub):
 * - DoorDash
 * - UberEats
 * - Grubhub
 */
@Module({
  imports: [
    ConfigModule.forFeature(kitchenhubConfig),
    EventEmitterModule.forRoot(),
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [
    GhostKitchenController,
    GhostKitchenWebhookController,
    GhostModeController,
    ForecastController,
    KitchenHubWebhookController,
  ],
  providers: [
    // Core services
    GhostKitchenService,
    GhostModeService,
    SessionService,
    AnalyticsService,
    OrderService,
    CapacityService,

    // Forecasting services
    DemandForecasterService,
    OpportunityDetectorService,
    StaffingRecommenderService,
    WeatherService,

    // Jobs
    ForecastJob,

    // Gateways
    GhostKitchenGateway,

    // Clients
    KitchenHubClient,
    AggregatorClientService, // Legacy client for backward compatibility
  ],
  exports: [
    GhostKitchenService,
    GhostModeService,
    SessionService,
    AnalyticsService,
    OrderService,
    CapacityService,
    GhostKitchenGateway,
    KitchenHubClient,
    // Forecasting services
    DemandForecasterService,
    OpportunityDetectorService,
    StaffingRecommenderService,
    WeatherService,
    ForecastJob,
  ],
})
export class GhostKitchenModule {}
