import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';

/**
 * Reputation calculation weights
 */
export interface ReputationWeights {
  /** Weight for completed shifts (base score) */
  completedShiftWeight: number;
  /** Weight for on-time check-ins */
  reliabilityWeight: number;
  /** Penalty per no-show incident */
  noShowPenalty: number;
  /** Decay period for no-show penalties in days */
  noShowDecayDays: number;
  /** Weight for manager ratings */
  ratingWeight: number;
  /** Recency decay factor (how much recent shifts matter more) */
  recencyDecayFactor: number;
}

/**
 * Default reputation weights
 */
export const DEFAULT_REPUTATION_WEIGHTS: ReputationWeights = {
  completedShiftWeight: 10, // Points per completed shift (decayed by recency)
  reliabilityWeight: 50, // Bonus for reliability (on-time check-ins)
  noShowPenalty: 25, // Points lost per no-show
  noShowDecayDays: 90, // No-show penalty decays over 90 days
  ratingWeight: 100, // Manager rating contribution (1-5 * 100 = up to 500)
  recencyDecayFactor: 0.95, // 5% decay per week for older shifts
};

/**
 * Network reputation summary
 */
export interface NetworkReputation {
  /** Overall network reputation score (0-500 scale, like 5-star rating * 100) */
  score: number;
  /** Normalized score as 1-5 rating */
  rating: number;
  /** Total shifts completed across network */
  totalShifts: number;
  /** Total hours worked across network */
  totalHours: number;
  /** Reliability percentage (on-time check-ins) */
  reliabilityPercent: number;
  /** Number of no-shows across network */
  noShowCount: number;
  /** Average manager rating across network */
  averageRating: number;
  /** Number of restaurants worked at */
  restaurantCount: number;
  /** Tier based on reputation (BRONZE, SILVER, GOLD, PLATINUM) */
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
}

/**
 * Per-restaurant reputation breakdown
 */
export interface RestaurantReputation {
  restaurantId: string;
  restaurantName: string;
  shiftsCompleted: number;
  hoursWorked: number;
  averageRating: number;
  ratingCount: number;
  noShowCount: number;
  lateCount: number;
  reliabilityScore: number;
  lastShiftAt: Date | null;
}

/**
 * Shift rating data for reputation update
 */
export interface ShiftRatingData {
  rating?: number; // 1-5 manager rating
  wasLate?: boolean;
  minutesLate?: number;
  notes?: string;
}

/**
 * Reputation Service
 *
 * Manages network-wide reputation tracking for workers.
 * Aggregates reputation data across all restaurants in a network,
 * enabling trust-based shift assignment for cross-restaurant work.
 *
 * Reputation factors:
 * - Base score from completed shifts (weighted by recency)
 * - Reliability bonus (on-time check-ins)
 * - No-show penalty (-25 points per incident, decays over 90 days)
 * - Manager ratings (1-5 stars after shifts)
 */
