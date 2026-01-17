import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ReputationService } from './reputation.service';
import {
  calculateDistance,
  getBoundingBox,
} from '@/common/utils/distance.util';

/**
 * Visibility phases for shift access
 */
export enum VisibilityPhase {
  /** Only own restaurant employees can see */
  OWN_RESTAURANT = 'OWN_RESTAURANT',
  /** Network workers can see (based on reputation, distance, cross-training) */
  NETWORK = 'NETWORK',
  /** Shift has passed or is too close to start */
  CLOSED = 'CLOSED',
}

/**
 * Shift visibility result
 */
export interface ShiftVisibility {
  shiftId: string;
  phase: VisibilityPhase;
  hoursUntilStart: number;
  isVisible: boolean;
  reason?: string;
}

/**
 * Network shift with visibility metadata
 */
export interface VisibleNetworkShift {
  shift: any;
  visibility: {
    phase: VisibilityPhase;
    distance?: number;
    matchesPosition: boolean;
    meetsReputationRequirement: boolean;
  };
}

/**
 * Network Visibility Service
 *
 * Controls what shifts network workers can see based on:
 * - Visibility phases (own restaurant vs network based on time)
 * - Worker reputation requirements
 * - Distance from worker's home restaurant
 * - Cross-training / position qualification
 *
 * Visibility Rules:
 * - 0-2 hours before shift: Own employees only
 * - 2+ hours before shift: Network workers (filtered by reputation, distance, cross-training)
 */
@Injectable()
export class NetworkVisibilityService {
  private readonly logger = new Logger(NetworkVisibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly reputationService: ReputationService,
  ) {}

  /**
   * Get all visible network shifts for a worker at a specific restaurant
   *
   * Returns shifts that the worker can see and potentially claim,
   * filtered by visibility rules.
   *
   * @param workerId - Worker profile ID
   * @param restaurantId - Restaurant context (usually worker's home restaurant)
   * @returns List of visible shifts with visibility metadata
   */
  async getVisibleNetworkShifts(
    workerId: string,
    restaurantId: string,
  ): Promise<VisibleNetworkShift[]> {
    // Get worker profile with restaurant details
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    // If restaurant isn't in a network or network shifts disabled, return empty
    if (!worker.restaurant.networkId || !worker.restaurant.network?.enableCrossRestaurantShifts) {
      return [];
    }

    const network = worker.restaurant.network;
    const now = new Date();

    // Check if worker meets minimum network reputation
    const minReputation = Number(network.minNetworkReputationScore);
    const meetsReputation = await this.reputationService.meetsNetworkMinimum(
      workerId,
      minReputation,
    );

    if (!meetsReputation) {
      this.logger.debug(
        `Worker ${workerId} does not meet minimum network reputation (${minReputation})`,
      );
      return [];
    }

    // Get network restaurants with location data
    const networkRestaurants = await this.prisma.restaurant.findMany({
      where: {
        networkId: worker.restaurant.networkId,
        id: { not: worker.restaurantId }, // Exclude home restaurant
      },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        networkVisibilityHours: true,
        minReputationScore: true,
      },
    });

    // Filter restaurants by distance
    const workerLat = Number(worker.restaurant.lat);
    const workerLng = Number(worker.restaurant.lng);
    const maxDistance = network.maxDistanceMiles;

    const eligibleRestaurants = networkRestaurants.filter((r) => {
      const distance = calculateDistance(
        workerLat,
        workerLng,
        Number(r.lat),
        Number(r.lng),
      );
      return distance <= maxDistance;
    });

    if (eligibleRestaurants.length === 0) {
      return [];
    }

    // Calculate minimum visibility time (default to network setting or 2 hours)
    const minVisibilityHours = Math.max(
      ...eligibleRestaurants.map((r) => r.networkVisibilityHours || 2),
    );
    const visibilityThreshold = new Date(
      now.getTime() + minVisibilityHours * 60 * 60 * 1000,
    );

    // Get available shifts from eligible restaurants
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId: { in: eligibleRestaurants.map((r) => r.id) },
        status: 'PUBLISHED_UNASSIGNED',
        startTime: { gte: visibilityThreshold }, // Only shifts beyond visibility threshold
        position: { in: worker.positions }, // Only positions worker is qualified for
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            minReputationScore: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Build visibility results
    const visibleShifts: VisibleNetworkShift[] = [];

    for (const shift of shifts) {
      const distance = calculateDistance(
        workerLat,
        workerLng,
        Number(shift.restaurant.lat),
        Number(shift.restaurant.lng),
      );

      const hoursUntilStart =
        (new Date(shift.startTime).getTime() - now.getTime()) / (1000 * 60 * 60);

      // Check shift-specific reputation requirement
      const shiftMinReputation = shift.minReputationScore
        ? Number(shift.minReputationScore)
        : Number(shift.restaurant.minReputationScore);

      const meetsShiftReputation = shiftMinReputation
        ? await this.reputationService.meetsNetworkMinimum(workerId, shiftMinReputation)
        : true;

      visibleShifts.push({
        shift: {
          ...shift,
          hoursUntilStart: Math.round(hoursUntilStart * 10) / 10,
          isNetworkShift: true,
        },
        visibility: {
          phase: VisibilityPhase.NETWORK,
          distance: Math.round(distance * 10) / 10,
          matchesPosition: true, // Already filtered above
          meetsReputationRequirement: meetsShiftReputation,
        },
      });
    }

