import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { NotificationService } from '@/modules/notification/services/notification.service';
import { ShiftMatcherService } from '@/modules/shift-pool/services/shift-matcher.service';
import {
  TradeOfferStatus,
  TradePreferences,
  TradeOfferSearchFilters,
} from '../entities/trade-offer.entity';
import { TradeMatchStatus } from '../entities/trade-match.entity';
import { NotificationType } from '@restaurant-scheduler/shared';

/**
 * Trade Marketplace Service
 *
 * Core marketplace logic for shift trading:
 * - Create and manage trade offers
 * - Search for compatible offers
 * - Propose and accept trades
 * - Execute shift swaps
 *
 * This service differs from simple swaps in that it:
 * 1. Supports a marketplace model (post offers, browse listings)
 * 2. Has preference matching (not just direct swaps)
 * 3. Tracks engagement metrics (views, interests)
 * 4. Supports negotiation workflows
 */
@Injectable()
export class TradeMarketplaceService {
  private readonly logger = new Logger(TradeMarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly shiftMatcher: ShiftMatcherService,
  ) {}

  /**
   * Create a trade offer for a shift
   *
   * Posts a shift to the marketplace with preferences for what the worker
   * wants in return. Other workers can browse and propose trades.
   */
  async createTradeOffer(
    workerId: string,
    offerShiftId: string,
    preferences: TradePreferences,
    expiresInHours: number = 72,
  ) {
    // Validate shift ownership
    const shift = await this.prisma.shift.findUnique({
      where: { id: offerShiftId },
      include: {
        restaurant: { select: { id: true, name: true } },
        assignedTo: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    if (shift.assignedToId !== workerId) {
      throw new ForbiddenException('You are not assigned to this shift');
    }

    // Check if shift is in the future
    if (new Date(shift.startTime) <= new Date()) {
      throw new BadRequestException('Cannot create offer for past or current shifts');
    }

    // Check for existing open offers for this shift
    const existingOffer = await this.prisma.tradeOffer.findFirst({
      where: {
        shiftId: offerShiftId,
        status: TradeOfferStatus.OPEN,
      },
    });

    if (existingOffer) {
      throw new BadRequestException('An open trade offer already exists for this shift');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const offer = await this.prisma.tradeOffer.create({
      data: {
        workerId,
        shiftId: offerShiftId,
        restaurantId: shift.restaurantId,
        status: TradeOfferStatus.OPEN,
        preferences: preferences as any,
        expiresAt,
        viewCount: 0,
        interestCount: 0,
      },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true } },
          },
        },
      },
    });

    this.logger.log(`Trade offer created: ${offer.id} for shift ${offerShiftId}`);

    // Cache the new offer for quick lookup
    await this.redis.setJson(`trade-offer:${offer.id}`, offer, 3600);

