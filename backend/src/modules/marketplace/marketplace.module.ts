import { Module } from '@nestjs/common';
import { MarketplaceController } from './controllers/marketplace.controller';
import { TradeMarketplaceService } from './services/trade-marketplace.service';
import { TradeMatcherService } from './services/trade-matcher.service';
import { TradeNegotiationService } from './services/trade-negotiation.service';
import { MarketplaceExpiryJob } from './jobs/marketplace-expiry.job';
import { ShiftPoolModule } from '../shift-pool/shift-pool.module';
import { NetworkModule } from '../network/network.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * Marketplace Module
 *
 * Shift trade marketplace for workers to post and browse trade offers.
 * Goes beyond simple swaps to enable:
 *
 * - Marketplace model: post offers, browse listings
 * - Preference matching: specify what you want in return
 * - Multi-step negotiations: counter-offers and discussions
 * - Intelligent matching: auto-find compatible trades
 *
 * Components:
 * - TradeMarketplaceService: Core marketplace CRUD operations
 * - TradeMatcherService: Intelligent matching and scoring
 * - TradeNegotiationService: Multi-step negotiation flows
 * - MarketplaceExpiryJob: Background job for expiry management
 *
 * Dependencies:
 * - ShiftPoolModule: For shift matching and availability
 * - NetworkModule: For reputation scoring
 * - NotificationModule: For real-time alerts
 */
@Module({
  imports: [
    ShiftPoolModule,
    NetworkModule,
    NotificationModule,
  ],
  controllers: [MarketplaceController],
  providers: [
    TradeMarketplaceService,
    TradeMatcherService,
    TradeNegotiationService,
    MarketplaceExpiryJob,
  ],
  exports: [
    TradeMarketplaceService,
    TradeMatcherService,
    TradeNegotiationService,
  ],
})
export class MarketplaceModule {}