    // Filter out shifts where worker doesn't meet reputation
    return visibleShifts.filter((vs) => vs.visibility.meetsReputationRequirement);
  }

  /**
   * Check if a specific worker can see a specific shift
   *
   * @param workerId - Worker profile ID
   * @param shiftId - Shift ID
   * @returns Whether the worker can see the shift and why
   */
  async canWorkerSeeShift(
    workerId: string,
    shiftId: string,
  ): Promise<ShiftVisibility> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const now = new Date();
    const hoursUntilStart =
      (new Date(shift.startTime).getTime() - now.getTime()) / (1000 * 60 * 60);

    // Check if shift has already started
    if (hoursUntilStart < 0) {
      return {
        shiftId,
        phase: VisibilityPhase.CLOSED,
        hoursUntilStart,
        isVisible: false,
        reason: 'Shift has already started',
      };
    }

    // Same restaurant - always visible
    if (worker.restaurantId === shift.restaurantId) {
      return {
        shiftId,
        phase: VisibilityPhase.OWN_RESTAURANT,
        hoursUntilStart,
        isVisible: true,
      };
    }

    // Different restaurant - check network rules
    if (!shift.restaurant.networkId || !shift.restaurant.network?.enableCrossRestaurantShifts) {
      return {
        shiftId,
        phase: VisibilityPhase.CLOSED,
        hoursUntilStart,
        isVisible: false,
        reason: 'Shift restaurant is not in a network or cross-restaurant shifts disabled',
      };
    }

    // Check if worker is in the same network
    if (worker.restaurant.networkId !== shift.restaurant.networkId) {
      return {
        shiftId,
        phase: VisibilityPhase.CLOSED,
        hoursUntilStart,
        isVisible: false,
        reason: 'Worker is not in the same network',
      };
    }

    // Check visibility hours threshold
    const visibilityHours = shift.restaurant.networkVisibilityHours || 2;
    if (hoursUntilStart < visibilityHours) {
      return {
        shiftId,
        phase: VisibilityPhase.OWN_RESTAURANT, // Within own-restaurant-only window
        hoursUntilStart,
        isVisible: false,
        reason: `Shift is less than ${visibilityHours} hours away (network visibility threshold)`,
      };
    }

    // Check position qualification
    if (!worker.positions.includes(shift.position)) {
      return {
        shiftId,
        phase: VisibilityPhase.NETWORK,
        hoursUntilStart,
        isVisible: false,
        reason: `Worker is not qualified for position: ${shift.position}`,
      };
    }

    // Check network reputation requirement
    const network = shift.restaurant.network;
    const minNetworkReputation = Number(network.minNetworkReputationScore);
    const meetsNetworkReputation = await this.reputationService.meetsNetworkMinimum(
      workerId,
      minNetworkReputation,
    );

    if (!meetsNetworkReputation) {
      return {
        shiftId,
        phase: VisibilityPhase.NETWORK,
        hoursUntilStart,
        isVisible: false,
        reason: `Worker does not meet network minimum reputation (${minNetworkReputation})`,
      };
    }

    // Check shift-specific reputation requirement
    if (shift.minReputationScore) {
      const meetsShiftReputation = await this.reputationService.meetsNetworkMinimum(
        workerId,
        Number(shift.minReputationScore),
      );

      if (!meetsShiftReputation) {
        return {
          shiftId,
          phase: VisibilityPhase.NETWORK,
          hoursUntilStart,
          isVisible: false,
          reason: `Worker does not meet shift minimum reputation (${shift.minReputationScore})`,
        };
      }
    }

    // Check distance
    const distance = calculateDistance(
      Number(worker.restaurant.lat),
      Number(worker.restaurant.lng),
      Number(shift.restaurant.lat),
      Number(shift.restaurant.lng),
    );

    if (distance > network.maxDistanceMiles) {
      return {
        shiftId,
        phase: VisibilityPhase.NETWORK,
        hoursUntilStart,
        isVisible: false,
        reason: `Shift is ${Math.round(distance)} miles away (max: ${network.maxDistanceMiles} miles)`,
      };
    }

    // All checks passed
    return {
      shiftId,
      phase: VisibilityPhase.NETWORK,
      hoursUntilStart,
      isVisible: true,
    };
  }

  /**
   * Get the visibility phase for a shift
   *
   * Determines whether a shift is in the own-restaurant-only phase
   * or the network phase based on time until start.
   *
   * @param shift - Shift with restaurant data
   * @returns Visibility phase information
   */
  getShiftVisibilityPhase(shift: {
    startTime: Date | string;
    restaurant: {
      networkId: string | null;
      networkVisibilityHours: number;
      network?: { enableCrossRestaurantShifts: boolean } | null;
    };
  }): {
    phase: VisibilityPhase;
    hoursUntilStart: number;
    networkVisibleAt: Date | null;
  } {
    const now = new Date();
    const startTime = new Date(shift.startTime);
    const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Shift has started
    if (hoursUntilStart < 0) {
      return {
        phase: VisibilityPhase.CLOSED,
        hoursUntilStart,
        networkVisibleAt: null,
      };
    }

    // Not in a network or cross-restaurant shifts disabled
    if (
      !shift.restaurant.networkId ||
      !shift.restaurant.network?.enableCrossRestaurantShifts
    ) {
      return {
        phase: VisibilityPhase.OWN_RESTAURANT,
        hoursUntilStart,
        networkVisibleAt: null,
      };
    }

    const visibilityHours = shift.restaurant.networkVisibilityHours || 2;

    if (hoursUntilStart < visibilityHours) {
      // Within own-restaurant-only window
      return {
        phase: VisibilityPhase.OWN_RESTAURANT,
        hoursUntilStart,
        networkVisibleAt: null, // Network window has closed
      };
    }

    // Network visible
    const networkCloseTime = new Date(
      startTime.getTime() - visibilityHours * 60 * 60 * 1000,
    );

    return {
      phase: VisibilityPhase.NETWORK,
      hoursUntilStart,
      networkVisibleAt: now, // Currently visible to network
    };
  }

  /**
   * Get shifts grouped by visibility phase for a restaurant
   *
   * @param restaurantId - Restaurant ID
   * @returns Shifts grouped by visibility phase
   */
  async getShiftsByVisibilityPhase(restaurantId: string): Promise<{
    ownRestaurantOnly: any[];
    networkVisible: any[];
    closed: any[];
  }> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { network: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const now = new Date();
    const visibilityHours = restaurant.networkVisibilityHours || 2;
    const visibilityThreshold = new Date(
      now.getTime() + visibilityHours * 60 * 60 * 1000,
    );

    // Get all open shifts
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        status: 'PUBLISHED_UNASSIGNED',
      },
      orderBy: { startTime: 'asc' },
    });

    const result = {
      ownRestaurantOnly: [] as any[],
      networkVisible: [] as any[],
      closed: [] as any[],
    };

    for (const shift of shifts) {
      const phase = this.getShiftVisibilityPhase({
        ...shift,
        restaurant: {
          networkId: restaurant.networkId,
          networkVisibilityHours: restaurant.networkVisibilityHours,
          network: restaurant.network,
        },
      });

      const shiftWithPhase = {
        ...shift,
        visibilityPhase: phase.phase,
        hoursUntilStart: phase.hoursUntilStart,
      };

      switch (phase.phase) {
        case VisibilityPhase.OWN_RESTAURANT:
          result.ownRestaurantOnly.push(shiftWithPhase);
          break;
        case VisibilityPhase.NETWORK:
          result.networkVisible.push(shiftWithPhase);
          break;
        case VisibilityPhase.CLOSED:
          result.closed.push(shiftWithPhase);
          break;
      }
    }

    return result;
  }

  /**
   * Get workers who can see a specific shift
   *
   * Useful for managers to understand potential coverage.
   *
   * @param shiftId - Shift ID
   * @returns List of workers who can see this shift
   */
  async getWorkersWhoCanSeeShift(shiftId: string): Promise<{
    ownRestaurantWorkers: any[];
    networkWorkers: any[];
    totalEligible: number;
  }> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: {
          include: { network: true },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    // Get own restaurant workers qualified for this position
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
          },
        },
      },
    });

    const result = {
      ownRestaurantWorkers: ownWorkers,
      networkWorkers: [] as any[],
      totalEligible: ownWorkers.length,
    };

    // Check if network visibility applies
    const phase = this.getShiftVisibilityPhase({
      ...shift,
      restaurant: {
        networkId: shift.restaurant.networkId,
        networkVisibilityHours: shift.restaurant.networkVisibilityHours,
        network: shift.restaurant.network,
      },
    });

    if (
      phase.phase === VisibilityPhase.NETWORK &&
      shift.restaurant.networkId &&
      shift.restaurant.network?.enableCrossRestaurantShifts
    ) {
      // Get network workers
      const network = shift.restaurant.network;

      // Get restaurants in the network
      const networkRestaurants = await this.prisma.restaurant.findMany({
        where: {
          networkId: shift.restaurant.networkId,
          id: { not: shift.restaurantId },
        },
        select: { id: true, lat: true, lng: true },
      });

      // Filter by distance
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
        // Get workers from eligible restaurants
        const networkWorkers = await this.prisma.workerProfile.findMany({
          where: {
            restaurantId: { in: eligibleRestaurantIds },
            status: 'ACTIVE',
            positions: { has: shift.position },
            reliabilityScore: { gte: Number(network.minNetworkReputationScore) },
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            restaurant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        result.networkWorkers = networkWorkers;
        result.totalEligible += networkWorkers.length;
      }
    }

    return result;
  }
}
