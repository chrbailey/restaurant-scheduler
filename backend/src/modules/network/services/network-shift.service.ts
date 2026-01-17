import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CrossTrainingService } from './cross-training.service';
import { CrossTrainingStatus } from '../entities/cross-training.entity';
import { MembershipStatus } from '../entities/network-membership.entity';
import { NetworkSettings, DEFAULT_NETWORK_SETTINGS } from '../entities/restaurant-network.entity';
import { ShiftStatus } from '@restaurant-scheduler/shared';

/**
 * Network Shift Service
 *
 * Handles shift visibility and claiming across network restaurants.
 * Implements visibility rules, cross-training checks, and reputation thresholds.
 */
@Injectable()
export class NetworkShiftService {
  private readonly logger = new Logger(NetworkShiftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crossTrainingService: CrossTrainingService,
  ) {}

  /**
   * Get available shifts visible to a network worker
   *
   * Shifts become visible to network workers based on:
   * - visibilityDelayHours after being posted
   * - maxDistanceMiles from worker's home restaurant
   * - Worker's cross-training status at the shift's restaurant
   */
  async getNetworkAvailableShifts(
    workerProfileId: string,
    options?: {
      position?: string;
      fromDate?: Date;
      toDate?: Date;
      maxDistance?: number;
    },
  ) {
    // Get worker with their restaurant and network info
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        restaurant: {
          include: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
              include: {
                network: true,
              },
            },
          },
        },
      },
    });

    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found');
    }

    const membership = workerProfile.restaurant.memberships[0];
    if (!membership) {
      // Worker's restaurant is not in a network
      return [];
    }

    const network = membership.network;
    const networkSettings = (network.settings as unknown as NetworkSettings) || DEFAULT_NETWORK_SETTINGS;

    if (!networkSettings.shiftSharingEnabled) {
      return [];
    }

    // Check worker has minimum shifts at home restaurant
    if (workerProfile.shiftsCompleted < networkSettings.minHomeShifts) {
      return [];
    }

    // Get all restaurants in the network (except worker's home restaurant)
    const networkRestaurants = await this.prisma.restaurant.findMany({
      where: {
        memberships: {
          some: {
            networkId: network.id,
            status: MembershipStatus.ACTIVE,
          },
        },
        id: { not: workerProfile.restaurantId },
      },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        timezone: true,
      },
    });

    if (networkRestaurants.length === 0) {
      return [];
    }

    // Get worker's cross-training certifications
    const crossTrainings = await this.prisma.crossTraining.findMany({
      where: {
        workerProfileId,
        status: CrossTrainingStatus.APPROVED,
        targetRestaurantId: { in: networkRestaurants.map((r) => r.id) },
      },
    });

    // Create a map of cross-trained restaurants and positions
    const crossTrainedMap = new Map<string, string[]>();
    for (const ct of crossTrainings) {
      crossTrainedMap.set(ct.targetRestaurantId, ct.positions);
    }

    // Determine which restaurants to include based on cross-training requirements
    const eligibleRestaurantIds = networkSettings.requireCrossTraining
      ? Array.from(crossTrainedMap.keys())
      : networkRestaurants.map((r) => r.id);

    if (eligibleRestaurantIds.length === 0) {
      return [];
    }

    // Calculate visibility cutoff time
    const visibilityCutoff = new Date();
    visibilityCutoff.setHours(
      visibilityCutoff.getHours() - networkSettings.visibilityDelayHours,
    );

    // Build the date filter
    const now = new Date();
    const fromDate = options?.fromDate || now;
    const toDate = options?.toDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Get available shifts
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId: { in: eligibleRestaurantIds },
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
        startTime: {
          gte: fromDate,
          lte: toDate,
        },
        createdAt: { lte: visibilityCutoff },
        ...(options?.position && { position: options.position }),
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            lat: true,
            lng: true,
            timezone: true,
          },
        },
        claims: {
          where: { workerProfileId },
          select: { id: true, status: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Filter by distance and worker qualifications
    const homeRestaurant = workerProfile.restaurant;
    const maxDistance = options?.maxDistance || networkSettings.maxDistanceMiles;

    const filteredShifts = shifts.filter((shift) => {
      // Check distance
      const distance = this.calculateDistance(
        Number(homeRestaurant.lat),
        Number(homeRestaurant.lng),
        Number(shift.restaurant.lat),
        Number(shift.restaurant.lng),
      );

      if (distance > maxDistance) {
        return false;
      }

      // Check if worker is qualified for the position
      if (networkSettings.requireCrossTraining) {
        const crossTrainedPositions = crossTrainedMap.get(shift.restaurantId);
        if (!crossTrainedPositions?.includes(shift.position)) {
          return false;
        }
      } else {
        // If cross-training not required, check worker's general positions
        if (!workerProfile.positions.includes(shift.position)) {
          return false;
        }
      }

      // Check minimum reputation
      if (
        shift.minReputationScore &&
        Number(workerProfile.reliabilityScore) < Number(shift.minReputationScore)
      ) {
        return false;
      }

      return true;
    });

    // Add additional context to shifts
    return filteredShifts.map((shift) => ({
      ...shift,
      distance: this.calculateDistance(
        Number(homeRestaurant.lat),
        Number(homeRestaurant.lng),
        Number(shift.restaurant.lat),
        Number(shift.restaurant.lng),
      ),
      isNetworkShift: true,
      hasClaimed: shift.claims.length > 0,
      claimStatus: shift.claims[0]?.status || null,
    }));
  }

  /**
   * Claim a network shift
   */
  async claimNetworkShift(
    shiftId: string,
    workerProfileId: string,
    notes?: string,
  ) {
    // Validate the claim
    const validation = await this.validateNetworkClaim(shiftId, workerProfileId);

    if (!validation.isValid) {
      throw new BadRequestException(validation.reason);
    }

    const { shift, workerProfile, network } = validation;

    // Check if already claimed
    const existingClaim = await this.prisma.shiftClaim.findUnique({
      where: {
        shiftId_workerProfileId: {
          shiftId,
          workerProfileId,
        },
      },
    });

    if (existingClaim) {
      throw new BadRequestException('You have already claimed this shift');
    }

    // Calculate priority score (network workers may have lower priority than home workers)
    const priorityScore = this.calculateNetworkClaimPriority(
      workerProfile,
      shift,
    );

    // Create the claim
    const claim = await this.prisma.shiftClaim.create({
      data: {
        shiftId,
        workerProfileId,
        priorityScore,
        notes: notes ? `[Network Claim] ${notes}` : '[Network Claim]',
      },
      include: {
        shift: {
          include: {
            restaurant: {
              select: { id: true, name: true, timezone: true },
            },
          },
        },
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    this.logger.log(
      `Network shift ${shiftId} claimed by worker ${workerProfileId} (priority: ${priorityScore})`,
    );

    // TODO: Notify shift's restaurant manager of network claim

    return claim;
  }

  /**
   * Validate a network shift claim
   */
  async validateNetworkClaim(
    shiftId: string,
    workerProfileId: string,
  ): Promise<{
    isValid: boolean;
    reason?: string;
    shift?: any;
    workerProfile?: any;
    network?: any;
  }> {
    // Get the shift
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: {
          include: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
              include: { network: true },
            },
          },
        },
      },
    });

    if (!shift) {
      return { isValid: false, reason: 'Shift not found' };
    }

    if (shift.status !== ShiftStatus.PUBLISHED_UNASSIGNED) {
      return { isValid: false, reason: 'Shift is not available for claiming' };
    }

    // Get worker profile
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        restaurant: {
          include: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
              include: { network: true },
            },
          },
        },
      },
    });

    if (!workerProfile) {
      return { isValid: false, reason: 'Worker profile not found' };
    }

    // Check worker is not from the same restaurant
    if (workerProfile.restaurantId === shift.restaurantId) {
      return {
        isValid: false,
        reason: 'Use regular claim for shifts at your home restaurant',
      };
    }

    // Check both are in the same network
    const shiftNetwork = shift.restaurant.memberships[0]?.network;
    const workerNetwork = workerProfile.restaurant.memberships[0]?.network;

    if (!shiftNetwork || !workerNetwork) {
      return { isValid: false, reason: 'Restaurant is not in a network' };
    }

    if (shiftNetwork.id !== workerNetwork.id) {
      return { isValid: false, reason: 'Restaurants are not in the same network' };
    }

    const networkSettings = (shiftNetwork.settings as unknown as NetworkSettings) || DEFAULT_NETWORK_SETTINGS;

    if (!networkSettings.shiftSharingEnabled) {
      return { isValid: false, reason: 'Network shift sharing is disabled' };
    }

    // Check minimum home shifts requirement
    if (workerProfile.shiftsCompleted < networkSettings.minHomeShifts) {
      return {
        isValid: false,
        reason: `Must complete ${networkSettings.minHomeShifts} shifts at home restaurant first`,
      };
    }

    // Check cross-training if required
    if (networkSettings.requireCrossTraining) {
      const isCrossTrained = await this.crossTrainingService.isWorkerCrossTrainedAt(
        workerProfileId,
        shift.restaurantId,
        shift.position,
      );

      if (!isCrossTrained) {
        return {
          isValid: false,
          reason: `Not cross-trained for ${shift.position} at this restaurant`,
        };
      }
    } else {
      // Check worker has the position
      if (!workerProfile.positions.includes(shift.position)) {
        return {
          isValid: false,
          reason: `Not qualified for position: ${shift.position}`,
        };
      }
    }

    // Check reputation threshold
    if (
      shift.minReputationScore &&
      Number(workerProfile.reliabilityScore) < Number(shift.minReputationScore)
    ) {
      return {
        isValid: false,
        reason: 'Does not meet minimum reputation requirement',
      };
    }

    // Check distance
    const distance = this.calculateDistance(
      Number(workerProfile.restaurant.lat),
      Number(workerProfile.restaurant.lng),
      Number(shift.restaurant.lat),
      Number(shift.restaurant.lng),
    );

    if (distance > networkSettings.maxDistanceMiles) {
      return {
        isValid: false,
        reason: `Restaurant is too far (${distance.toFixed(1)} miles, max: ${networkSettings.maxDistanceMiles})`,
      };
    }

    // Check visibility delay
    const visibilityCutoff = new Date();
    visibilityCutoff.setHours(
      visibilityCutoff.getHours() - networkSettings.visibilityDelayHours,
    );

    if (shift.createdAt > visibilityCutoff) {
      const hoursRemaining = Math.ceil(
        (shift.createdAt.getTime() - visibilityCutoff.getTime()) / (1000 * 60 * 60),
      );
      return {
        isValid: false,
        reason: `Shift not yet visible to network workers (${hoursRemaining}h remaining)`,
      };
    }

    return {
      isValid: true,
      shift,
      workerProfile,
      network: shiftNetwork,
    };
  }

  /**
   * Get network shift statistics for a restaurant
   */
  async getNetworkShiftStats(restaurantId: string) {
    const membership = await this.prisma.networkMembership.findFirst({
      where: {
        restaurantId,
        status: MembershipStatus.ACTIVE,
      },
      include: { network: true },
    });

    if (!membership) {
      return null;
    }

    // Get shifts filled by network workers
    const networkFilledShifts = await this.prisma.shift.count({
      where: {
        restaurantId,
        status: { in: [ShiftStatus.CONFIRMED, ShiftStatus.IN_PROGRESS, ShiftStatus.COMPLETED] },
        assignedTo: {
          restaurantId: { not: restaurantId },
        },
      },
    });

    // Get workers who have worked network shifts at this restaurant
    const networkWorkers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId: { not: restaurantId },
        assignedShifts: {
          some: {
            restaurantId,
            status: { in: [ShiftStatus.CONFIRMED, ShiftStatus.IN_PROGRESS, ShiftStatus.COMPLETED] },
          },
        },
      },
      distinct: ['id'],
    });

    // Get cross-trained workers count
    const crossTrainedCount = await this.prisma.crossTraining.count({
      where: {
        targetRestaurantId: restaurantId,
        status: CrossTrainingStatus.APPROVED,
      },
    });

    return {
      networkId: membership.networkId,
      networkName: membership.network.name,
      shiftsFilledByNetworkWorkers: networkFilledShifts,
      uniqueNetworkWorkersUsed: networkWorkers.length,
      crossTrainedWorkersCount: crossTrainedCount,
    };
  }

  /**
   * Calculate priority score for network claims
   * Network workers typically have lower base priority than home workers
   */
  private calculateNetworkClaimPriority(workerProfile: any, shift: any): number {
    let score = 0;

    // Base score for network workers (lower than home workers who start at 100)
    score += 50;

    // Reliability score bonus (up to 25 points)
    score += Math.min(Number(workerProfile.reliabilityScore) * 5, 25);

    // Experience bonus (up to 15 points)
    const experienceBonus = Math.min(workerProfile.shiftsCompleted / 10, 15);
    score += experienceBonus;

    // Rating bonus (up to 10 points)
    score += Number(workerProfile.averageRating) * 2;

    return Math.round(score);
  }

  /**
   * Calculate distance between two coordinates in miles
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
