import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { NotificationService } from '@/modules/notification/services/notification.service';
import { ReputationService } from '@/modules/network/services/reputation.service';
import { calculateDistance } from '@/common/utils/distance.util';
import { TradeOfferStatus, TradePreferences } from '../entities/trade-offer.entity';
import { NotificationType } from '@restaurant-scheduler/shared';

/**
 * Match score breakdown
 */
export interface MatchScoreBreakdown {
  /** Position match score (0-25) */
  positionScore: number;
  /** Time slot preference alignment (0-25) */
  timeSlotScore: number;
  /** Day of week preference alignment (0-20) */
  dayOfWeekScore: number;
  /** Distance/commute consideration (0-15) */
  distanceScore: number;
  /** Historical trade success (0-10) */
  historyScore: number;
  /** Reputation score bonus (0-5) */
  reputationScore: number;
  /** Total compatibility score (0-100) */
  total: number;
}

/**
 * Potential match result
 */
export interface PotentialMatch {
  /** The matching offer */
  offer: any;
  /** Worker who made the offer */
  worker: any;
  /** Shift being offered */
  shift: any;
  /** Compatibility score (0-100) */
  compatibilityScore: number;
  /** Score breakdown */
  scoreBreakdown: MatchScoreBreakdown;
  /** Why this is a good match */
  matchReasons: string[];
  /** Any potential concerns */
  concerns: string[];
}

/**
 * Trade recommendation
 */
export interface TradeRecommendation {
  /** The recommended offer */
  offer: any;
  /** Worker's shifts that could work for this trade */
  compatibleShifts: {
    shift: any;
    compatibilityScore: number;
    reasons: string[];
  }[];
  /** Overall recommendation score */
  recommendationScore: number;
  /** Reason for recommendation */
  reason: string;
}

/**
 * Trade Matcher Service
 *
 * Intelligent matching system for shift trades:
 * - Auto-finds compatible trades based on preferences
 * - Scores matches on multiple criteria
 * - Sends notifications for potential matches
 * - Provides personalized trade recommendations
 *
 * Matching Criteria:
 * 1. Position compatibility (both workers qualified)
 * 2. Time slot preferences alignment
 * 3. Distance/commute considerations
 * 4. Historical trade success with partner
 * 5. Reputation scores
 */
@Injectable()
export class TradeMatcherService {
  private readonly logger = new Logger(TradeMatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
  ) {}

  /**
   * Find potential matches for a trade offer
   *
   * Searches the marketplace for offers that could be good trades
   * based on the offer's preferences and the workers' qualifications.
   */
  async findPotentialMatches(
    offerId: string,
    limit: number = 10,
  ): Promise<PotentialMatch[]> {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Trade offer not found');
    }

    const prefs = offer.preferences as unknown as TradePreferences;