    return this.formatOfferResponse(offer);
  }

  /**
   * Search trade offers based on filters
   *
   * Workers can search for offers that match their preferences.
   * Results are filtered by position compatibility, availability, etc.
   */
  async searchTradeOffers(
    workerId: string,
    filters: TradeOfferSearchFilters,
  ) {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: {
        restaurant: {
          select: { id: true, lat: true, lng: true },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const where: any = {
      status: filters.status?.length ? { in: filters.status } : TradeOfferStatus.OPEN,
      expiresAt: { gt: new Date() },
      workerId: { not: workerId }, // Exclude own offers
    };

    // Restaurant filter
    if (filters.restaurantId) {
      where.restaurantId = filters.restaurantId;
    } else if (!filters.includeCrossRestaurant) {
      where.restaurantId = worker.restaurantId;
    }

    // Position filter - must match worker's qualifications
    if (filters.positions?.length) {
      where.shift = {
        position: { in: filters.positions.filter((p) => worker.positions.includes(p)) },
      };
    } else {
      // Default to positions the worker is qualified for
      where.shift = {
        position: { in: worker.positions },
      };
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      where.shift = {
        ...where.shift,
        startTime: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      };
    }

    const orderBy: any = {};
    if (filters.sortBy) {
      orderBy[filters.sortBy] = filters.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const offers = await this.prisma.tradeOffer.findMany({
      where,
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
        _count: {
          select: { matches: true },
        },
      },
      orderBy,
      skip: filters.offset || 0,
      take: filters.limit || 20,
    });

    // Filter by day of week if specified
    let filteredOffers = offers;
    if (filters.daysOfWeek?.length) {
      filteredOffers = offers.filter((offer) => {
        const shiftDay = new Date(offer.shift.startTime).getDay();
        return filters.daysOfWeek!.includes(shiftDay);
      });
    }

    // Increment view count for each offer viewed
    await this.incrementViewCounts(filteredOffers.map((o) => o.id));

    return filteredOffers.map((offer) => this.formatOfferResponse(offer));
  }

  /**
   * Propose a trade match
   *
   * A worker proposes to trade their shift for an offer's shift.
   */
  async proposeTradeMatch(
    offerId: string,
    acceptorId: string,
    acceptorShiftId: string,
    message?: string,
  ) {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: {
        shift: { include: { restaurant: true } },
        worker: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Trade offer not found');
    }

    if (offer.status !== TradeOfferStatus.OPEN) {
      throw new BadRequestException('This offer is no longer open for trades');
    }

    if (offer.workerId === acceptorId) {
      throw new BadRequestException('Cannot propose a trade with yourself');
    }

    // Validate acceptor's shift
    const acceptorShift = await this.prisma.shift.findUnique({
      where: { id: acceptorShiftId },
      include: { restaurant: true },
    });

    if (!acceptorShift) {
      throw new NotFoundException('Your shift was not found');
    }

    if (acceptorShift.assignedToId !== acceptorId) {
      throw new ForbiddenException('You are not assigned to this shift');
    }

    // Check if shift is in the future
    if (new Date(acceptorShift.startTime) <= new Date()) {
      throw new BadRequestException('Cannot trade past or current shifts');
    }

    // Validate position compatibility
    const offerWorker = await this.prisma.workerProfile.findUnique({
      where: { id: offer.workerId },
    });
    const acceptor = await this.prisma.workerProfile.findUnique({
      where: { id: acceptorId },
    });

    if (!offerWorker || !acceptor) {
      throw new NotFoundException('Worker profiles not found');
    }

    // Check if both workers are qualified for each other's shifts
    if (!acceptor.positions.includes(offer.shift.position)) {
      throw new BadRequestException(
        `You are not qualified for the ${offer.shift.position} position`,
      );
    }

    if (!offerWorker.positions.includes(acceptorShift.position)) {
      throw new BadRequestException(
        `The offer owner is not qualified for your ${acceptorShift.position} position`,
      );
    }

    // Check for conflicts
    const [acceptorConflict, offererConflict] = await Promise.all([
      this.shiftMatcher.isWorkerAvailable(
        acceptorId,
        new Date(offer.shift.startTime),
        new Date(offer.shift.endTime),
      ),
      this.shiftMatcher.isWorkerAvailable(
        offer.workerId,
        new Date(acceptorShift.startTime),
        new Date(acceptorShift.endTime),
      ),
    ]);

    if (!acceptorConflict) {
      throw new BadRequestException('You have a scheduling conflict with the offered shift');
    }

    if (!offererConflict) {
      throw new BadRequestException('The offer owner has a scheduling conflict with your shift');
    }

    // Determine if manager approval is required
    const isCrossRestaurant = offer.shift.restaurantId !== acceptorShift.restaurantId;
    const requiresApproval = isCrossRestaurant ||
      offer.shift.restaurant.requireClaimApproval;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour expiry

    // Create the trade match
    const match = await this.prisma.tradeMatch.create({
      data: {
        offerId,
        offererId: offer.workerId,
        offererShiftId: offer.shiftId,
        acceptorId,
        acceptorShiftId,
        status: TradeMatchStatus.PROPOSED,
        message,
        managerApproval: {
          required: requiresApproval,
        },
        expiresAt,
      },
      include: {
        offer: true,
        offerer: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        acceptor: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        offererShift: {
          include: { restaurant: { select: { id: true, name: true } } },
        },
        acceptorShift: {
          include: { restaurant: { select: { id: true, name: true } } },
        },
      },
    });

    // Update offer status and interest count
    await this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: {
        status: TradeOfferStatus.MATCHED,
        interestCount: { increment: 1 },
      },
    });

    this.logger.log(`Trade match proposed: ${match.id}`);

    // Notify the offer owner
    await this.notificationService.send(
      offer.worker.user.id,
      NotificationType.SWAP_REQUEST,
      {
        swapId: match.id,
        workerName: `${match.acceptor.user.firstName} ${match.acceptor.user.lastName}`,
        shiftDate: new Date(acceptorShift.startTime).toLocaleDateString(),
      },
    );

    return this.formatMatchResponse(match);
  }

  /**
   * Accept a proposed trade
   */
  async acceptTrade(tradeId: string, workerId: string) {
    const match = await this.prisma.tradeMatch.findUnique({
      where: { id: tradeId },
      include: {
        offer: true,
        offererShift: { include: { restaurant: true } },
        acceptorShift: { include: { restaurant: true } },
        offerer: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        acceptor: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Trade match not found');
    }

    // Only the offer owner can accept
    if (match.offererId !== workerId) {
      throw new ForbiddenException('Only the offer owner can accept this trade');
    }

    if (match.status !== TradeMatchStatus.PROPOSED) {
      throw new BadRequestException('This trade cannot be accepted in its current state');
    }

    // Check if manager approval is required
    const approval = match.managerApproval as any;
    if (approval?.required && !approval?.approved) {
      // Mark as accepted, pending manager approval
      await this.prisma.tradeMatch.update({
        where: { id: tradeId },
        data: {
          status: TradeMatchStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      this.logger.log(`Trade ${tradeId} accepted, awaiting manager approval`);

      // Notify managers
      // TODO: Send notification to managers

      return this.getTradeMatch(tradeId);
    }

    // Execute the trade
    return this.executeTrade(tradeId);
  }

  /**
   * Reject a proposed trade
   */
  async rejectTrade(tradeId: string, workerId: string, reason?: string) {
    const match = await this.prisma.tradeMatch.findUnique({
      where: { id: tradeId },
      include: {
        offer: true,
        acceptor: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Trade match not found');
    }

    if (match.offererId !== workerId) {
      throw new ForbiddenException('Only the offer owner can reject this trade');
    }

    if (match.status !== TradeMatchStatus.PROPOSED) {
      throw new BadRequestException('This trade cannot be rejected in its current state');
    }

    await this.prisma.$transaction([
      // Update match status
      this.prisma.tradeMatch.update({
        where: { id: tradeId },
        data: {
          status: TradeMatchStatus.REJECTED,
          rejectionReason: reason,
          respondedAt: new Date(),
        },
      }),
      // Re-open the offer
      this.prisma.tradeOffer.update({
        where: { id: match.offerId },
        data: {
          status: TradeOfferStatus.OPEN,
        },
      }),
    ]);

    this.logger.log(`Trade ${tradeId} rejected`);

    // Notify the proposer
    await this.notificationService.send(
      match.acceptor.user.id,
      NotificationType.SWAP_REJECTED,
      {
        swapId: tradeId,
        reason: reason || 'No reason provided',
      },
    );

    return this.getTradeMatch(tradeId);
  }

  /**
   * Cancel an offer
   */
  async cancelOffer(offerId: string, workerId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: {
        matches: {
          where: { status: TradeMatchStatus.PROPOSED },
          include: {
            acceptor: {
              include: { user: { select: { id: true } } },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Trade offer not found');
    }

    if (offer.workerId !== workerId) {
      throw new ForbiddenException('You can only cancel your own offers');
    }

    if (offer.status !== TradeOfferStatus.OPEN && offer.status !== TradeOfferStatus.MATCHED) {
      throw new BadRequestException('This offer cannot be cancelled');
    }

    await this.prisma.$transaction([
      // Cancel the offer
      this.prisma.tradeOffer.update({
        where: { id: offerId },
        data: {
          status: TradeOfferStatus.CANCELLED,
        },
      }),
      // Cancel any pending matches
      this.prisma.tradeMatch.updateMany({
        where: {
          offerId,
          status: TradeMatchStatus.PROPOSED,
        },
        data: {
          status: TradeMatchStatus.CANCELLED,
        },
      }),
    ]);

    this.logger.log(`Trade offer ${offerId} cancelled`);

    // Notify any pending proposers
    for (const match of offer.matches) {
      await this.notificationService.send(
        match.acceptor.user.id,
        NotificationType.SWAP_CANCELLED,
        { swapId: match.id },
      );
    }

    return this.getOffer(offerId);
  }

  /**
   * Get worker's active offers
   */
  async getMyOffers(workerId: string) {
    const offers = await this.prisma.tradeOffer.findMany({
      where: {
        workerId,
        status: { in: [TradeOfferStatus.OPEN, TradeOfferStatus.MATCHED] },
      },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { matches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return offers.map((offer) => this.formatOfferResponse(offer));
  }

  /**
   * Get matching offers for a specific shift
   */
  async getMatchingOffers(shiftId: string, workerId: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { restaurant: true },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    // Find offers where:
    // 1. The offerer wants a shift on the same day/time slot as this shift
    // 2. This worker is qualified for the offered position
    // 3. The offerer is qualified for this shift's position

    const shiftDay = new Date(shift.startTime).getDay();
    const shiftHour = new Date(shift.startTime).getHours();

    const offers = await this.prisma.tradeOffer.findMany({
      where: {
        status: TradeOfferStatus.OPEN,
        workerId: { not: workerId },
        expiresAt: { gt: new Date() },
      },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { matches: true },
        },
      },
    });

    // Filter by preference matching
    const matchingOffers = offers.filter((offer) => {
      const prefs = offer.preferences as any;

      // Check day of week preference
      if (prefs.daysOfWeek?.length && !prefs.daysOfWeek.includes(shiftDay)) {
        if (!prefs.flexibleDates) return false;
      }

      // Check position compatibility
      if (prefs.positions?.length && !prefs.positions.includes(shift.position)) {
        return false;
      }

      return true;
    });

    return matchingOffers.map((offer) => this.formatOfferResponse(offer));
  }

  /**
   * Get a single offer
   */
  async getOffer(offerId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { matches: true },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Trade offer not found');
    }

    return this.formatOfferResponse(offer);
  }

  /**
   * Get a single trade match
   */
  async getTradeMatch(matchId: string) {
    const match = await this.prisma.tradeMatch.findUnique({
      where: { id: matchId },
      include: {
        offer: true,
        offerer: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        acceptor: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        offererShift: {
          include: { restaurant: { select: { id: true, name: true } } },
        },
        acceptorShift: {
          include: { restaurant: { select: { id: true, name: true } } },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Trade match not found');
    }

    return this.formatMatchResponse(match);
  }

  /**
   * Execute the trade (swap the shifts)
   */
  private async executeTrade(tradeId: string) {
    const match = await this.prisma.tradeMatch.findUnique({
      where: { id: tradeId },
      include: {
        offer: true,
        offererShift: true,
        acceptorShift: true,
        offerer: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        acceptor: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Trade match not found');
    }

    await this.prisma.$transaction([
      // Swap the shift assignments
      this.prisma.shift.update({
        where: { id: match.offererShiftId },
        data: { assignedToId: match.acceptorId },
      }),
      this.prisma.shift.update({
        where: { id: match.acceptorShiftId },
        data: { assignedToId: match.offererId },
      }),
      // Update match status
      this.prisma.tradeMatch.update({
        where: { id: tradeId },
        data: {
          status: TradeMatchStatus.COMPLETED,
          completedAt: new Date(),
          respondedAt: new Date(),
        },
      }),
      // Update offer status
      this.prisma.tradeOffer.update({
        where: { id: match.offerId },
        data: {
          status: TradeOfferStatus.TRADED,
        },
      }),
    ]);

    this.logger.log(`Trade ${tradeId} completed successfully`);

    // Notify both parties
    await Promise.all([
      this.notificationService.send(
        match.offerer.user.id,
        NotificationType.SWAP_APPROVED,
        {
          swapId: tradeId,
          workerName: `${match.acceptor.user.firstName} ${match.acceptor.user.lastName}`,
        },
      ),
      this.notificationService.send(
        match.acceptor.user.id,
        NotificationType.SWAP_APPROVED,
        {
          swapId: tradeId,
          workerName: `${match.offerer.user.firstName} ${match.offerer.user.lastName}`,
        },
      ),
    ]);

    // Invalidate caches
    await Promise.all([
      this.redis.invalidateShiftCache(match.offererShift.restaurantId),
      this.redis.invalidateShiftCache(match.acceptorShift.restaurantId),
    ]);

    return this.getTradeMatch(tradeId);
  }

  /**
   * Manager approves a trade
   */
  async managerApproveTrade(tradeId: string, approvedById: string) {
    const match = await this.prisma.tradeMatch.findUnique({
      where: { id: tradeId },
    });

    if (!match) {
      throw new NotFoundException('Trade match not found');
    }

    if (match.status !== TradeMatchStatus.ACCEPTED) {
      throw new BadRequestException('Trade is not awaiting manager approval');
    }

    await this.prisma.tradeMatch.update({
      where: { id: tradeId },
      data: {
        managerApproval: {
          required: true,
          approved: true,
          approvedById,
          approvedAt: new Date(),
        },
      },
    });

    return this.executeTrade(tradeId);
  }

  /**
   * Manager rejects a trade
   */
  async managerRejectTrade(tradeId: string, rejectedById: string, reason?: string) {
    const match = await this.prisma.tradeMatch.findUnique({
      where: { id: tradeId },
      include: {
        offer: true,
        offerer: {
          include: { user: { select: { id: true } } },
        },
        acceptor: {
          include: { user: { select: { id: true } } },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Trade match not found');
    }

    await this.prisma.$transaction([
      this.prisma.tradeMatch.update({
        where: { id: tradeId },
        data: {
          status: TradeMatchStatus.REJECTED,
          rejectionReason: reason || 'Rejected by manager',
          managerApproval: {
            required: true,
            approved: false,
            approvedById: rejectedById,
            approvedAt: new Date(),
            rejectionReason: reason,
          },
        },
      }),
      this.prisma.tradeOffer.update({
        where: { id: match.offerId },
        data: {
          status: TradeOfferStatus.OPEN,
        },
      }),
    ]);

    // Notify both parties
    await Promise.all([
      this.notificationService.send(
        match.offerer.user.id,
        NotificationType.SWAP_REJECTED,
        { swapId: tradeId, reason: reason || 'Rejected by manager' },
      ),
      this.notificationService.send(
        match.acceptor.user.id,
        NotificationType.SWAP_REJECTED,
        { swapId: tradeId, reason: reason || 'Rejected by manager' },
      ),
    ]);

    return this.getTradeMatch(tradeId);
  }

  /**
   * Increment view counts for offers
   */
  private async incrementViewCounts(offerIds: string[]) {
    if (offerIds.length === 0) return;

    await this.prisma.tradeOffer.updateMany({
      where: { id: { in: offerIds } },
      data: { viewCount: { increment: 1 } },
    });
  }

  /**
   * Format offer response
   */
  private formatOfferResponse(offer: any) {
    return {
      id: offer.id,
      workerId: offer.workerId,
      shiftId: offer.shiftId,
      restaurantId: offer.restaurantId,
      status: offer.status,
      preferences: offer.preferences,
      expiresAt: offer.expiresAt,
      viewCount: offer.viewCount,
      interestCount: offer.interestCount,
      matchCount: offer._count?.matches || 0,
      worker: {
        id: offer.worker.id,
        firstName: offer.worker.user.firstName,
        lastName: offer.worker.user.lastName,
        avatarUrl: offer.worker.user.avatarUrl,
        reliabilityScore: Number(offer.worker.reliabilityScore),
      },
      shift: {
        id: offer.shift.id,
        position: offer.shift.position,
        startTime: offer.shift.startTime,
        endTime: offer.shift.endTime,
        restaurantId: offer.shift.restaurantId,
        restaurantName: offer.shift.restaurant.name,
      },
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }

  /**
   * Format match response
   */
  private formatMatchResponse(match: any) {
    const approval = match.managerApproval as any;

    return {
      id: match.id,
      offerId: match.offerId,
      status: match.status,
      compatibilityScore: match.compatibilityScore,
      message: match.message,
      rejectionReason: match.rejectionReason,
      requiresManagerApproval: approval?.required || false,
      managerApproved: approval?.approved,
      offerer: {
        id: match.offerer.id,
        firstName: match.offerer.user.firstName,
        lastName: match.offerer.user.lastName,
        avatarUrl: match.offerer.user.avatarUrl,
        reliabilityScore: Number(match.offerer.reliabilityScore),
        shift: {
          id: match.offererShift.id,
          position: match.offererShift.position,
          startTime: match.offererShift.startTime,
          endTime: match.offererShift.endTime,
          restaurantName: match.offererShift.restaurant.name,
        },
      },
      acceptor: {
        id: match.acceptor.id,
        firstName: match.acceptor.user.firstName,
        lastName: match.acceptor.user.lastName,
        avatarUrl: match.acceptor.user.avatarUrl,
        reliabilityScore: Number(match.acceptor.reliabilityScore),
        shift: {
          id: match.acceptorShift.id,
          position: match.acceptorShift.position,
          startTime: match.acceptorShift.startTime,
          endTime: match.acceptorShift.endTime,
          restaurantName: match.acceptorShift.restaurant.name,
        },
      },
      proposedAt: match.proposedAt || match.createdAt,
      respondedAt: match.respondedAt,
      completedAt: match.completedAt,
      expiresAt: match.expiresAt,
    };
  }
}
