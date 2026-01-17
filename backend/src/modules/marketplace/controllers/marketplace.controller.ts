import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { TradeMarketplaceService } from '../services/trade-marketplace.service';
import { TradeMatcherService } from '../services/trade-matcher.service';
import { TradeNegotiationService } from '../services/trade-negotiation.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, CurrentProfile } from '@/common/decorators/current-user.decorator';
import {
  CreateTradeOfferDto,
  SearchTradeOffersDto,
  ProposeTradeDto,
  RejectTradeDto,
  CounterOfferDto,
} from '../dto/marketplace.dto';
import { TradeOfferStatus } from '../entities/trade-offer.entity';
import { TradeNegotiationStatus } from '../entities/trade-negotiation.entity';

/**
 * Marketplace Controller
 *
 * REST API for the shift trade marketplace.
 * Handles offer management, trade proposals, and negotiations.
 */
@ApiTags('marketplace')
@Controller('marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: TradeMarketplaceService,
    private readonly matcherService: TradeMatcherService,
    private readonly negotiationService: TradeNegotiationService,
  ) {}

  // ==================== OFFERS ====================

  @Post('offers')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Create a trade offer' })
  async createOffer(
    @CurrentProfile('id') profileId: string,
    @Body() dto: CreateTradeOfferDto,
  ) {
    return this.marketplaceService.createTradeOffer(
      profileId,
      dto.shiftId,
      {
        daysOfWeek: dto.preferences.daysOfWeek,
        timeSlots: dto.preferences.timeSlots,
        positions: dto.preferences.positions,
        flexibleDates: dto.preferences.flexibleDates,
        preferredDateFrom: dto.preferences.preferredDateFrom
          ? new Date(dto.preferences.preferredDateFrom)
          : undefined,
        preferredDateTo: dto.preferences.preferredDateTo
          ? new Date(dto.preferences.preferredDateTo)
          : undefined,
        allowCrossRestaurant: dto.preferences.allowCrossRestaurant,
        maxDistanceMiles: dto.preferences.maxDistanceMiles,
        notes: dto.preferences.notes,
      },
      dto.expiresInHours,
    );
  }

  @Get('offers')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Search trade offers' })
  @ApiQuery({ name: 'positions', required: false, type: [String] })
  @ApiQuery({ name: 'daysOfWeek', required: false, type: [Number] })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'includeCrossRestaurant', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async searchOffers(
    @CurrentProfile('id') profileId: string,
    @Query() query: SearchTradeOffersDto,
  ) {
    return this.marketplaceService.searchTradeOffers(profileId, {
      positions: query.positions,
      daysOfWeek: query.daysOfWeek,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      restaurantId: query.restaurantId,
      includeCrossRestaurant: query.includeCrossRestaurant ?? true,
      maxDistanceMiles: query.maxDistanceMiles,
      status: query.status,
      limit: query.limit || 20,
      offset: query.offset || 0,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get('offers/my')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get my trade offers' })
  async getMyOffers(@CurrentProfile('id') profileId: string) {
    return this.marketplaceService.getMyOffers(profileId);
  }

  @Get('offers/:id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get trade offer details' })
  @ApiParam({ name: 'id', description: 'Trade offer ID' })
  async getOffer(@Param('id') id: string) {
    return this.marketplaceService.getOffer(id);
  }

  @Get('offers/:id/matches')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get potential matches for an offer' })
  @ApiParam({ name: 'id', description: 'Trade offer ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOfferMatches(
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.matcherService.findPotentialMatches(id, limit || 10);
  }

  @Get('offers/:id/mutual-matches')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get mutual matches (both sides want each other\'s shifts)' })
  @ApiParam({ name: 'id', description: 'Trade offer ID' })
  async getMutualMatches(@Param('id') id: string) {
    return this.matcherService.findMutualMatches(id);
  }

  @Delete('offers/:id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Cancel a trade offer' })
  @ApiParam({ name: 'id', description: 'Trade offer ID' })
  async cancelOffer(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.marketplaceService.cancelOffer(id, profileId);
  }

  @Get('shifts/:shiftId/matching-offers')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get offers that match a specific shift' })
  @ApiParam({ name: 'shiftId', description: 'Shift ID' })
  async getMatchingOffersForShift(
    @Param('shiftId') shiftId: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.marketplaceService.getMatchingOffers(shiftId, profileId);
  }

  // ==================== TRADES ====================

  @Post('trades')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Propose a trade' })
  async proposeTrade(
    @CurrentProfile('id') profileId: string,
    @Body() dto: ProposeTradeDto,
  ) {
    return this.marketplaceService.proposeTradeMatch(
      dto.offerId,
      profileId,
      dto.acceptorShiftId,
      dto.message,
    );
  }

  @Get('trades/:id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get trade details' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  async getTrade(@Param('id') id: string) {
    return this.marketplaceService.getTradeMatch(id);
  }

  @Post('trades/:id/accept')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Accept a trade proposal' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  async acceptTrade(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.marketplaceService.acceptTrade(id, profileId);
  }

  @Post('trades/:id/reject')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Reject a trade proposal' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  async rejectTrade(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
    @Body() dto: RejectTradeDto,
  ) {
    return this.marketplaceService.rejectTrade(id, profileId, dto.reason);
  }

  @Post('trades/:id/manager-approve')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Manager approves a trade' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  async managerApproveTrade(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.marketplaceService.managerApproveTrade(id, userId);
  }

  @Post('trades/:id/manager-reject')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Manager rejects a trade' })
  @ApiParam({ name: 'id', description: 'Trade ID' })
  async managerRejectTrade(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RejectTradeDto,
  ) {
    return this.marketplaceService.managerRejectTrade(id, userId, dto.reason);
  }

  // ==================== RECOMMENDATIONS ====================

  @Get('recommendations')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get personalized trade recommendations' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRecommendations(
    @CurrentProfile('id') profileId: string,
    @Query('limit') limit?: number,
  ) {
    return this.matcherService.getRecommendedTrades(profileId, limit || 10);
  }

  @Post('offers/:id/notify-matches')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Notify potential matches about an offer' })
  @ApiParam({ name: 'id', description: 'Trade offer ID' })
  async notifyMatches(@Param('id') id: string) {
    const count = await this.matcherService.notifyPotentialMatches(id);
    return { notified: count };
  }

  // ==================== NEGOTIATIONS ====================

  @Post('negotiations')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Start a negotiation between two offers' })
  async startNegotiation(
    @CurrentProfile('id') profileId: string,
    @Body() dto: {
      offer1Id: string;
      offer2Id: string;
      initialMessage?: string;
      expiresInHours?: number;
    },
  ) {
    return this.negotiationService.startNegotiation(
      dto.offer1Id,
      dto.offer2Id,
      profileId,
      dto.initialMessage,
      dto.expiresInHours,
    );
  }

  @Get('negotiations')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get my negotiations' })
  @ApiQuery({ name: 'status', required: false, enum: TradeNegotiationStatus, isArray: true })
  @ApiQuery({ name: 'pendingMyResponse', required: false, type: Boolean })
  async getMyNegotiations(
    @CurrentProfile('id') profileId: string,
    @Query('status') status?: TradeNegotiationStatus[],
    @Query('pendingMyResponse') pendingMyResponse?: boolean,
  ) {
    return this.negotiationService.getMyNegotiations(
      profileId,
      status,
      pendingMyResponse,
    );
  }

  @Get('negotiations/:id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get negotiation details' })
  @ApiParam({ name: 'id', description: 'Negotiation ID' })
  async getNegotiation(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.negotiationService.getNegotiation(id, profileId);
  }

  @Get('negotiations/:id/history')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get full negotiation message history' })
  @ApiParam({ name: 'id', description: 'Negotiation ID' })
  async getNegotiationHistory(@Param('id') id: string) {
    return this.negotiationService.getNegotiationHistory(id);
  }

  @Post('negotiations/:id/counter')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Send a counter-offer' })
  @ApiParam({ name: 'id', description: 'Negotiation ID' })
  async counterOffer(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.negotiationService.counterOffer(
      id,
      profileId,
      {
        shift1Id: dto.shift1Id,
        shift2Id: dto.shift2Id,
        compensation: dto.compensationType
          ? {
              type: dto.compensationType,
              amount: dto.compensationAmount,
              description: dto.compensationDescription,
            }
          : undefined,
        conditions: dto.conditions,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
      },
      dto.message,
    );
  }

  @Post('negotiations/:id/message')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Send a message in negotiation' })
  @ApiParam({ name: 'id', description: 'Negotiation ID' })
  async sendMessage(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
    @Body() dto: { message: string },
  ) {
    return this.negotiationService.sendMessage(id, profileId, dto.message);
  }

  @Post('negotiations/:id/finalize')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Accept terms and finalize negotiation' })
  @ApiParam({ name: 'id', description: 'Negotiation ID' })
  async finalizeNegotiation(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.negotiationService.finalizeNegotiation(id, profileId);
  }

  @Post('negotiations/:id/cancel')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Cancel a negotiation' })
  @ApiParam({ name: 'id', description: 'Negotiation ID' })
  async cancelNegotiation(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
    @Body() dto?: { reason?: string },
  ) {
    return this.negotiationService.cancelNegotiation(id, profileId, dto?.reason);
  }

  // ==================== MATCH SCORING ====================

  @Get('score/:offer1Id/:offer2Id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get compatibility score between two offers' })
  @ApiParam({ name: 'offer1Id', description: 'First offer ID' })
  @ApiParam({ name: 'offer2Id', description: 'Second offer ID' })
  async scoreMatch(
    @Param('offer1Id') offer1Id: string,
    @Param('offer2Id') offer2Id: string,
  ) {
    return this.matcherService.scoreMatch(offer1Id, offer2Id);
  }
}
