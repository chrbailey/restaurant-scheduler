import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { calculatePriorityScore, ClaimPriorityFactors } from '@restaurant-scheduler/shared';
import { calculateDistance } from '@/common/utils/distance.util';
import { ConflictDetectorService, ValidationResult } from '@/modules/network/services/conflict-detector.service';
import { ReputationService } from '@/modules/network/services/reputation.service';
import { NetworkVisibilityService, VisibilityPhase } from '@/modules/network/services/network-visibility.service';

/**
 * Enhanced claim validation result with detailed feedback
 */
export interface ClaimValidationResult {
  canClaim: boolean;
  priorityScore: number;
  validationResult: ValidationResult;
  networkReputation?: {
    score: number;
    tier: string;
  };
  crossTrainingValidation?: {
    isQualified: boolean;
    missingCertifications: string[];
  };
}

/**
 * Candidate information with enhanced scoring
 */
export interface EnhancedCandidate {
  worker: any;
  priorityScore: number;
  isNetworkWorker: boolean;
  networkReputation?: {
    score: number;
    rating: number;
    tier: string;
    totalShifts: number;
  };
  distanceMiles?: number;
  hasConflicts: boolean;
  conflictDetails?: string[];
}

/**
 * Shift Matcher Service
 *
 * Implements the priority scoring system for shift claims with enhanced
 * conflict detection and network reputation integration.
 *
 * Priority System (when multiple workers claim):
 * 1. Own employees (+1000 points)
 * 2. Primary tier employees (+100 points)
 * 3. Reputation score (0-500 points, based on 1-5 rating)
 * 4. Network reputation bonus (+0-100 based on network tier)
 * 5. Reliability bonus (+50 if >4.5 reliability)
 * 6. No-show penalty (-25 per incident)
 * 7. Claim time (+1 per minute early, max 60)
 *
 * Visibility Phases:
 * 1. 0-2 hours: Own employees only
 * 2. 2+ hours: Network workers (filtered by reputation, distance, cross-training)
 */
@Injectable()
export class ShiftMatcherService {
  private readonly logger = new Logger(ShiftMatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly conflictDetector: ConflictDetectorService,
    private readonly reputationService: ReputationService,
    private readonly visibilityService: NetworkVisibilityService,
  ) {}

  /**
   * Calculate priority score for a worker claiming a shift
   * Enhanced with network reputation scoring
   */
  async calculateClaimPriority(
    shiftId: string,
    workerProfileId: string,
  ): Promise<number> {
    const [shift, workerProfile] = await Promise.all([
      this.prisma.shift.findUnique({
        where: { id: shiftId },
        include: { restaurant: true },
      }),
      this.prisma.workerProfile.findUnique({
        where: { id: workerProfileId },
      }),
    ]);

    if (!shift || !workerProfile) {
      return 0;
    }

    const isNetworkShift = workerProfile.restaurantId !== shift.restaurantId;

    // Get network reputation for network shifts
    let networkReputationBonus = 0;
    if (isNetworkShift) {
      try {
        const networkRep = await this.reputationService.calculateNetworkReputation(
          workerProfileId,
        );
        // Add 0-100 bonus based on tier
        switch (networkRep.tier) {
          case 'PLATINUM':
            networkReputationBonus = 100;
            break;
          case 'GOLD':
            networkReputationBonus = 75;
            break;
          case 'SILVER':
            networkReputationBonus = 50;
            break;
          case 'BRONZE':
            networkReputationBonus = 25;
            break;
        }
      } catch (error) {
        this.logger.warn(
          `Could not calculate network reputation for worker ${workerProfileId}: ${error}`,
        );
      }
    }

    const factors: ClaimPriorityFactors = {
      // +1000 if same restaurant
      isOwnEmployee: workerProfile.restaurantId === shift.restaurantId,
      // +100 if primary tier
      isPrimaryTier: workerProfile.tier === 'PRIMARY',
      // 0-5 rating → 0-500 points
      reputationScore: Number(workerProfile.reliabilityScore),
      // +50 if reliability > 4.5
      reliabilityBonus: Number(workerProfile.reliabilityScore) > 4.5,
      // -25 per no-show
      noShowCount: workerProfile.noShowCount,
      // Claim time bonus calculated separately
      claimTimeBonus: 0,
    };

    const baseScore = calculatePriorityScore(factors);
    return baseScore + networkReputationBonus;
  }

