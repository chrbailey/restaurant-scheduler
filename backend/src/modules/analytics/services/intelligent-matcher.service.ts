import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { calculateDistance, estimateCommuteTime } from '@/common/utils/distance.util';

/**
 * Scoring factors for worker matching
 */
export interface WorkerScoringFactors {
  positionMatch: boolean; // Required - disqualifies if false
  isAvailable: boolean; // From schedule and time-off
  performanceScore: number; // 0-100 based on historical performance at this time
  reliabilityScore: number; // 0-100 based on no-shows and lates
  distanceScore: number; // 0-100 based on distance to restaurant
  overtimeRiskScore: number; // 0-100 (higher = less overtime risk)
  preferenceScore: number; // 0-100 based on worker's preferred hours
  teamSynergyScore: number; // 0-100 based on past shifts with scheduled workers
  costEfficiencyScore: number; // 0-100 based on hourly rate vs budget
}

/**
 * Weight configuration for scoring factors
 */
export interface ScoringWeights {
  performance: number;
  reliability: number;
  distance: number;
  overtimeRisk: number;
  preference: number;
  teamSynergy: number;
  costEfficiency: number;
}

/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  performance: 0.15,
  reliability: 0.25,
  distance: 0.10,
  overtimeRisk: 0.15,
  preference: 0.10,
  teamSynergy: 0.10,
  costEfficiency: 0.15,
};

/**
 * Worker suggestion with detailed score breakdown
 */
export interface WorkerSuggestion {
  workerId: string;
  workerProfileId: string;
  workerName: string;
  avatarUrl: string | null;
  totalScore: number;
  isQualified: boolean;
  isAvailable: boolean;
  factors: WorkerScoringFactors;
  explanation: string[];
  warnings: string[];
}

/**
 * Detailed explanation for a worker suggestion
 */
export interface SuggestionExplanation {
  workerId: string;
  shiftId: string;
  totalScore: number;
  scoreBreakdown: {
    factor: string;
    rawScore: number;
    weight: number;
    weightedScore: number;
    explanation: string;
  }[];
  qualificationDetails: {
    hasPosition: boolean;
    hasCertifications: boolean;
    missingCertifications: string[];
  };
  availabilityDetails: {
    hasConflictingShift: boolean;
    conflictingShiftId?: string;
    hasTimeOff: boolean;
    timeOffId?: string;
    matchesScheduledAvailability: boolean;
  };
  performanceDetails: {
    shiftsAtThisTimeSlot: number;
    avgRatingAtThisTime: number;
    completionRateAtThisTime: number;
  };
  teamDetails: {
    scheduledCoworkers: string[];
    pastShiftsTogether: number;
    avgTeamRating: number;
  };
}

/**
 * Intelligent Matcher Service
 *
 * Provides smart worker suggestions for open shifts using a comprehensive
 * scoring system that considers multiple factors including qualifications,
 * availability, performance history, reliability, distance, overtime risk,
 * worker preferences, team synergy, and cost efficiency.
 */
@Injectable()
export class IntelligentMatcherService {
  private readonly logger = new Logger(IntelligentMatcherService.name);

  // Cache TTL in seconds
  private readonly CACHE_TTL = 300; // 5 minutes

  // Maximum distance in miles for suggestions
  private readonly MAX_DISTANCE_MILES = 50;