    // Find other open offers that could be matches
    const candidateOffers = await this.prisma.tradeOffer.findMany({
      where: {
        id: { not: offerId },
        status: TradeOfferStatus.OPEN,
        workerId: { not: offer.workerId },
        expiresAt: { gt: new Date() },
      },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
      },
    });

    const matches: PotentialMatch[] = [];

    for (const candidate of candidateOffers) {
      // Check basic eligibility
      const candidatePrefs = candidate.preferences as unknown as TradePreferences;

      // Both workers must be qualified for each other's shifts
      const offererQualified = offer.worker.positions.includes(candidate.shift.position);
      const candidateQualified = candidate.worker.positions.includes(offer.shift.position);

      if (!offererQualified || !candidateQualified) {
        continue;
      }

      // Calculate compatibility score
      const scoreBreakdown = await this.calculateMatchScore(
        offer,
        candidate,
        prefs,
        candidatePrefs,
      );

      // Only include matches above threshold
      if (scoreBreakdown.total < 30) {
        continue;
      }

      const matchReasons: string[] = [];
      const concerns: string[] = [];

      // Position match
      if (scoreBreakdown.positionScore > 20) {
        matchReasons.push('Perfect position match');
      } else if (scoreBreakdown.positionScore > 10) {
        matchReasons.push('Position requirements met');
      }

      // Time slot match
      if (scoreBreakdown.timeSlotScore > 20) {
        matchReasons.push('Ideal time slot match');
      } else if (scoreBreakdown.timeSlotScore > 10) {
        matchReasons.push('Time preferences align');
      }

      // Day of week match
      if (scoreBreakdown.dayOfWeekScore > 15) {
        matchReasons.push('Day preferences align well');
      }

      // Distance consideration
      if (scoreBreakdown.distanceScore < 5) {
        concerns.push('Significant commute required');
      } else if (scoreBreakdown.distanceScore > 12) {
        matchReasons.push('Convenient location');
      }

      // Reputation
      if (scoreBreakdown.reputationScore >= 4) {
        matchReasons.push('Highly rated worker');
      }

      matches.push({
        offer: candidate,
        worker: candidate.worker,
        shift: candidate.shift,
        compatibilityScore: scoreBreakdown.total,
        scoreBreakdown,
        matchReasons,
        concerns,
      });
    }

    // Sort by compatibility score
    matches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    return matches.slice(0, limit);
  }

  /**
   * Score the compatibility between two offers
   */
  async scoreMatch(
    offer1Id: string,
    offer2Id: string,
  ): Promise<MatchScoreBreakdown> {
    const [offer1, offer2] = await Promise.all([
      this.prisma.tradeOffer.findUnique({
        where: { id: offer1Id },
        include: {
          worker: { include: { restaurant: true } },
          shift: { include: { restaurant: true } },
        },
      }),
      this.prisma.tradeOffer.findUnique({
        where: { id: offer2Id },
        include: {
          worker: { include: { restaurant: true } },
          shift: { include: { restaurant: true } },
        },
      }),
    ]);

    if (!offer1 || !offer2) {
      throw new NotFoundException('One or both offers not found');
    }

    return this.calculateMatchScore(
      offer1,
      offer2,
      offer1.preferences as unknown as TradePreferences,
      offer2.preferences as unknown as TradePreferences,
    );
  }

  /**
   * Notify workers of potential matches for their offer
   */
  async notifyPotentialMatches(offerId: string): Promise<number> {
    const matches = await this.findPotentialMatches(offerId, 5);

    if (matches.length === 0) {
      return 0;
    }

    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: {
        shift: true,
        worker: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!offer) {
      return 0;
    }

    let notifiedCount = 0;

    for (const match of matches) {
      // Only notify for high-quality matches
      if (match.compatibilityScore >= 60) {
        try {
          await this.notificationService.send(
            match.worker.user.id,
            NotificationType.SHIFT_AVAILABLE,
            {
              shiftId: offer.shiftId,
              position: offer.shift.position,
              workerName: `${offer.worker.user.firstName} ${offer.worker.user.lastName}`,
              matchScore: match.compatibilityScore.toString(),
            },
          );
          notifiedCount++;
        } catch (error) {
          this.logger.error(`Failed to notify worker ${match.worker.id}: ${error.message}`);
        }
      }
    }

    this.logger.log(`Notified ${notifiedCount} workers of potential match for offer ${offerId}`);

    return notifiedCount;
  }

  /**
   * Get personalized trade recommendations for a worker
   */
  async getRecommendedTrades(
    workerId: string,
    limit: number = 10,
  ): Promise<TradeRecommendation[]> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: {
        restaurant: { select: { id: true, name: true, lat: true, lng: true } },
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    // Get worker's assigned shifts that could be traded
    const workerShifts = await this.prisma.shift.findMany({
      where: {
        assignedToId: workerId,
        startTime: { gt: new Date() },
        status: { in: ['ASSIGNED', 'PUBLISHED'] },
      },
      include: {
        restaurant: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    if (workerShifts.length === 0) {
      return [];
    }

    // Get open offers from the marketplace
    const openOffers = await this.prisma.tradeOffer.findMany({
      where: {
        status: TradeOfferStatus.OPEN,
        workerId: { not: workerId },
        expiresAt: { gt: new Date() },
      },
      include: {
        worker: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
        shift: {
          include: {
            restaurant: { select: { id: true, name: true, lat: true, lng: true } },
          },
        },
      },
    });

    const recommendations: TradeRecommendation[] = [];

    for (const offer of openOffers) {
      const prefs = offer.preferences as unknown as TradePreferences;

      // Check if worker is qualified for the offered shift
      if (!worker.positions.includes(offer.shift.position)) {
        continue;
      }

      // Find compatible shifts from worker's schedule
      const compatibleShifts: {
        shift: any;
        compatibilityScore: number;
        reasons: string[];
      }[] = [];

      for (const shift of workerShifts) {
        // Check if offerer is qualified for this shift
        if (!offer.worker.positions.includes(shift.position)) {
          continue;
        }

        // Calculate how well this shift matches the offer's preferences
        const score = this.calculateShiftPreferenceScore(shift, prefs);

        if (score >= 40) {
          const reasons: string[] = [];

          const shiftDay = new Date(shift.startTime).getDay();
          if (prefs.daysOfWeek.includes(shiftDay)) {
            reasons.push('Day matches preference');
          }

          if (prefs.positions.includes(shift.position)) {
            reasons.push('Position matches preference');
          }

          compatibleShifts.push({
            shift,
            compatibilityScore: score,
            reasons,
          });
        }
      }

      if (compatibleShifts.length === 0) {
        continue;
      }

      // Sort compatible shifts by score
      compatibleShifts.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

      // Calculate overall recommendation score
      const bestShiftScore = compatibleShifts[0].compatibilityScore;
      const offererReputation = Number(offer.worker.reliabilityScore) || 3.0;
      const recommendationScore = Math.round(
        (bestShiftScore * 0.7) + (offererReputation * 6),
      );

      // Generate reason
      let reason = '';
      if (bestShiftScore >= 80) {
        reason = 'Excellent match for your schedule and preferences';
      } else if (bestShiftScore >= 60) {
        reason = 'Good match - this trade aligns with their preferences';
      } else {
        reason = 'Potential match - you have compatible shifts';
      }

      recommendations.push({
        offer,
        compatibleShifts: compatibleShifts.slice(0, 3), // Top 3 compatible shifts
        recommendationScore,
        reason,
      });
    }

    // Sort by recommendation score
    recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);

    return recommendations.slice(0, limit);
  }

  /**
   * Calculate match score between two offers
   */
  private async calculateMatchScore(
    offer1: any,
    offer2: any,
    prefs1: TradePreferences,
    prefs2: TradePreferences,
  ): Promise<MatchScoreBreakdown> {
    const breakdown: MatchScoreBreakdown = {
      positionScore: 0,
      timeSlotScore: 0,
      dayOfWeekScore: 0,
      distanceScore: 0,
      historyScore: 0,
      reputationScore: 0,
      total: 0,
    };

    // Position score (0-25)
    // Does each offer's shift match the other's preferences?
    const offer1PositionMatch = prefs2.positions.includes(offer1.shift.position);
    const offer2PositionMatch = prefs1.positions.includes(offer2.shift.position);

    if (offer1PositionMatch && offer2PositionMatch) {
      breakdown.positionScore = 25;
    } else if (offer1PositionMatch || offer2PositionMatch) {
      breakdown.positionScore = 12;
    }

    // Time slot score (0-25)
    const offer1Time = new Date(offer1.shift.startTime);
    const offer2Time = new Date(offer2.shift.startTime);

    // Check if time slots align with preferences
    let timeScore1 = 0;
    let timeScore2 = 0;

    for (const slot of prefs1.timeSlots) {
      if (this.timeMatchesSlot(offer2Time, slot)) {
        timeScore1 = 12.5;
        break;
      }
    }

    for (const slot of prefs2.timeSlots) {
      if (this.timeMatchesSlot(offer1Time, slot)) {
        timeScore2 = 12.5;
        break;
      }
    }

    breakdown.timeSlotScore = Math.round(timeScore1 + timeScore2);

    // Day of week score (0-20)
    const offer1Day = offer1Time.getDay();
    const offer2Day = offer2Time.getDay();

    const day1Match = prefs2.daysOfWeek.includes(offer1Day) || prefs2.flexibleDates;
    const day2Match = prefs1.daysOfWeek.includes(offer2Day) || prefs1.flexibleDates;

    if (day1Match && day2Match) {
      breakdown.dayOfWeekScore = 20;
    } else if (day1Match || day2Match) {
      breakdown.dayOfWeekScore = 10;
    }

    // Distance score (0-15)
    if (offer1.shift.restaurant && offer2.shift.restaurant) {
      const distance1 = calculateDistance(
        Number(offer1.worker.restaurant.lat),
        Number(offer1.worker.restaurant.lng),
        Number(offer2.shift.restaurant.lat),
        Number(offer2.shift.restaurant.lng),
      );

      const distance2 = calculateDistance(
        Number(offer2.worker.restaurant.lat),
        Number(offer2.worker.restaurant.lng),
        Number(offer1.shift.restaurant.lat),
        Number(offer1.shift.restaurant.lng),
      );

      const maxDistance1 = prefs1.maxDistanceMiles || 25;
      const maxDistance2 = prefs2.maxDistanceMiles || 25;

      const distanceScore1 = distance1 <= maxDistance1 ? Math.max(0, 7.5 - (distance1 / maxDistance1) * 7.5) : 0;
      const distanceScore2 = distance2 <= maxDistance2 ? Math.max(0, 7.5 - (distance2 / maxDistance2) * 7.5) : 0;

      breakdown.distanceScore = Math.round(distanceScore1 + distanceScore2);
    }

    // Historical trade success (0-10)
    const tradeHistory = await this.getTradeHistory(offer1.workerId, offer2.workerId);
    if (tradeHistory.successCount > 0) {
      const successRate = tradeHistory.successCount / (tradeHistory.successCount + tradeHistory.failureCount);
      breakdown.historyScore = Math.round(successRate * 10);
    } else {
      breakdown.historyScore = 5; // Neutral score for no history
    }

    // Reputation score (0-5)
    const rep1 = Number(offer1.worker.reliabilityScore) || 3.0;
    const rep2 = Number(offer2.worker.reliabilityScore) || 3.0;
    const avgRep = (rep1 + rep2) / 2;
    breakdown.reputationScore = Math.round(avgRep);

    // Calculate total
    breakdown.total = Math.min(100, Math.round(
      breakdown.positionScore +
      breakdown.timeSlotScore +
      breakdown.dayOfWeekScore +
      breakdown.distanceScore +
      breakdown.historyScore +
      breakdown.reputationScore
    ));

    return breakdown;
  }

  /**
   * Calculate how well a shift matches trade preferences
   */
  private calculateShiftPreferenceScore(
    shift: any,
    prefs: TradePreferences,
  ): number {
    let score = 0;

    const shiftTime = new Date(shift.startTime);
    const shiftDay = shiftTime.getDay();

    // Position match (40 points)
    if (prefs.positions.includes(shift.position)) {
      score += 40;
    } else if (prefs.positions.length === 0) {
      score += 20; // No position preference
    }

    // Day of week match (30 points)
    if (prefs.daysOfWeek.includes(shiftDay)) {
      score += 30;
    } else if (prefs.flexibleDates) {
      score += 15;
    }

    // Time slot match (30 points)
    for (const slot of prefs.timeSlots) {
      if (this.timeMatchesSlot(shiftTime, slot)) {
        score += 30;
        break;
      }
    }

    // If no time slots specified, give partial credit
    if (prefs.timeSlots.length === 0) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Check if a time matches a slot preference
   */
  private timeMatchesSlot(time: Date, slot: any): boolean {
    if (!slot.startTime && !slot.endTime) {
      return true; // No specific time preference
    }

    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    if (slot.startTime && timeStr < slot.startTime) {
      return false;
    }

    if (slot.endTime && timeStr > slot.endTime) {
      return false;
    }

    return true;
  }

  /**
   * Get trade history between two workers
   */
  private async getTradeHistory(
    worker1Id: string,
    worker2Id: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    // Check cache first
    const cacheKey = `trade-history:${[worker1Id, worker2Id].sort().join(':')}`;
    const cached = await this.redis.getJson<{ successCount: number; failureCount: number }>(cacheKey);

    if (cached) {
      return cached;
    }

    // Count successful and failed trades
    const [successCount, failureCount] = await Promise.all([
      this.prisma.tradeMatch.count({
        where: {
          OR: [
            { offererId: worker1Id, acceptorId: worker2Id },
            { offererId: worker2Id, acceptorId: worker1Id },
          ],
          status: 'COMPLETED',
        },
      }),
      this.prisma.tradeMatch.count({
        where: {
          OR: [
            { offererId: worker1Id, acceptorId: worker2Id },
            { offererId: worker2Id, acceptorId: worker1Id },
          ],
          status: { in: ['REJECTED', 'CANCELLED', 'EXPIRED'] },
        },
      }),
    ]);

    const result = { successCount, failureCount };

    // Cache for 1 hour
    await this.redis.setJson(cacheKey, result, 3600);

    return result;
  }

  /**
   * Find mutual matches (where both sides want each other's shifts)
   */
  async findMutualMatches(offerId: string): Promise<PotentialMatch[]> {
    const potentialMatches = await this.findPotentialMatches(offerId, 50);

    // Filter to only mutual matches (where the other offer also matches this one)
    const mutualMatches: PotentialMatch[] = [];

    for (const match of potentialMatches) {
      const reverseMatches = await this.findPotentialMatches(match.offer.id, 50);

      const isMutual = reverseMatches.some((rm) => rm.offer.id === offerId);

      if (isMutual) {
        mutualMatches.push(match);
      }
    }

    return mutualMatches.slice(0, 10);
  }
}