  /**
   * Validate a shift claim with full conflict detection
   * Integrates conflict detection, reputation validation, and cross-training checks
   */
  async validateShiftClaim(
    shiftId: string,
    workerProfileId: string,
  ): Promise<ClaimValidationResult> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        restaurant: {
          include: { network: true },
        },
        certifications: true,
      },
    });

    if (!worker) {
      throw new BadRequestException('Worker not found');
    }

    const isNetworkShift = worker.restaurantId !== shift.restaurantId;

    // Validate shift visibility
    if (isNetworkShift) {
      const visibility = await this.visibilityService.canWorkerSeeShift(
        workerProfileId,
        shiftId,
      );

      if (!visibility.isVisible) {
        return {
          canClaim: false,
          priorityScore: 0,
          validationResult: {
            valid: false,
            conflicts: [{
              type: 'OVERLAP',
              message: visibility.reason || 'Shift is not visible to this worker',
            }],
            warnings: [],
          },
        };
      }
    }

    // Run conflict detection
    const validationResult = await this.conflictDetector.validateShiftAssignment(
      workerProfileId,
      shiftId,
    );

    // Cross-training validation
    const crossTrainingValidation = this.validateCrossTraining(
      shift.position,
      worker.positions,
      worker.certifications,
    );

    // Get network reputation for network shifts
    let networkReputation: { score: number; tier: string } | undefined;
    if (isNetworkShift) {
      try {
        const rep = await this.reputationService.calculateNetworkReputation(
          workerProfileId,
        );
        networkReputation = {
          score: rep.score,
          tier: rep.tier,
        };
      } catch (error) {
        this.logger.warn(`Could not get network reputation: ${error}`);
      }
    }

    // Calculate priority score
    const priorityScore = await this.calculateClaimPriority(shiftId, workerProfileId);

    // Determine if claim is allowed
    const canClaim =
      validationResult.valid &&
      crossTrainingValidation.isQualified;

    return {
      canClaim,
      priorityScore,
      validationResult,
      networkReputation,
      crossTrainingValidation,
    };
  }

  /**
   * Get available shifts for a worker based on visibility rules
   * Now integrates with NetworkVisibilityService
   */
  async getAvailableShifts(
    workerProfileId: string,
    options?: {
      position?: string[];
      startDate?: Date;
      endDate?: Date;
      includeNetwork?: boolean;
    },
  ) {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!worker) {
      return [];
    }

    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Build base query for own restaurant
    const baseWhere: any = {
      status: 'PUBLISHED_UNASSIGNED',
      startTime: {
        gte: options?.startDate || now,
        ...(options?.endDate && { lte: options.endDate }),
      },
    };

    if (options?.position && options.position.length > 0) {
      // Only show shifts for positions worker is qualified for
      const qualifiedPositions = options.position.filter((p) =>
        worker.positions.includes(p),
      );
      if (qualifiedPositions.length > 0) {
        baseWhere.position = { in: qualifiedPositions };
      }
    } else {
      // Default to worker's qualified positions
      baseWhere.position = { in: worker.positions };
    }

    const shifts: any[] = [];

    // Phase 1: Own restaurant shifts (always visible)
    const ownShifts = await this.prisma.shift.findMany({
      where: {
        ...baseWhere,
        restaurantId: worker.restaurantId,
      },
      include: {
        restaurant: {
          select: { id: true, name: true, timezone: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Check each own shift for conflicts
    for (const shift of ownShifts) {
      const conflicts = await this.conflictDetector.detectShiftConflicts(
        workerProfileId,
        {
          startTime: new Date(shift.startTime),
          endTime: new Date(shift.endTime),
          restaurantId: shift.restaurantId,
        },
      );

      shifts.push({
        ...shift,
        isNetworkShift: false,
        visibility: 'OWN',
        hasConflicts: conflicts.length > 0,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      });
    }

    // Phase 2: Network shifts (using enhanced visibility service)
    if (options?.includeNetwork) {
      try {
        const networkShifts = await this.visibilityService.getVisibleNetworkShifts(
          workerProfileId,
          worker.restaurantId,
        );

        // Check each network shift for conflicts
        for (const ns of networkShifts) {
          const conflicts = await this.conflictDetector.detectShiftConflicts(
            workerProfileId,
            {
              startTime: new Date(ns.shift.startTime),
              endTime: new Date(ns.shift.endTime),
              restaurantId: ns.shift.restaurantId,
            },
          );

          shifts.push({
            ...ns.shift,
            isNetworkShift: true,
            visibility: 'NETWORK',
            visibilityDetails: ns.visibility,
            hasConflicts: conflicts.length > 0,
            conflicts: conflicts.length > 0 ? conflicts : undefined,
          });
        }
      } catch (error) {
        this.logger.warn(`Error fetching network shifts: ${error}`);
      }
    }

    // Sort by start time
    shifts.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    // Cache result
    await this.redis.setJson(
      `available:${workerProfileId}`,
      shifts.map((s) => s.id),
      60,
    );

    return shifts;
  }

  /**
   * Find best candidates for an open shift
   * Enhanced with network reputation and conflict detection
   */
  async findCandidates(
    shiftId: string,
    options?: {
      limit?: number;
      includeNetwork?: boolean;
    },
  ): Promise<EnhancedCandidate[]> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!shift) {
      return [];
    }

    const limit = options?.limit || 10;
    const candidates: EnhancedCandidate[] = [];

    // Find qualified workers from own restaurant
    const ownWorkers = await this.prisma.workerProfile.findMany({
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
      },
    });

    for (const worker of ownWorkers) {
      // Full conflict validation
      const validation = await this.conflictDetector.validateShiftAssignment(
        worker.id,
        shiftId,
      );

      const priority = await this.calculateClaimPriority(shiftId, worker.id);

      candidates.push({
        worker,
        priorityScore: priority,
        isNetworkWorker: false,
        hasConflicts: !validation.valid,
        conflictDetails: validation.conflicts.map((c) => c.message),
      });
    }

    // Find network workers if enabled
    if (
      options?.includeNetwork &&
      shift.restaurant.networkId &&
      shift.restaurant.network?.enableCrossRestaurantShifts
    ) {
      // Check visibility phase
      const visibilityPhase = this.visibilityService.getShiftVisibilityPhase({
        startTime: shift.startTime,
        restaurant: {
          networkId: shift.restaurant.networkId,
          networkVisibilityHours: shift.restaurant.networkVisibilityHours,
          network: shift.restaurant.network,
        },
      });

      // Only include network workers if in network visibility phase
      if (visibilityPhase.phase === VisibilityPhase.NETWORK) {
        const networkRestaurants = await this.prisma.restaurant.findMany({
          where: {
            networkId: shift.restaurant.networkId,
            id: { not: shift.restaurantId },
          },
          select: { id: true, lat: true, lng: true },
        });

        // Filter by distance
        const network = shift.restaurant.network;
        const eligibleRestaurantIds = networkRestaurants
          .filter((r) => {
            const distance = calculateDistance(
              Number(shift.restaurant.lat),
              Number(shift.restaurant.lng),
              Number(r.lat),
              Number(r.lng),
            );
            return distance <= network.maxDistanceMiles;
          })
          .map((r) => r.id);

        if (eligibleRestaurantIds.length > 0) {
          const networkWorkers = await this.prisma.workerProfile.findMany({
            where: {
              restaurantId: { in: eligibleRestaurantIds },
              status: 'ACTIVE',
              positions: { has: shift.position },
              reliabilityScore: {
                gte: Number(network.minNetworkReputationScore),
              },
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
              restaurant: {
                select: { id: true, name: true, lat: true, lng: true },
              },
            },
          });

          for (const worker of networkWorkers) {
            // Full conflict validation
            const validation = await this.conflictDetector.validateShiftAssignment(
              worker.id,
              shiftId,
            );

            // Calculate distance
            const distance = calculateDistance(
              Number(shift.restaurant.lat),
              Number(shift.restaurant.lng),
              Number(worker.restaurant.lat),
              Number(worker.restaurant.lng),
            );

            // Get network reputation
            let networkReputation: any;
            try {
              networkReputation = await this.reputationService.calculateNetworkReputation(
                worker.id,
              );
            } catch (error) {
              this.logger.warn(`Could not get reputation for worker ${worker.id}`);
            }

            const priority = await this.calculateClaimPriority(shiftId, worker.id);

            candidates.push({
              worker,
              priorityScore: priority,
              isNetworkWorker: true,
              networkReputation: networkReputation
                ? {
                    score: networkReputation.score,
                    rating: networkReputation.rating,
                    tier: networkReputation.tier,
                    totalShifts: networkReputation.totalShifts,
                  }
                : undefined,
              distanceMiles: Math.round(distance * 10) / 10,
              hasConflicts: !validation.valid,
              conflictDetails: validation.conflicts.map((c) => c.message),
            });
          }
        }
      }
    }

    // Sort by priority (available workers first, then by score)
    return candidates
      .sort((a, b) => {
        // Available workers come first
        if (a.hasConflicts !== b.hasConflicts) {
          return a.hasConflicts ? 1 : -1;
        }
        // Then by priority score
        return b.priorityScore - a.priorityScore;
      })
      .slice(0, limit);
  }

  /**
   * Check if a worker is available for a time slot
   * Now uses ConflictDetectorService for comprehensive checking
   */
  async isWorkerAvailable(
    workerProfileId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    // Use conflict detector for basic overlap check
    const conflicts = await this.conflictDetector.detectShiftConflicts(
      workerProfileId,
      {
        startTime,
        endTime,
        restaurantId: '', // Placeholder, will be validated separately
      },
    );

    // Only check for overlap conflicts (not commute, max hours, etc.)
    const overlapConflicts = conflicts.filter((c) => c.type === 'OVERLAP');

    if (overlapConflicts.length > 0) {
      return false;
    }

    // Check for approved time off
    const timeOff = await this.prisma.timeOffRequest.findFirst({
      where: {
        workerProfileId,
        status: 'APPROVED',
        startDate: { lte: endTime },
        endDate: { gte: startTime },
      },
    });

    if (timeOff) {
      return false;
    }

    return true;
  }

  /**
   * Validate cross-training requirements for a position
   */
  private validateCrossTraining(
    requiredPosition: string,
    workerPositions: string[],
    workerCertifications: any[],
  ): {
    isQualified: boolean;
    missingCertifications: string[];
  } {
    // Check if worker has the position
    const hasPosition = workerPositions.includes(requiredPosition);

    if (!hasPosition) {
      return {
        isQualified: false,
        missingCertifications: [],
      };
    }

    // Position-specific certification requirements
    const certificationRequirements: Record<string, string[]> = {
      BARTENDER: ['ALCOHOL_SERVICE'],
      LINE_COOK: ['FOOD_HANDLER'],
      PREP_COOK: ['FOOD_HANDLER'],
    };

    const requiredCerts = certificationRequirements[requiredPosition] || [];
    const workerCertTypes = workerCertifications
      .filter((c) => !c.expiresAt || new Date(c.expiresAt) > new Date())
      .map((c) => c.type);

    const missingCerts = requiredCerts.filter((cert) => !workerCertTypes.includes(cert));

    return {
      isQualified: missingCerts.length === 0,
      missingCertifications: missingCerts,
    };
  }

  /**
   * Get worker scheduling summary for UI
   */
  async getWorkerSchedulingSummary(workerId: string, date: Date) {
    return this.conflictDetector.getWorkerSchedulingSummary(workerId, date);
  }
}