  // Maximum weekly hours before overtime
  private readonly OVERTIME_THRESHOLD_HOURS = 40;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get top N worker suggestions for a shift
   */
  async suggestWorkersForShift(
    shiftId: string,
    count: number = 10,
    weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  ): Promise<WorkerSuggestion[]> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: true,
        assignedTo: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift not found: ${shiftId}`);
    }

    // Check cache first
    const cacheKey = `suggestions:${shiftId}:${count}`;
    const cached = await this.redis.getJson<WorkerSuggestion[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all workers who could potentially work this shift
    const workers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId: shift.restaurantId,
        status: 'ACTIVE',
        positions: { has: shift.position },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        certifications: true,
        availability: true,
        assignedShifts: {
          where: {
            startTime: {
              gte: this.getWeekStart(shift.startTime),
              lt: this.getWeekEnd(shift.startTime),
            },
            status: { notIn: ['CANCELLED', 'DRAFT'] },
          },
        },
      },
    });

    // Get scheduled workers for this shift to calculate team synergy
    const scheduledWorkerIds = await this.getScheduledWorkersForTimeSlot(
      shift.restaurantId,
      shift.startTime,
      shift.endTime,
      shiftId,
    );

    // Calculate scores for each worker
    const suggestions: WorkerSuggestion[] = [];

    for (const worker of workers) {
      const score = await this.calculateWorkerScore(
        worker.id,
        shiftId,
        weights,
        { shift, worker, scheduledWorkerIds },
      );
      suggestions.push(score);
    }

    // Sort by total score descending, qualified and available first
    const sortedSuggestions = suggestions
      .sort((a, b) => {
        // Qualified and available workers first
        if (a.isQualified && a.isAvailable && (!b.isQualified || !b.isAvailable)) {
          return -1;
        }
        if (b.isQualified && b.isAvailable && (!a.isQualified || !a.isAvailable)) {
          return 1;
        }
        // Then by total score
        return b.totalScore - a.totalScore;
      })
      .slice(0, count);

    // Cache results
    await this.redis.setJson(cacheKey, sortedSuggestions, this.CACHE_TTL);

    return sortedSuggestions;
  }

  /**
   * Calculate comprehensive score for a worker-shift match
   */
  async calculateWorkerScore(
    workerProfileId: string,
    shiftId: string,
    weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
    context?: {
      shift?: any;
      worker?: any;
      scheduledWorkerIds?: string[];
    },
  ): Promise<WorkerSuggestion> {
    // Load data if not provided in context
    const shift = context?.shift || await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { restaurant: true },
    });

    const worker = context?.worker || await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        certifications: true,
        availability: true,
        assignedShifts: {
          where: {
            startTime: {
              gte: this.getWeekStart(shift.startTime),
              lt: this.getWeekEnd(shift.startTime),
            },
            status: { notIn: ['CANCELLED', 'DRAFT'] },
          },
        },
      },
    });

    if (!shift || !worker) {
      throw new NotFoundException('Shift or worker not found');
    }

    const scheduledWorkerIds = context?.scheduledWorkerIds ||
      await this.getScheduledWorkersForTimeSlot(
        shift.restaurantId,
        shift.startTime,
        shift.endTime,
        shiftId,
      );

    // Calculate individual factor scores
    const factors: WorkerScoringFactors = {
      positionMatch: worker.positions.includes(shift.position),
      isAvailable: await this.checkAvailability(worker, shift),
      performanceScore: await this.calculatePerformanceScore(worker.id, shift),
      reliabilityScore: this.calculateReliabilityScore(worker),
      distanceScore: await this.calculateDistanceScore(worker, shift.restaurant),
      overtimeRiskScore: this.calculateOvertimeRiskScore(worker, shift),
      preferenceScore: this.calculatePreferenceScore(worker, shift),
      teamSynergyScore: await this.calculateTeamSynergyScore(
        worker.id,
        scheduledWorkerIds,
      ),
      costEfficiencyScore: this.calculateCostEfficiencyScore(worker, shift),
    };

    // Calculate weighted total score
    const totalScore = this.calculateWeightedScore(factors, weights);

    // Generate explanations and warnings
    const { explanation, warnings } = this.generateExplanations(factors, worker, shift);

    return {
      workerId: worker.userId,
      workerProfileId: worker.id,
      workerName: `${worker.user.firstName} ${worker.user.lastName}`,
      avatarUrl: worker.user.avatarUrl,
      totalScore: Math.round(totalScore * 100) / 100,
      isQualified: factors.positionMatch,
      isAvailable: factors.isAvailable,
      factors,
      explanation,
      warnings,
    };
  }

  /**
   * Get bulk suggestions for multiple shifts
   */
  async getBulkSuggestions(
    shiftIds: string[],
    count: number = 5,
  ): Promise<Map<string, WorkerSuggestion[]>> {
    const results = new Map<string, WorkerSuggestion[]>();

    // Process in parallel with concurrency limit
    const batchSize = 5;
    for (let i = 0; i < shiftIds.length; i += batchSize) {
      const batch = shiftIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(shiftId => this.suggestWorkersForShift(shiftId, count)),
      );

      batch.forEach((shiftId, index) => {
        results.set(shiftId, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Get detailed explanation for why a worker was suggested
   */
  async explainSuggestion(
    workerProfileId: string,
    shiftId: string,
  ): Promise<SuggestionExplanation> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { restaurant: true },
    });

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: true,
        certifications: true,
        availability: true,
        restaurant: true,
      },
    });

    if (!shift || !worker) {
      throw new NotFoundException('Shift or worker not found');
    }

    // Get score with full context
    const suggestion = await this.calculateWorkerScore(workerProfileId, shiftId);
    const weights = DEFAULT_SCORING_WEIGHTS;

    // Build detailed score breakdown
    const scoreBreakdown = [
      {
        factor: 'Performance',
        rawScore: suggestion.factors.performanceScore,
        weight: weights.performance,
        weightedScore: suggestion.factors.performanceScore * weights.performance,
        explanation: await this.getPerformanceExplanation(workerProfileId, shift),
      },
      {
        factor: 'Reliability',
        rawScore: suggestion.factors.reliabilityScore,
        weight: weights.reliability,
        weightedScore: suggestion.factors.reliabilityScore * weights.reliability,
        explanation: this.getReliabilityExplanation(worker),
      },
      {
        factor: 'Distance',
        rawScore: suggestion.factors.distanceScore,
        weight: weights.distance,
        weightedScore: suggestion.factors.distanceScore * weights.distance,
        explanation: await this.getDistanceExplanation(worker, shift.restaurant),
      },
      {
        factor: 'Overtime Risk',
        rawScore: suggestion.factors.overtimeRiskScore,
        weight: weights.overtimeRisk,
        weightedScore: suggestion.factors.overtimeRiskScore * weights.overtimeRisk,
        explanation: await this.getOvertimeExplanation(worker, shift),
      },
      {
        factor: 'Preference Match',
        rawScore: suggestion.factors.preferenceScore,
        weight: weights.preference,
        weightedScore: suggestion.factors.preferenceScore * weights.preference,
        explanation: this.getPreferenceExplanation(worker, shift),
      },
      {
        factor: 'Team Synergy',
        rawScore: suggestion.factors.teamSynergyScore,
        weight: weights.teamSynergy,
        weightedScore: suggestion.factors.teamSynergyScore * weights.teamSynergy,
        explanation: await this.getTeamSynergyExplanation(workerProfileId, shiftId),
      },
      {
        factor: 'Cost Efficiency',
        rawScore: suggestion.factors.costEfficiencyScore,
        weight: weights.costEfficiency,
        weightedScore: suggestion.factors.costEfficiencyScore * weights.costEfficiency,
        explanation: this.getCostEfficiencyExplanation(worker, shift),
      },
    ];

    // Get qualification details
    const requiredCertifications = this.getRequiredCertifications(shift.position);
    const workerCertTypes = worker.certifications
      .filter(c => !c.expiresAt || new Date(c.expiresAt) > new Date())
      .map(c => c.type);
    const missingCertifications = requiredCertifications.filter(
      cert => !workerCertTypes.includes(cert),
    );

    // Get availability details
    const conflictingShift = await this.prisma.shift.findFirst({
      where: {
        assignedToId: workerProfileId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        OR: [
          {
            startTime: { lte: shift.startTime },
            endTime: { gt: shift.startTime },
          },
          {
            startTime: { lt: shift.endTime },
            endTime: { gte: shift.endTime },
          },
        ],
      },
    });

    const timeOff = await this.prisma.timeOffRequest.findFirst({
      where: {
        workerProfileId,
        status: 'APPROVED',
        startDate: { lte: shift.endTime },
        endDate: { gte: shift.startTime },
      },
    });

    // Get team details
    const scheduledWorkerIds = await this.getScheduledWorkersForTimeSlot(
      shift.restaurantId,
      shift.startTime,
      shift.endTime,
      shiftId,
    );

    const scheduledCoworkers = await this.prisma.workerProfile.findMany({
      where: { id: { in: scheduledWorkerIds } },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const pastShiftsTogether = await this.countPastShiftsTogether(
      workerProfileId,
      scheduledWorkerIds,
    );

    // Get performance details at this time slot
    const performanceDetails = await this.getPerformanceAtTimeSlot(
      workerProfileId,
      new Date(shift.startTime).getHours(),
    );

    return {
      workerId: worker.userId,
      shiftId,
      totalScore: suggestion.totalScore,
      scoreBreakdown,
      qualificationDetails: {
        hasPosition: worker.positions.includes(shift.position),
        hasCertifications: missingCertifications.length === 0,
        missingCertifications,
      },
      availabilityDetails: {
        hasConflictingShift: !!conflictingShift,
        conflictingShiftId: conflictingShift?.id,
        hasTimeOff: !!timeOff,
        timeOffId: timeOff?.id,
        matchesScheduledAvailability: this.matchesAvailability(worker.availability, shift),
      },
      performanceDetails,
      teamDetails: {
        scheduledCoworkers: scheduledCoworkers.map(
          w => `${w.user.firstName} ${w.user.lastName}`,
        ),
        pastShiftsTogether,
        avgTeamRating: await this.getAvgTeamRating(workerProfileId, scheduledWorkerIds),
      },
    };
  }

  // ==================== Private Helper Methods ====================

  private async checkAvailability(worker: any, shift: any): Promise<boolean> {
    // Check for conflicting shifts
    const conflictingShift = await this.prisma.shift.findFirst({
      where: {
        assignedToId: worker.id,
        id: { not: shift.id },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        OR: [
          {
            startTime: { lte: shift.startTime },
            endTime: { gt: shift.startTime },
          },
          {
            startTime: { lt: shift.endTime },
            endTime: { gte: shift.endTime },
          },
          {
            startTime: { gte: shift.startTime },
            endTime: { lte: shift.endTime },
          },
        ],
      },
    });

    if (conflictingShift) {
      return false;
    }

    // Check for approved time off
    const timeOff = await this.prisma.timeOffRequest.findFirst({
      where: {
        workerProfileId: worker.id,
        status: 'APPROVED',
        startDate: { lte: shift.endTime },
        endDate: { gte: shift.startTime },
      },
    });

    return !timeOff;
  }

  private async calculatePerformanceScore(
    workerProfileId: string,
    shift: any,
  ): Promise<number> {
    const shiftHour = new Date(shift.startTime).getHours();

    // Get historical shifts at similar times
    const historicalShifts = await this.prisma.shift.findMany({
      where: {
        assignedToId: workerProfileId,
        status: 'COMPLETED',
      },
      take: 50,
      orderBy: { startTime: 'desc' },
    });

    if (historicalShifts.length === 0) {
      return 50; // Neutral score for new workers
    }

    // Filter to similar time slots (within 2 hours)
    const similarTimeShifts = historicalShifts.filter(s => {
      const h = new Date(s.startTime).getHours();
      return Math.abs(h - shiftHour) <= 2;
    });

    if (similarTimeShifts.length === 0) {
      return 50; // Neutral if no similar time data
    }

    // Calculate performance based on completion rate at this time
    const completedCount = similarTimeShifts.length;
    const totalAtThisTime = await this.prisma.shift.count({
      where: {
        assignedToId: workerProfileId,
      },
    });

    // Higher completion rate = higher score
    const completionRate = completedCount / Math.max(1, totalAtThisTime / 4);
    return Math.min(100, Math.round(completionRate * 100));
  }

  private calculateReliabilityScore(worker: any): number {
    // Start with reliability score from profile (1-5 scale -> 0-100)
    const baseScore = Number(worker.reliabilityScore) * 20;

    // Penalize for no-shows (-10 per no-show, max -40)
    const noShowPenalty = Math.min(40, worker.noShowCount * 10);

    // Penalize for lates (-5 per late, max -20)
    const latePenalty = Math.min(20, worker.lateCount * 5);

    // Bonus for high shift completion
    const completionBonus = Math.min(20, worker.shiftsCompleted * 0.5);

    return Math.max(0, Math.min(100, baseScore - noShowPenalty - latePenalty + completionBonus));
  }

  private async calculateDistanceScore(
    worker: any,
    restaurant: any,
  ): Promise<number> {
    // If worker has a home restaurant, calculate distance from there
    const workerRestaurant = await this.prisma.restaurant.findUnique({
      where: { id: worker.restaurantId },
    });

    if (!workerRestaurant) {
      return 50; // Neutral if no location data
    }

    const distance = calculateDistance(
      Number(workerRestaurant.lat),
      Number(workerRestaurant.lng),
      Number(restaurant.lat),
      Number(restaurant.lng),
    );

    // If same restaurant, full score
    if (distance < 0.1) {
      return 100;
    }

    // Score decreases linearly with distance up to MAX_DISTANCE_MILES
    if (distance >= this.MAX_DISTANCE_MILES) {
      return 0;
    }

    return Math.round((1 - distance / this.MAX_DISTANCE_MILES) * 100);
  }

  private calculateOvertimeRiskScore(worker: any, shift: any): number {
    // Calculate hours already scheduled this week
    const scheduledHours = worker.assignedShifts?.reduce((total: number, s: any) => {
      const duration = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
      return total + duration - (s.breakMinutes || 0) / 60;
    }, 0) || 0;

    // Calculate this shift's hours
    const shiftHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
    const totalHours = scheduledHours + shiftHours;

    // High score if well under overtime
    if (totalHours <= this.OVERTIME_THRESHOLD_HOURS * 0.75) {
      return 100;
    }

    // Medium score if approaching overtime
    if (totalHours <= this.OVERTIME_THRESHOLD_HOURS) {
      return 70;
    }

    // Low score if overtime
    if (totalHours <= this.OVERTIME_THRESHOLD_HOURS * 1.25) {
      return 30;
    }

    // Very low score for significant overtime
    return 0;
  }

  private calculatePreferenceScore(worker: any, shift: any): number {
    const shiftDayOfWeek = new Date(shift.startTime).getDay();
    const shiftStartHour = new Date(shift.startTime).getHours();
    const shiftEndHour = new Date(shift.endTime).getHours();

    // Check worker's availability preferences
    const matchingAvailability = worker.availability?.find((a: any) => {
      if (a.dayOfWeek !== shiftDayOfWeek) return false;

      const availStart = parseInt(a.startTime.split(':')[0], 10);
      const availEnd = parseInt(a.endTime.split(':')[0], 10);

      return shiftStartHour >= availStart && shiftEndHour <= availEnd;
    });

    if (!matchingAvailability) {
      return 30; // Low score if outside stated availability
    }

    // Higher score if it's a preferred slot
    if (matchingAvailability.isPreferred) {
      return 100;
    }

    return 70; // Good score if within availability but not preferred
  }

  private async calculateTeamSynergyScore(
    workerProfileId: string,
    scheduledWorkerIds: string[],
  ): Promise<number> {
    if (scheduledWorkerIds.length === 0) {
      return 50; // Neutral if no one else scheduled
    }

    // Count past shifts worked together
    const pastShiftsTogether = await this.countPastShiftsTogether(
      workerProfileId,
      scheduledWorkerIds,
    );

    // More past shifts together = higher synergy
    if (pastShiftsTogether >= 20) {
      return 100;
    }
    if (pastShiftsTogether >= 10) {
      return 80;
    }
    if (pastShiftsTogether >= 5) {
      return 60;
    }

    return 40; // Low synergy with unfamiliar team
  }

  private calculateCostEfficiencyScore(worker: any, shift: any): number {
    const workerRate = Number(worker.hourlyRate);
    const shiftRate = shift.hourlyRateOverride ? Number(shift.hourlyRateOverride) : null;

    // If no rate override, use a typical range
    if (!shiftRate) {
      // Assume typical range is $15-30/hr
      if (workerRate <= 15) return 100;
      if (workerRate <= 20) return 80;
      if (workerRate <= 25) return 60;
      if (workerRate <= 30) return 40;
      return 20;
    }

    // Compare worker rate to shift budget
    if (workerRate <= shiftRate * 0.8) return 100; // Well under budget
    if (workerRate <= shiftRate) return 80; // At or under budget
    if (workerRate <= shiftRate * 1.1) return 50; // Slightly over
    if (workerRate <= shiftRate * 1.25) return 30; // Over budget
    return 10; // Significantly over budget
  }

  private calculateWeightedScore(
    factors: WorkerScoringFactors,
    weights: ScoringWeights,
  ): number {
    // If not qualified or not available, heavily penalize
    if (!factors.positionMatch) return 0;
    if (!factors.isAvailable) return factors.positionMatch ? 10 : 0;

    return (
      factors.performanceScore * weights.performance +
      factors.reliabilityScore * weights.reliability +
      factors.distanceScore * weights.distance +
      factors.overtimeRiskScore * weights.overtimeRisk +
      factors.preferenceScore * weights.preference +
      factors.teamSynergyScore * weights.teamSynergy +
      factors.costEfficiencyScore * weights.costEfficiency
    );
  }

  private generateExplanations(
    factors: WorkerScoringFactors,
    worker: any,
    shift: any,
  ): { explanation: string[]; warnings: string[] } {
    const explanation: string[] = [];
    const warnings: string[] = [];

    // Qualification
    if (factors.positionMatch) {
      explanation.push(`Qualified for ${shift.position} position`);
    } else {
      warnings.push(`Not qualified for ${shift.position} position`);
    }

    // Availability
    if (factors.isAvailable) {
      explanation.push('Available for this time slot');
    } else {
      warnings.push('Has a scheduling conflict');
    }

    // Reliability
    if (factors.reliabilityScore >= 80) {
      explanation.push('Highly reliable worker');
    } else if (factors.reliabilityScore < 50) {
      warnings.push('Below average reliability score');
    }

    // Overtime
    if (factors.overtimeRiskScore < 50) {
      warnings.push('Approaching or exceeding weekly hour limit');
    }

    // Team synergy
    if (factors.teamSynergyScore >= 70) {
      explanation.push('Good working relationship with scheduled team');
    }

    // Cost
    if (factors.costEfficiencyScore >= 80) {
      explanation.push('Cost effective for this shift');
    } else if (factors.costEfficiencyScore < 40) {
      warnings.push('Hourly rate exceeds typical budget');
    }

    return { explanation, warnings };
  }

  private async getScheduledWorkersForTimeSlot(
    restaurantId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId?: string,
  ): Promise<string[]> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
        OR: [
          {
            startTime: { lte: startTime },
            endTime: { gt: startTime },
          },
          {
            startTime: { lt: endTime },
            endTime: { gte: endTime },
          },
          {
            startTime: { gte: startTime },
            endTime: { lte: endTime },
          },
        ],
      },
      select: { assignedToId: true },
    });

    return shifts
      .map(s => s.assignedToId)
      .filter((id): id is string => id !== null);
  }

  private async countPastShiftsTogether(
    workerProfileId: string,
    otherWorkerIds: string[],
  ): Promise<number> {
    if (otherWorkerIds.length === 0) return 0;

    // Get shifts where this worker was assigned
    const workerShifts = await this.prisma.shift.findMany({
      where: {
        assignedToId: workerProfileId,
        status: 'COMPLETED',
      },
      select: {
        restaurantId: true,
        startTime: true,
        endTime: true,
      },
      take: 100,
    });

    let count = 0;

    for (const shift of workerShifts) {
      // Check if any of the other workers had overlapping shifts
      const overlapping = await this.prisma.shift.findFirst({
        where: {
          assignedToId: { in: otherWorkerIds },
          restaurantId: shift.restaurantId,
          status: 'COMPLETED',
          OR: [
            {
              startTime: { lte: shift.startTime },
              endTime: { gt: shift.startTime },
            },
            {
              startTime: { lt: shift.endTime },
              endTime: { gte: shift.endTime },
            },
          ],
        },
      });

      if (overlapping) {
        count++;
      }
    }

    return count;
  }

  private async getAvgTeamRating(
    workerProfileId: string,
    teamMemberIds: string[],
  ): Promise<number> {
    if (teamMemberIds.length === 0) return 0;

    const teamMembers = await this.prisma.workerProfile.findMany({
      where: { id: { in: teamMemberIds } },
      select: { averageRating: true },
    });

    if (teamMembers.length === 0) return 0;

    const totalRating = teamMembers.reduce(
      (sum, m) => sum + Number(m.averageRating),
      0,
    );

    return Math.round((totalRating / teamMembers.length) * 100) / 100;
  }

  private getRequiredCertifications(position: string): string[] {
    const requirements: Record<string, string[]> = {
      BARTENDER: ['ALCOHOL_SERVICE'],
      LINE_COOK: ['FOOD_HANDLER'],
      PREP_COOK: ['FOOD_HANDLER'],
      SERVER: ['FOOD_HANDLER', 'ALCOHOL_SERVICE'],
    };

    return requirements[position] || [];
  }

  private matchesAvailability(availability: any[], shift: any): boolean {
    const shiftDayOfWeek = new Date(shift.startTime).getDay();
    const shiftStartHour = new Date(shift.startTime).getHours();
    const shiftEndHour = new Date(shift.endTime).getHours();

    return availability?.some(a => {
      if (a.dayOfWeek !== shiftDayOfWeek) return false;

      const availStart = parseInt(a.startTime.split(':')[0], 10);
      const availEnd = parseInt(a.endTime.split(':')[0], 10);

      return shiftStartHour >= availStart && shiftEndHour <= availEnd;
    }) || false;
  }

  private async getPerformanceAtTimeSlot(
    workerProfileId: string,
    hour: number,
  ): Promise<{
    shiftsAtThisTimeSlot: number;
    avgRatingAtThisTime: number;
    completionRateAtThisTime: number;
  }> {
    const allShifts = await this.prisma.shift.findMany({
      where: { assignedToId: workerProfileId },
    });

    const shiftsAtTime = allShifts.filter(s => {
      const h = new Date(s.startTime).getHours();
      return Math.abs(h - hour) <= 2;
    });

    const completedAtTime = shiftsAtTime.filter(s => s.status === 'COMPLETED');

    return {
      shiftsAtThisTimeSlot: shiftsAtTime.length,
      avgRatingAtThisTime: 4.0, // Placeholder - would need shift-level ratings
      completionRateAtThisTime: shiftsAtTime.length > 0
        ? completedAtTime.length / shiftsAtTime.length
        : 0,
    };
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getWeekEnd(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (6 - day));
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // ==================== Explanation Generators ====================

  private async getPerformanceExplanation(
    workerProfileId: string,
    shift: any,
  ): Promise<string> {
    const details = await this.getPerformanceAtTimeSlot(
      workerProfileId,
      new Date(shift.startTime).getHours(),
    );

    if (details.shiftsAtThisTimeSlot === 0) {
      return 'No historical data for this time slot';
    }

    return `${details.shiftsAtThisTimeSlot} past shifts at this time, ` +
      `${Math.round(details.completionRateAtThisTime * 100)}% completion rate`;
  }

  private getReliabilityExplanation(worker: any): string {
    const score = Number(worker.reliabilityScore);
    return `Reliability: ${score.toFixed(1)}/5.0, ` +
      `${worker.shiftsCompleted} shifts completed, ` +
      `${worker.noShowCount} no-shows, ${worker.lateCount} lates`;
  }

  private async getDistanceExplanation(
    worker: any,
    restaurant: any,
  ): Promise<string> {
    const workerRestaurant = await this.prisma.restaurant.findUnique({
      where: { id: worker.restaurantId },
    });

    if (!workerRestaurant) {
      return 'Location data not available';
    }

    const distance = calculateDistance(
      Number(workerRestaurant.lat),
      Number(workerRestaurant.lng),
      Number(restaurant.lat),
      Number(restaurant.lng),
    );

    const commuteTime = estimateCommuteTime(distance);

    return distance < 0.1
      ? 'Same location as home restaurant'
      : `${distance.toFixed(1)} miles away, ~${commuteTime} min commute`;
  }

  private async getOvertimeExplanation(worker: any, shift: any): Promise<string> {
    const scheduledHours = worker.assignedShifts?.reduce((total: number, s: any) => {
      const duration = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
      return total + duration;
    }, 0) || 0;

    const shiftHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);

    return `${scheduledHours.toFixed(1)}hrs scheduled this week + ${shiftHours.toFixed(1)}hrs = ` +
      `${(scheduledHours + shiftHours).toFixed(1)}hrs total (OT threshold: ${this.OVERTIME_THRESHOLD_HOURS}hrs)`;
  }

  private getPreferenceExplanation(worker: any, shift: any): string {
    const shiftDayOfWeek = new Date(shift.startTime).getDay();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const matchingAvail = worker.availability?.find((a: any) => a.dayOfWeek === shiftDayOfWeek);

    if (!matchingAvail) {
      return `No availability set for ${days[shiftDayOfWeek]}`;
    }

    return matchingAvail.isPreferred
      ? `${days[shiftDayOfWeek]} is a preferred work day`
      : `Available on ${days[shiftDayOfWeek]} (not marked as preferred)`;
  }

  private async getTeamSynergyExplanation(
    workerProfileId: string,
    shiftId: string,
  ): Promise<string> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) return 'Shift not found';

    const scheduledWorkerIds = await this.getScheduledWorkersForTimeSlot(
      shift.restaurantId,
      shift.startTime,
      shift.endTime,
      shiftId,
    );

    if (scheduledWorkerIds.length === 0) {
      return 'No other workers scheduled for this time';
    }

    const pastShifts = await this.countPastShiftsTogether(workerProfileId, scheduledWorkerIds);

    return `${scheduledWorkerIds.length} other workers scheduled, ` +
      `${pastShifts} past shifts worked together`;
  }

  private getCostEfficiencyExplanation(worker: any, shift: any): string {
    const rate = Number(worker.hourlyRate);
    const budget = shift.hourlyRateOverride ? Number(shift.hourlyRateOverride) : null;

    if (!budget) {
      return `Worker rate: $${rate.toFixed(2)}/hr (no budget set for shift)`;
    }

    const diff = rate - budget;
    if (diff <= 0) {
      return `Worker rate $${rate.toFixed(2)}/hr is at or below budget of $${budget.toFixed(2)}/hr`;
    }

    return `Worker rate $${rate.toFixed(2)}/hr exceeds budget of $${budget.toFixed(2)}/hr by $${diff.toFixed(2)}/hr`;
  }
}