@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);
  private weights: ReputationWeights = DEFAULT_REPUTATION_WEIGHTS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Update reputation calculation weights
   */
  setWeights(weights: Partial<ReputationWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Calculate network-wide reputation for a worker
   *
   * Aggregates reputation across all restaurants the worker has worked at
   * within the network.
   *
   * @param workerId - Worker profile ID
   * @returns Network reputation summary
   */
  async calculateNetworkReputation(workerId: string): Promise<NetworkReputation> {
    // Get the worker profile to find their user ID
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      select: { userId: true, restaurantId: true },
    });

    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found');
    }

    // Get all worker profiles for this user across all restaurants
    const allProfiles = await this.prisma.workerProfile.findMany({
      where: { userId: workerProfile.userId },
      include: {
        restaurant: {
          select: { id: true, name: true, networkId: true },
        },
      },
    });

    // Aggregate stats across all profiles
    let totalShifts = 0;
    let totalNoShows = 0;
    let totalLateCount = 0;
    let totalRatingSum = 0;
    let totalRatingCount = 0;
    let totalHours = 0;

    const restaurantSet = new Set<string>();

    for (const profile of allProfiles) {
      totalShifts += profile.shiftsCompleted;
      totalNoShows += profile.noShowCount;
      totalLateCount += profile.lateCount;
      totalRatingSum += Number(profile.averageRating) * profile.ratingCount;
      totalRatingCount += profile.ratingCount;
      restaurantSet.add(profile.restaurantId);
    }

    // Calculate total hours from completed shifts
    const profileIds = allProfiles.map((p) => p.id);
    const completedShifts = await this.prisma.shift.findMany({
      where: {
        assignedToId: { in: profileIds },
        status: 'COMPLETED',
      },
      select: {
        startTime: true,
        endTime: true,
        breakMinutes: true,
      },
    });

    for (const shift of completedShifts) {
      const hours =
        (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) /
          (1000 * 60 * 60) -
        shift.breakMinutes / 60;
      totalHours += hours;
    }

    // Calculate aggregated metrics
    const averageRating = totalRatingCount > 0 ? totalRatingSum / totalRatingCount : 3.0;
    const reliabilityPercent =
      totalShifts > 0
        ? Math.round(((totalShifts - totalLateCount) / totalShifts) * 100)
        : 100;

    // Calculate reputation score
    const score = this.calculateReputationScore({
      totalShifts,
      noShowCount: totalNoShows,
      lateCount: totalLateCount,
      averageRating,
      reliabilityPercent,
    });

    // Determine tier
    const tier = this.determineTier(score);

    // Cache the result
    await this.redis.setJson(`reputation:${workerId}`, {
      score,
      rating: score / 100,
      totalShifts,
      totalHours: Math.round(totalHours * 10) / 10,
      reliabilityPercent,
      noShowCount: totalNoShows,
      averageRating: Math.round(averageRating * 100) / 100,
      restaurantCount: restaurantSet.size,
      tier,
      calculatedAt: new Date().toISOString(),
    }, 300); // Cache for 5 minutes

    return {
      score,
      rating: score / 100,
      totalShifts,
      totalHours: Math.round(totalHours * 10) / 10,
      reliabilityPercent,
      noShowCount: totalNoShows,
      averageRating: Math.round(averageRating * 100) / 100,
      restaurantCount: restaurantSet.size,
      tier,
    };
  }

  /**
   * Update reputation after shift completion
   *
   * @param workerId - Worker profile ID
   * @param shiftId - Completed shift ID
   * @param ratingData - Rating and performance data
   */
  async updateReputationAfterShift(
    workerId: string,
    shiftId: string,
    ratingData: ShiftRatingData,
  ): Promise<void> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        status: true,
        restaurantId: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    // Calculate new stats
    const updates: any = {
      lastShiftAt: new Date(),
    };

    if (shift.status === 'COMPLETED') {
      updates.shiftsCompleted = { increment: 1 };
    }

    if (shift.status === 'NO_SHOW') {
      updates.noShowCount = { increment: 1 };
    }

    if (ratingData.wasLate) {
      updates.lateCount = { increment: 1 };
    }

    if (ratingData.rating !== undefined) {
      // Calculate new running average
      const newRatingCount = worker.ratingCount + 1;
      const newAverageRating =
        (Number(worker.averageRating) * worker.ratingCount + ratingData.rating) /
        newRatingCount;

      updates.ratingCount = newRatingCount;
      updates.averageRating = newAverageRating;
    }

    // Recalculate reliability score
    const newShiftsCompleted =
      shift.status === 'COMPLETED'
        ? worker.shiftsCompleted + 1
        : worker.shiftsCompleted;
    const newNoShowCount =
      shift.status === 'NO_SHOW'
        ? worker.noShowCount + 1
        : worker.noShowCount;
    const newLateCount =
      ratingData.wasLate
        ? worker.lateCount + 1
        : worker.lateCount;
    const newAverageRating =
      ratingData.rating !== undefined
        ? (Number(worker.averageRating) * worker.ratingCount + ratingData.rating) /
          (worker.ratingCount + 1)
        : Number(worker.averageRating);

    const reliabilityScore = this.calculateReliabilityScore({
      shiftsCompleted: newShiftsCompleted,
      noShowCount: newNoShowCount,
      lateCount: newLateCount,
      averageRating: newAverageRating,
    });

    updates.reliabilityScore = reliabilityScore;

    // Update the worker profile
    await this.prisma.workerProfile.update({
      where: { id: workerId },
      data: updates,
    });

    // Invalidate cached reputation
    await this.redis.del(`reputation:${workerId}`);

    this.logger.log(
      `Updated reputation for worker ${workerId} after shift ${shiftId}`,
    );
  }

  /**
   * Update reputation after a no-show
   *
   * @param workerId - Worker profile ID
   * @param shiftId - Shift where no-show occurred
   */
  async updateReputationAfterNoShow(
    workerId: string,
    shiftId: string,
  ): Promise<void> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const newNoShowCount = worker.noShowCount + 1;

    const reliabilityScore = this.calculateReliabilityScore({
      shiftsCompleted: worker.shiftsCompleted,
      noShowCount: newNoShowCount,
      lateCount: worker.lateCount,
      averageRating: Number(worker.averageRating),
    });

    await this.prisma.workerProfile.update({
      where: { id: workerId },
      data: {
        noShowCount: newNoShowCount,
        reliabilityScore,
      },
    });

    // Record no-show event for decay tracking
    await this.recordNoShowEvent(workerId, shiftId);

    // Invalidate cache
    await this.redis.del(`reputation:${workerId}`);

    this.logger.log(
      `Updated reputation for worker ${workerId} after no-show on shift ${shiftId}`,
    );
  }

  /**
   * Get detailed stats for a worker across all network restaurants
   *
   * @param workerId - Worker profile ID
   * @returns Detailed network-wide statistics
   */
  async getWorkerNetworkStats(workerId: string): Promise<{
    reputation: NetworkReputation;
    profileCount: number;
    activeRestaurants: string[];
    recentShifts: any[];
    skillsAcrossNetwork: string[];
  }> {
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      select: { userId: true },
    });

    if (!workerProfile) {
      throw new NotFoundException('Worker not found');
    }

    // Get all profiles for this user
    const allProfiles = await this.prisma.workerProfile.findMany({
      where: { userId: workerProfile.userId },
      include: {
        restaurant: {
          select: { id: true, name: true },
        },
      },
    });

    // Get recent shifts (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const profileIds = allProfiles.map((p) => p.id);
    const recentShifts = await this.prisma.shift.findMany({
      where: {
        assignedToId: { in: profileIds },
        status: 'COMPLETED',
        endTime: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        position: true,
        startTime: true,
        endTime: true,
        restaurant: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 10,
    });

    // Collect unique positions (skills) across all profiles
    const skillsSet = new Set<string>();
    for (const profile of allProfiles) {
      for (const position of profile.positions) {
        skillsSet.add(position);
      }
    }

    // Get network reputation
    const reputation = await this.calculateNetworkReputation(workerId);

    return {
      reputation,
      profileCount: allProfiles.length,
      activeRestaurants: allProfiles
        .filter((p) => p.status === 'ACTIVE')
        .map((p) => p.restaurant.name),
      recentShifts,
      skillsAcrossNetwork: Array.from(skillsSet),
    };
  }

  /**
   * Get per-restaurant reputation breakdown
   *
   * @param workerId - Worker profile ID
   * @returns Reputation breakdown by restaurant
   */
  async getReputationBreakdown(workerId: string): Promise<RestaurantReputation[]> {
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      select: { userId: true },
    });

    if (!workerProfile) {
      throw new NotFoundException('Worker not found');
    }

    // Get all profiles for this user with restaurant info
    const allProfiles = await this.prisma.workerProfile.findMany({
      where: { userId: workerProfile.userId },
      include: {
        restaurant: {
          select: { id: true, name: true },
        },
      },
    });

    // Calculate hours per restaurant
    const breakdown: RestaurantReputation[] = [];

    for (const profile of allProfiles) {
      // Calculate hours worked at this restaurant
      const completedShifts = await this.prisma.shift.findMany({
        where: {
          assignedToId: profile.id,
          status: 'COMPLETED',
        },
        select: {
          startTime: true,
          endTime: true,
          breakMinutes: true,
        },
      });

      let hoursWorked = 0;
      for (const shift of completedShifts) {
        hoursWorked +=
          (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) /
            (1000 * 60 * 60) -
          shift.breakMinutes / 60;
      }

      breakdown.push({
        restaurantId: profile.restaurantId,
        restaurantName: profile.restaurant.name,
        shiftsCompleted: profile.shiftsCompleted,
        hoursWorked: Math.round(hoursWorked * 10) / 10,
        averageRating: Number(profile.averageRating),
        ratingCount: profile.ratingCount,
        noShowCount: profile.noShowCount,
        lateCount: profile.lateCount,
        reliabilityScore: Number(profile.reliabilityScore),
        lastShiftAt: profile.lastShiftAt,
      });
    }

    // Sort by hours worked (most active restaurants first)
    return breakdown.sort((a, b) => b.hoursWorked - a.hoursWorked);
  }

  /**
   * Calculate reputation score from metrics
   */
  private calculateReputationScore(metrics: {
    totalShifts: number;
    noShowCount: number;
    lateCount: number;
    averageRating: number;
    reliabilityPercent: number;
  }): number {
    let score = 0;

    // Base score from completed shifts (capped contribution)
    const shiftContribution = Math.min(
      metrics.totalShifts * this.weights.completedShiftWeight,
      100, // Cap at 100 points from shifts
    );
    score += shiftContribution;

    // Rating contribution (0-500 based on 1-5 rating)
    score += metrics.averageRating * this.weights.ratingWeight;

    // Reliability bonus
    if (metrics.reliabilityPercent >= 95) {
      score += this.weights.reliabilityWeight;
    } else if (metrics.reliabilityPercent >= 90) {
      score += this.weights.reliabilityWeight * 0.75;
    } else if (metrics.reliabilityPercent >= 80) {
      score += this.weights.reliabilityWeight * 0.5;
    }

    // No-show penalty (with decay)
    const effectiveNoShows = this.calculateEffectiveNoShows(metrics.noShowCount);
    score -= effectiveNoShows * this.weights.noShowPenalty;

    // Clamp to 0-500 range (equivalent to 0-5 star rating * 100)
    return Math.max(0, Math.min(500, Math.round(score)));
  }

  /**
   * Calculate reliability score (0-5 scale) for a single profile
   */
  private calculateReliabilityScore(metrics: {
    shiftsCompleted: number;
    noShowCount: number;
    lateCount: number;
    averageRating: number;
  }): number {
    if (metrics.shiftsCompleted === 0) {
      return 3.0; // Default neutral score for new workers
    }

    // Start with the average rating
    let score = metrics.averageRating;

    // Apply no-show penalty
    const noShowPenalty = (metrics.noShowCount / metrics.shiftsCompleted) * 2;
    score -= noShowPenalty;

    // Apply late penalty (less severe than no-show)
    const latePenalty = (metrics.lateCount / metrics.shiftsCompleted) * 0.5;
    score -= latePenalty;

    // Experience bonus (small boost for workers with more shifts)
    if (metrics.shiftsCompleted >= 50) {
      score += 0.2;
    } else if (metrics.shiftsCompleted >= 20) {
      score += 0.1;
    }

    // Clamp to 1-5 range
    return Math.max(1, Math.min(5, Math.round(score * 100) / 100));
  }

  /**
   * Calculate effective no-shows with decay
   */
  private calculateEffectiveNoShows(noShowCount: number): number {
    // For simplicity, we apply a decay factor
    // In production, this should query actual no-show events with timestamps
    const decayFactor = 0.7; // 30% decay assumed for aged no-shows
    return noShowCount * decayFactor;
  }

  /**
   * Record a no-show event for tracking decay
   */
  private async recordNoShowEvent(workerId: string, shiftId: string): Promise<void> {
    // Store in Redis for decay tracking
    // Key format: noshow:{workerId}:{timestamp}
    const key = `noshow:${workerId}:${Date.now()}`;
    await this.redis.set(key, shiftId, this.weights.noShowDecayDays * 24 * 60 * 60);
  }

  /**
   * Determine reputation tier based on score
   */
  private determineTier(score: number): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
    if (score >= 450) return 'PLATINUM'; // 4.5+ star equivalent
    if (score >= 400) return 'GOLD'; // 4.0+ star equivalent
    if (score >= 350) return 'SILVER'; // 3.5+ star equivalent
    return 'BRONZE';
  }

  /**
   * Check if a worker meets minimum reputation for network shifts
   *
   * @param workerId - Worker profile ID
   * @param minScore - Minimum required score (as decimal, e.g., 4.0)
   * @returns Whether worker meets the requirement
   */
  async meetsNetworkMinimum(workerId: string, minScore: number): Promise<boolean> {
    // Check cache first
    const cached = await this.redis.getJson<{ score: number }>(`reputation:${workerId}`);
    if (cached) {
      return cached.score >= minScore * 100;
    }

    // Calculate fresh
    const reputation = await this.calculateNetworkReputation(workerId);
    return reputation.rating >= minScore;
  }

  /**
   * Get workers above a reputation threshold from a list
   */
  async filterByMinimumReputation(
    workerIds: string[],
    minScore: number,
  ): Promise<string[]> {
    const qualified: string[] = [];

    for (const workerId of workerIds) {
      const meetsMin = await this.meetsNetworkMinimum(workerId, minScore);
      if (meetsMin) {
        qualified.push(workerId);
      }
    }

    return qualified;
  }
}
