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
import { TradeMarketplaceService } from './trade-marketplace.service';
import {
  TradeNegotiationStatus,
  NegotiationMessageType,
  NegotiationTerms,
  NegotiationMessage,
} from '../entities/trade-negotiation.entity';
import { NotificationType } from '@restaurant-scheduler/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Trade Negotiation Service
 *
 * Manages multi-step negotiation sessions between workers:
 * - Start negotiation sessions between two offers
 * - Handle counter-offers and term modifications
 * - Track message history
 * - Finalize or cancel negotiations
 *
 * Unlike simple accept/reject trades, negotiations allow:
 * 1. Back-and-forth discussions
 * 2. Term modifications (different shifts, compensation)
 * 3. Conditional agreements
 */
@Injectable()
export class TradeNegotiationService {
  private readonly logger = new Logger(TradeNegotiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly marketplaceService: TradeMarketplaceService,
  ) {}

  /**
   * Start a negotiation between two offers
   */
  async startNegotiation(
    offer1Id: string,
    offer2Id: string,
    initiatorId: string,
    initialMessage?: string,
    expiresInHours: number = 24,
  ) {
    // Validate both offers exist and are open
    const [offer1, offer2] = await Promise.all([
      this.prisma.tradeOffer.findUnique({
        where: { id: offer1Id },
        include: {
          shift: { include: { restaurant: true } },
          worker: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.tradeOffer.findUnique({
        where: { id: offer2Id },
        include: {
          shift: { include: { restaurant: true } },
          worker: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
    ]);

    if (!offer1 || !offer2) {
      throw new NotFoundException('One or both offers not found');
    }

    if (offer1.status !== 'OPEN' || offer2.status !== 'OPEN') {
      throw new BadRequestException('Both offers must be open to start negotiation');
    }

    // Verify initiator owns one of the offers
    if (offer1.workerId !== initiatorId && offer2.workerId !== initiatorId) {
      throw new ForbiddenException('You must own one of the offers to start a negotiation');
    }

    // Check for existing active negotiation between these offers
    const existingNegotiation = await this.prisma.tradeNegotiation.findFirst({
      where: {
        OR: [
          { offer1Id, offer2Id },
          { offer1Id: offer2Id, offer2Id: offer1Id },
        ],
        status: TradeNegotiationStatus.ACTIVE,
      },
    });

    if (existingNegotiation) {
      throw new BadRequestException('An active negotiation already exists between these offers');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const participant1Id = offer1.workerId;
    const participant2Id = offer2.workerId;

    // Initial terms based on the offers
    const initialTerms: NegotiationTerms = {
      shift1Id: offer1.shiftId,
      shift2Id: offer2.shiftId,
      proposedById: initiatorId,
      proposedAt: new Date(),
    };

    // Create initial message
    const messages: NegotiationMessage[] = [];

    if (initialMessage) {
      messages.push({
        id: uuidv4(),
        type: NegotiationMessageType.PROPOSAL,
        senderId: initiatorId,
        content: initialMessage,
        terms: initialTerms,
        sentAt: new Date(),
        read: false,
      });
    } else {
      messages.push({
        id: uuidv4(),
        type: NegotiationMessageType.SYSTEM,
        content: 'Negotiation started',
        sentAt: new Date(),
        read: true,
      });
    }

    // Determine who needs to respond
    const pendingResponseFrom = initiatorId === participant1Id ? participant2Id : participant1Id;

    const negotiation = await this.prisma.tradeNegotiation.create({
      data: {
        offer1Id,
        offer2Id,
        participant1Id,
        participant2Id,
        status: TradeNegotiationStatus.ACTIVE,
        currentTerms: initialTerms as any,
        messages: messages as any,
        pendingResponseFrom,
        participant1LastActiveAt: initiatorId === participant1Id ? new Date() : null,
        participant2LastActiveAt: initiatorId === participant2Id ? new Date() : null,
        expiresAt,
      },
    });

    this.logger.log(`Negotiation started: ${negotiation.id}`);

    // Notify the other party
    const otherParty = initiatorId === participant1Id ? offer2.worker : offer1.worker;
    const initiator = initiatorId === participant1Id ? offer1.worker : offer2.worker;

    await this.notificationService.send(
      otherParty.user.id,
      NotificationType.SWAP_REQUEST,
      {
        swapId: negotiation.id,
        workerName: `${initiator.user.firstName} ${initiator.user.lastName}`,
        shiftDate: new Date(offer1.shift.startTime).toLocaleDateString(),
      },
    );

    return this.formatNegotiationResponse(negotiation, await this.loadNegotiationDetails(negotiation.id));
  }

  /**
   * Send a counter-offer with modified terms
   */
  async counterOffer(
    negotiationId: string,
    workerId: string,
    newTerms: Partial<NegotiationTerms>,
    message: string,
  ) {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    if (negotiation.status !== TradeNegotiationStatus.ACTIVE) {
      throw new BadRequestException('This negotiation is no longer active');
    }

    // Verify worker is a participant
    if (negotiation.participant1Id !== workerId && negotiation.participant2Id !== workerId) {
      throw new ForbiddenException('You are not a participant in this negotiation');
    }

    // Check if it's their turn
    if (negotiation.pendingResponseFrom && negotiation.pendingResponseFrom !== workerId) {
      throw new BadRequestException('It is not your turn to respond');
    }

    const currentTerms = negotiation.currentTerms as unknown as NegotiationTerms;
    const messages = negotiation.messages as unknown as NegotiationMessage[];

    // Validate new shift IDs if provided
    if (newTerms.shift1Id) {
      const shift1 = await this.prisma.shift.findUnique({
        where: { id: newTerms.shift1Id },
      });
      if (!shift1) {
        throw new BadRequestException('Shift 1 not found');
      }
    }

    if (newTerms.shift2Id) {
      const shift2 = await this.prisma.shift.findUnique({
        where: { id: newTerms.shift2Id },
      });
      if (!shift2) {
        throw new BadRequestException('Shift 2 not found');
      }
    }

    // Merge new terms with current terms
    const updatedTerms: NegotiationTerms = {
      ...currentTerms,
      ...newTerms,
      proposedById: workerId,
      proposedAt: new Date(),
    };

    // Add counter-offer message
    messages.push({
      id: uuidv4(),
      type: NegotiationMessageType.COUNTER_OFFER,
      senderId: workerId,
      content: message,
      terms: newTerms,
      sentAt: new Date(),
      read: false,
    });

    // Switch whose turn it is
    const pendingResponseFrom = workerId === negotiation.participant1Id
      ? negotiation.participant2Id
      : negotiation.participant1Id;

    // Extend expiration (each counter resets the clock)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.prisma.tradeNegotiation.update({
      where: { id: negotiationId },
      data: {
        currentTerms: updatedTerms as any,
        messages: messages as any,
        pendingResponseFrom,
        expiresAt,
        ...(workerId === negotiation.participant1Id
          ? { participant1LastActiveAt: new Date() }
          : { participant2LastActiveAt: new Date() }),
      },
    });

    this.logger.log(`Counter-offer sent in negotiation ${negotiationId}`);

    // Notify the other party
    const details = await this.loadNegotiationDetails(negotiationId);
    const otherParty = workerId === negotiation.participant1Id
      ? details.participant2
      : details.participant1;
    const sender = workerId === negotiation.participant1Id
      ? details.participant1
      : details.participant2;

    if (otherParty && sender) {
      await this.notificationService.send(
        otherParty.userId,
        NotificationType.SWAP_REQUEST,
        {
          swapId: negotiationId,
          workerName: `${sender.firstName} ${sender.lastName}`,
          shiftDate: 'Counter-offer received',
        },
      );
    }

    return this.getNegotiation(negotiationId, workerId);
  }

  /**
   * Accept current terms and finalize negotiation
   */
  async finalizeNegotiation(negotiationId: string, workerId: string) {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    if (negotiation.status !== TradeNegotiationStatus.ACTIVE) {
      throw new BadRequestException('This negotiation is no longer active');
    }

    // Verify worker is a participant
    if (negotiation.participant1Id !== workerId && negotiation.participant2Id !== workerId) {
      throw new ForbiddenException('You are not a participant in this negotiation');
    }

    // The person who sent the last counter-offer cannot accept their own offer
    const currentTerms = negotiation.currentTerms as unknown as NegotiationTerms;
    if (currentTerms.proposedById === workerId) {
      throw new BadRequestException('You cannot accept your own proposal. Wait for the other party to respond.');
    }

    const messages = negotiation.messages as unknown as NegotiationMessage[];

    // Add acceptance message
    messages.push({
      id: uuidv4(),
      type: NegotiationMessageType.ACCEPTANCE,
      senderId: workerId,
      content: 'Terms accepted! Trade will be executed.',
      sentAt: new Date(),
      read: false,
    });

    // Update negotiation status
    await this.prisma.tradeNegotiation.update({
      where: { id: negotiationId },
      data: {
        status: TradeNegotiationStatus.AGREED,
        messages: messages as any,
        pendingResponseFrom: null,
        ...(workerId === negotiation.participant1Id
          ? { participant1LastActiveAt: new Date() }
          : { participant2LastActiveAt: new Date() }),
      },
    });

    this.logger.log(`Negotiation ${negotiationId} finalized - executing trade`);

    // Execute the trade
    await this.executeTrade(currentTerms, negotiation);

    return this.getNegotiation(negotiationId, workerId);
  }

  /**
   * Cancel a negotiation
   */
  async cancelNegotiation(
    negotiationId: string,
    workerId: string,
    reason?: string,
  ) {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    if (negotiation.status !== TradeNegotiationStatus.ACTIVE) {
      throw new BadRequestException('This negotiation is no longer active');
    }

    // Verify worker is a participant
    if (negotiation.participant1Id !== workerId && negotiation.participant2Id !== workerId) {
      throw new ForbiddenException('You are not a participant in this negotiation');
    }

    const messages = negotiation.messages as unknown as NegotiationMessage[];

    // Add cancellation message
    messages.push({
      id: uuidv4(),
      type: NegotiationMessageType.SYSTEM,
      content: `Negotiation cancelled${reason ? `: ${reason}` : ''}`,
      sentAt: new Date(),
      read: false,
    });

    await this.prisma.tradeNegotiation.update({
      where: { id: negotiationId },
      data: {
        status: TradeNegotiationStatus.CANCELLED,
        messages: messages as any,
        cancelledById: workerId,
        cancellationReason: reason,
      },
    });

    this.logger.log(`Negotiation ${negotiationId} cancelled by ${workerId}`);

    // Notify the other party
    const details = await this.loadNegotiationDetails(negotiationId);
    const otherParty = workerId === negotiation.participant1Id
      ? details.participant2
      : details.participant1;

    if (otherParty) {
      await this.notificationService.send(
        otherParty.userId,
        NotificationType.SWAP_CANCELLED,
        {
          swapId: negotiationId,
          reason: reason || 'The other party cancelled the negotiation',
        },
      );
    }

    return this.getNegotiation(negotiationId, workerId);
  }

  /**
   * Get negotiation history
   */
  async getNegotiationHistory(negotiationId: string): Promise<NegotiationMessage[]> {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
      select: { messages: true },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    return (negotiation.messages as unknown as NegotiationMessage[]) || [];
  }

  /**
   * Get a single negotiation with full details
   */
  async getNegotiation(negotiationId: string, viewerId?: string) {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    const details = await this.loadNegotiationDetails(negotiationId);

    // Mark messages as read if viewer is provided
    if (viewerId && (viewerId === negotiation.participant1Id || viewerId === negotiation.participant2Id)) {
      const messages = negotiation.messages as unknown as NegotiationMessage[];
      let updated = false;

      for (const msg of messages) {
        if (!msg.read && msg.senderId && msg.senderId !== viewerId) {
          msg.read = true;
          msg.readAt = new Date();
          updated = true;
        }
      }

      if (updated) {
        await this.prisma.tradeNegotiation.update({
          where: { id: negotiationId },
          data: { messages: messages as any },
        });
      }
    }

    return this.formatNegotiationResponse(negotiation, details, viewerId);
  }

  /**
   * Get worker's active negotiations
   */
  async getMyNegotiations(
    workerId: string,
    status?: TradeNegotiationStatus[],
    pendingMyResponse?: boolean,
  ) {
    const where: any = {
      OR: [
        { participant1Id: workerId },
        { participant2Id: workerId },
      ],
    };

    if (status?.length) {
      where.status = { in: status };
    }

    if (pendingMyResponse) {
      where.pendingResponseFrom = workerId;
    }

    const negotiations = await this.prisma.tradeNegotiation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    const results = [];

    for (const neg of negotiations) {
      const details = await this.loadNegotiationDetails(neg.id);
      results.push(this.formatNegotiationResponse(neg, details, workerId));
    }

    return results;
  }

  /**
   * Send a simple message (not a counter-offer)
   */
  async sendMessage(
    negotiationId: string,
    workerId: string,
    content: string,
  ) {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    if (negotiation.status !== TradeNegotiationStatus.ACTIVE) {
      throw new BadRequestException('This negotiation is no longer active');
    }

    // Verify worker is a participant
    if (negotiation.participant1Id !== workerId && negotiation.participant2Id !== workerId) {
      throw new ForbiddenException('You are not a participant in this negotiation');
    }

    const messages = negotiation.messages as unknown as NegotiationMessage[];

    messages.push({
      id: uuidv4(),
      type: NegotiationMessageType.MESSAGE,
      senderId: workerId,
      content,
      sentAt: new Date(),
      read: false,
    });

    await this.prisma.tradeNegotiation.update({
      where: { id: negotiationId },
      data: {
        messages: messages as any,
        ...(workerId === negotiation.participant1Id
          ? { participant1LastActiveAt: new Date() }
          : { participant2LastActiveAt: new Date() }),
      },
    });

    return this.getNegotiation(negotiationId, workerId);
  }

  /**
   * Execute the trade based on negotiated terms
   */
  private async executeTrade(terms: NegotiationTerms, negotiation: any) {
    // Swap the shift assignments
    await this.prisma.$transaction([
      this.prisma.shift.update({
        where: { id: terms.shift1Id },
        data: { assignedToId: negotiation.participant2Id },
      }),
      this.prisma.shift.update({
        where: { id: terms.shift2Id },
        data: { assignedToId: negotiation.participant1Id },
      }),
    ]);

    // Close the associated offers if any
    if (negotiation.offer1Id) {
      await this.prisma.tradeOffer.update({
        where: { id: negotiation.offer1Id },
        data: { status: 'TRADED' },
      }).catch(() => {}); // Ignore if doesn't exist
    }

    if (negotiation.offer2Id) {
      await this.prisma.tradeOffer.update({
        where: { id: negotiation.offer2Id },
        data: { status: 'TRADED' },
      }).catch(() => {}); // Ignore if doesn't exist
    }

    this.logger.log(`Trade executed for negotiation ${negotiation.id}`);

    // Notify both parties
    const details = await this.loadNegotiationDetails(negotiation.id);

    if (details.participant1 && details.participant2) {
      await Promise.all([
        this.notificationService.send(
          details.participant1.userId,
          NotificationType.SWAP_APPROVED,
          {
            swapId: negotiation.id,
            workerName: `${details.participant2.firstName} ${details.participant2.lastName}`,
          },
        ),
        this.notificationService.send(
          details.participant2.userId,
          NotificationType.SWAP_APPROVED,
          {
            swapId: negotiation.id,
            workerName: `${details.participant1.firstName} ${details.participant1.lastName}`,
          },
        ),
      ]);
    }
  }

  /**
   * Load negotiation details (participants and shifts)
   */
  private async loadNegotiationDetails(negotiationId: string) {
    const negotiation = await this.prisma.tradeNegotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }

    const terms = negotiation.currentTerms as unknown as NegotiationTerms;

    const [participant1, participant2, shift1, shift2] = await Promise.all([
      this.prisma.workerProfile.findUnique({
        where: { id: negotiation.participant1Id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      }),
      this.prisma.workerProfile.findUnique({
        where: { id: negotiation.participant2Id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      }),
      this.prisma.shift.findUnique({
        where: { id: terms.shift1Id },
        include: { restaurant: { select: { id: true, name: true } } },
      }),
      this.prisma.shift.findUnique({
        where: { id: terms.shift2Id },
        include: { restaurant: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      participant1: participant1 ? {
        id: participant1.id,
        userId: participant1.user.id,
        firstName: participant1.user.firstName,
        lastName: participant1.user.lastName,
        avatarUrl: participant1.user.avatarUrl,
        reliabilityScore: Number(participant1.reliabilityScore),
      } : null,
      participant2: participant2 ? {
        id: participant2.id,
        userId: participant2.user.id,
        firstName: participant2.user.firstName,
        lastName: participant2.user.lastName,
        avatarUrl: participant2.user.avatarUrl,
        reliabilityScore: Number(participant2.reliabilityScore),
      } : null,
      shift1: shift1 ? {
        id: shift1.id,
        position: shift1.position,
        startTime: shift1.startTime,
        endTime: shift1.endTime,
        restaurantName: shift1.restaurant.name,
      } : null,
      shift2: shift2 ? {
        id: shift2.id,
        position: shift2.position,
        startTime: shift2.startTime,
        endTime: shift2.endTime,
        restaurantName: shift2.restaurant.name,
      } : null,
    };
  }

  /**
   * Format negotiation response
   */
  private formatNegotiationResponse(negotiation: any, details: any, viewerId?: string) {
    const messages = negotiation.messages as unknown as NegotiationMessage[] || [];
    const unreadCount = viewerId
      ? messages.filter((m) => !m.read && m.senderId && m.senderId !== viewerId).length
      : 0;

    return {
      id: negotiation.id,
      status: negotiation.status,
      currentTerms: negotiation.currentTerms,
      messages: messages.map((m) => ({
        id: m.id,
        type: m.type,
        senderId: m.senderId,
        content: m.content,
        terms: m.terms,
        sentAt: m.sentAt,
        read: m.read,
      })),
      participant1: details.participant1,
      participant2: details.participant2,
      shift1: details.shift1,
      shift2: details.shift2,
      pendingResponseFrom: negotiation.pendingResponseFrom,
      unreadCount,
      expiresAt: negotiation.expiresAt,
      createdAt: negotiation.createdAt,
      updatedAt: negotiation.updatedAt,
    };
  }
}
