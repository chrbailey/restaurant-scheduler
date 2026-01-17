import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import {
  calculateDistance,
  estimateCommuteTime,
  canCommuteBetweenShifts,
  CommuteConfig,
  DEFAULT_COMMUTE_CONFIG,
} from '@/common/utils/distance.util';

/**
 * Configuration for conflict detection rules
 */
export interface ConflictConfig {
  /** Minimum minutes between shifts at the same location */
  minBreakSameLocation: number;
  /** Maximum hours a worker can work per day across all restaurants */
  maxHoursPerDay: number;
  /** Maximum hours a worker can work per week across all restaurants */
  maxHoursPerWeek: number;
  /** Commute configuration for travel time estimation */
  commute: CommuteConfig;
}

/**
 * Default conflict detection configuration
 */
export const DEFAULT_CONFLICT_CONFIG: ConflictConfig = {
  minBreakSameLocation: 30, // 30 minutes between shifts at same location
  maxHoursPerDay: 12,
  maxHoursPerWeek: 50,
  commute: DEFAULT_COMMUTE_CONFIG,
};

/**
 * Shift conflict information
 */
export interface ShiftConflict {
  type: 'OVERLAP' | 'COMMUTE' | 'MAX_HOURS_DAY' | 'MAX_HOURS_WEEK' | 'SAME_LOCATION_BREAK';
  message: string;
  conflictingShiftId?: string;
  details?: Record<string, any>;
}

/**
 * Proposed shift information for conflict checking
 */
export interface ProposedShift {
  startTime: Date;
  endTime: Date;
  restaurantId: string;
  position?: string;
}

/**
 * Result of shift validation
 */
export interface ValidationResult {
  valid: boolean;
  conflicts: ShiftConflict[];
  warnings: string[];
}

/**
 * Conflict Detector Service
 *
 * Detects scheduling conflicts for workers who may work at multiple restaurants
 * across a network. Implements rules for:
 * - Overlapping shifts
 * - Commute time between locations
 * - Maximum hours per day/week
 * - Minimum break time between shifts
 */
@Injectable()
export class ConflictDetectorService {
  private readonly logger = new Logger(ConflictDetectorService.name);
  private config: ConflictConfig = DEFAULT_CONFLICT_CONFIG;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Update conflict detection configuration
   */
  setConfig(config: Partial<ConflictConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Detect all shift conflicts for a proposed shift
   *
   * @param workerId - Worker profile ID
   * @param proposedShift - The shift being considered
   * @returns Array of detected conflicts
   */
  async detectShiftConflicts(
    workerId: string,
    proposedShift: ProposedShift,
  ): Promise<ShiftConflict[]> {
    const conflicts: ShiftConflict[] = [];

    // Get worker's existing shifts for the day
    const existingShifts = await this.getWorkerScheduleForDate(
      workerId,
      proposedShift.startTime,
    );

    // Get the proposed shift's restaurant location
    const proposedRestaurant = await this.prisma.restaurant.findUnique({
      where: { id: proposedShift.restaurantId },
      select: { id: true, lat: true, lng: true, name: true },
    });

    if (!proposedRestaurant) {
      throw new BadRequestException('Restaurant not found');
    }

    // Check for overlapping shifts
    for (const shift of existingShifts) {
      const overlap = this.checkTimeOverlap(
        proposedShift.startTime,
        proposedShift.endTime,
        new Date(shift.startTime),
        new Date(shift.endTime),
      );

      if (overlap) {
        conflicts.push({
          type: 'OVERLAP',
          message: `Shift overlaps with existing shift at ${shift.restaurant.name}`,
          conflictingShiftId: shift.id,
          details: {
            existingStart: shift.startTime,
            existingEnd: shift.endTime,
          },
        });
      }
    }

    // Check for commute conflicts
    for (const shift of existingShifts) {
      // Skip if already found overlapping
      if (conflicts.some((c) => c.conflictingShiftId === shift.id && c.type === 'OVERLAP')) {
        continue;
      }

      const commuteConflict = await this.detectCommuteConflict(
        workerId,
        {
          startTime: new Date(shift.startTime),
          endTime: new Date(shift.endTime),
          restaurantId: shift.restaurantId,
        },
        proposedShift,
      );

      if (commuteConflict) {
        conflicts.push({
          ...commuteConflict,
          conflictingShiftId: shift.id,
        });
      }
    }

    // Check same-location break time
    const sameLocationShifts = existingShifts.filter(
      (s) => s.restaurantId === proposedShift.restaurantId,
    );

    for (const shift of sameLocationShifts) {
      const breakConflict = this.checkSameLocationBreak(
        proposedShift,
        {
          startTime: new Date(shift.startTime),
          endTime: new Date(shift.endTime),
          restaurantId: shift.restaurantId,
        },
      );

      if (breakConflict && !conflicts.some((c) => c.conflictingShiftId === shift.id)) {
        conflicts.push({
          ...breakConflict,
          conflictingShiftId: shift.id,
        });
      }
    }

    // Check max hours per day
    const dayHoursConflict = await this.checkMaxHoursPerDay(workerId, proposedShift);
    if (dayHoursConflict) {
      conflicts.push(dayHoursConflict);
    }

    // Check max hours per week
    const weekHoursConflict = await this.checkMaxHoursPerWeek(workerId, proposedShift);
    if (weekHoursConflict) {
      conflicts.push(weekHoursConflict);
    }

    return conflicts;
  }

  /**
   * Check if a worker can physically get between two shifts
   *
   * @param workerId - Worker profile ID
   * @param shift1 - First shift (earlier)
   * @param shift2 - Second shift (later)
   * @returns Commute conflict if detected, null otherwise
   */
  async detectCommuteConflict(
    workerId: string,
    shift1: ProposedShift,
    shift2: ProposedShift,
  ): Promise<ShiftConflict | null> {
    // Determine which shift is first chronologically
    let earlier: ProposedShift;
    let later: ProposedShift;

    if (shift1.startTime <= shift2.startTime) {
      earlier = shift1;
      later = shift2;
    } else {
      earlier = shift2;
      later = shift1;
    }

    // If shifts don't have adjacent timing, no commute check needed
    const gapMinutes =
      (later.startTime.getTime() - earlier.endTime.getTime()) / (1000 * 60);

    if (gapMinutes < 0) {
      // Overlapping shifts - handled separately
      return null;
    }

    // Get restaurant locations
    const [restaurant1, restaurant2] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: earlier.restaurantId },
        select: { lat: true, lng: true, name: true },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: later.restaurantId },
        select: { lat: true, lng: true, name: true },
      }),
    ]);

    if (!restaurant1 || !restaurant2) {
      return null;
    }

    // Same location - use same-location break rules instead
    if (earlier.restaurantId === later.restaurantId) {
      return null;
    }

    // Calculate distance and commute time
    const distance = calculateDistance(
      Number(restaurant1.lat),
      Number(restaurant1.lng),
      Number(restaurant2.lat),
      Number(restaurant2.lng),
    );

    const commuteResult = canCommuteBetweenShifts(
      earlier.endTime,
      later.startTime,
      distance,
      this.config.commute,
    );

    if (!commuteResult.canCommute) {
      return {
        type: 'COMMUTE',
        message: `Insufficient time to commute from ${restaurant1.name} to ${restaurant2.name}`,
        details: {
          distanceMiles: Math.round(distance * 10) / 10,
          estimatedCommuteMinutes: commuteResult.estimatedCommuteMinutes,
          availableMinutes: commuteResult.availableMinutes,
          shortfall: Math.abs(commuteResult.bufferMinutes),
        },
      };
    }

    return null;
  }

  /**
   * Get all shifts for a worker on a specific date across all restaurants
   *
   * @param workerId - Worker profile ID
   * @param date - The date to check
   * @returns Array of shifts
   */
  async getWorkerScheduleForDate(
    workerId: string,
    date: Date,
  ) {
    // Get start and end of day
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Get all worker profiles for this user across all restaurants
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      select: { userId: true },
    });

    if (!workerProfile) {
      return [];
    }

    // Get all profiles for this user (they may work at multiple restaurants)
    const allProfiles = await this.prisma.workerProfile.findMany({
      where: { userId: workerProfile.userId },
      select: { id: true },
    });

    const profileIds = allProfiles.map((p) => p.id);

    // Get all shifts for these profiles on this day
    const shifts = await this.prisma.shift.findMany({
      where: {
        assignedToId: { in: profileIds },
        status: { in: ['CONFIRMED', 'IN_PROGRESS', 'PUBLISHED_CLAIMED'] },
        OR: [
          {
            startTime: { gte: dayStart, lte: dayEnd },
          },
          {
            endTime: { gte: dayStart, lte: dayEnd },
          },
          {
            startTime: { lte: dayStart },
            endTime: { gte: dayEnd },
          },
        ],
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return shifts;
  }

  /**
   * Get all shifts for a worker in a date range across all restaurants
   */
  async getWorkerScheduleForRange(
    workerId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      select: { userId: true },
    });

    if (!workerProfile) {
      return [];
    }

    const allProfiles = await this.prisma.workerProfile.findMany({
      where: { userId: workerProfile.userId },
      select: { id: true },
    });

    const profileIds = allProfiles.map((p) => p.id);

    return this.prisma.shift.findMany({
      where: {
        assignedToId: { in: profileIds },
        status: { in: ['CONFIRMED', 'IN_PROGRESS', 'PUBLISHED_CLAIMED', 'COMPLETED'] },
        startTime: { gte: startDate },
        endTime: { lte: endDate },
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Full validation before assigning a shift to a worker
   *
   * @param workerId - Worker profile ID
   * @param shiftId - Shift ID to validate
   * @returns Validation result with conflicts and warnings
   */
  async validateShiftAssignment(
    workerId: string,
    shiftId: string,
  ): Promise<ValidationResult> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { restaurant: true },
    });

    if (!shift) {
      return {
        valid: false,
        conflicts: [{
          type: 'OVERLAP',
          message: 'Shift not found',
        }],
        warnings: [],
      };
    }

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
    });

    if (!worker) {
      return {
        valid: false,
        conflicts: [{
          type: 'OVERLAP',
          message: 'Worker not found',
        }],
        warnings: [],
      };
    }

    const proposedShift: ProposedShift = {
      startTime: new Date(shift.startTime),
      endTime: new Date(shift.endTime),
      restaurantId: shift.restaurantId,
      position: shift.position,
    };

    const conflicts = await this.detectShiftConflicts(workerId, proposedShift);
    const warnings: string[] = [];

    // Add warnings (non-blocking issues)
    const dayShifts = await this.getWorkerScheduleForDate(workerId, proposedShift.startTime);
    const proposedHours = this.calculateShiftHours(proposedShift.startTime, proposedShift.endTime);
    const currentDayHours = dayShifts.reduce(
      (sum, s) => sum + this.calculateShiftHours(new Date(s.startTime), new Date(s.endTime)),
      0,
    );

    if (currentDayHours + proposedHours > this.config.maxHoursPerDay * 0.8) {
      warnings.push(
        `Worker will be at ${Math.round(((currentDayHours + proposedHours) / this.config.maxHoursPerDay) * 100)}% of daily hour limit`,
      );
    }

    // Check if this is a network shift (different restaurant than home)
    if (worker.restaurantId !== shift.restaurantId) {
      warnings.push('This is a cross-restaurant network shift');
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
      warnings,
    };
  }

  /**
   * Check for time overlap between two periods
   */
  private checkTimeOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Check same-location break time requirement
   */
  private checkSameLocationBreak(
    shift1: ProposedShift,
    shift2: ProposedShift,
  ): ShiftConflict | null {
    if (shift1.restaurantId !== shift2.restaurantId) {
      return null;
    }

    // Determine chronological order
    let earlier: ProposedShift;
    let later: ProposedShift;

    if (shift1.startTime <= shift2.startTime) {
      earlier = shift1;
      later = shift2;
    } else {
      earlier = shift2;
      later = shift1;
    }

    const gapMinutes =
      (later.startTime.getTime() - earlier.endTime.getTime()) / (1000 * 60);

    if (gapMinutes >= 0 && gapMinutes < this.config.minBreakSameLocation) {
      return {
        type: 'SAME_LOCATION_BREAK',
        message: `Less than ${this.config.minBreakSameLocation} minutes break between shifts at same location`,
        details: {
          gapMinutes: Math.floor(gapMinutes),
          requiredMinutes: this.config.minBreakSameLocation,
        },
      };
    }

    return null;
  }

  /**
   * Check max hours per day across all restaurants
   */
  private async checkMaxHoursPerDay(
    workerId: string,
    proposedShift: ProposedShift,
  ): Promise<ShiftConflict | null> {
    const dayShifts = await this.getWorkerScheduleForDate(workerId, proposedShift.startTime);

    const currentHours = dayShifts.reduce(
      (sum, shift) =>
        sum + this.calculateShiftHours(new Date(shift.startTime), new Date(shift.endTime)),
      0,
    );

    const proposedHours = this.calculateShiftHours(
      proposedShift.startTime,
      proposedShift.endTime,
    );

    const totalHours = currentHours + proposedHours;

    if (totalHours > this.config.maxHoursPerDay) {
      return {
        type: 'MAX_HOURS_DAY',
        message: `Exceeds maximum ${this.config.maxHoursPerDay} hours per day`,
        details: {
          currentHours: Math.round(currentHours * 10) / 10,
          proposedHours: Math.round(proposedHours * 10) / 10,
          totalHours: Math.round(totalHours * 10) / 10,
          maxHours: this.config.maxHoursPerDay,
        },
      };
    }

    return null;
  }

  /**
   * Check max hours per week across all restaurants
   */
  private async checkMaxHoursPerWeek(
    workerId: string,
    proposedShift: ProposedShift,
  ): Promise<ShiftConflict | null> {
    // Get start of week (Sunday)
    const weekStart = new Date(proposedShift.startTime);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // Get end of week (Saturday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    const weekShifts = await this.getWorkerScheduleForRange(workerId, weekStart, weekEnd);

    const currentHours = weekShifts.reduce(
      (sum, shift) =>
        sum + this.calculateShiftHours(new Date(shift.startTime), new Date(shift.endTime)),
      0,
    );

    const proposedHours = this.calculateShiftHours(
      proposedShift.startTime,
      proposedShift.endTime,
    );

    const totalHours = currentHours + proposedHours;

    if (totalHours > this.config.maxHoursPerWeek) {
      return {
        type: 'MAX_HOURS_WEEK',
        message: `Exceeds maximum ${this.config.maxHoursPerWeek} hours per week`,
        details: {
          currentHours: Math.round(currentHours * 10) / 10,
          proposedHours: Math.round(proposedHours * 10) / 10,
          totalHours: Math.round(totalHours * 10) / 10,
          maxHours: this.config.maxHoursPerWeek,
        },
      };
    }

    return null;
  }

  /**
   * Calculate hours for a shift
   */
  private calculateShiftHours(startTime: Date, endTime: Date): number {
    return (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Get scheduling summary for a worker (useful for UI)
   */
  async getWorkerSchedulingSummary(
    workerId: string,
    date: Date,
  ): Promise<{
    dayShifts: any[];
    weekShifts: any[];
    hoursToday: number;
    hoursThisWeek: number;
    maxHoursDay: number;
    maxHoursWeek: number;
    remainingHoursToday: number;
    remainingHoursWeek: number;
  }> {
    // Get start of week
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    const [dayShifts, weekShifts] = await Promise.all([
      this.getWorkerScheduleForDate(workerId, date),
      this.getWorkerScheduleForRange(workerId, weekStart, weekEnd),
    ]);

    const hoursToday = dayShifts.reduce(
      (sum, s) => sum + this.calculateShiftHours(new Date(s.startTime), new Date(s.endTime)),
      0,
    );

    const hoursThisWeek = weekShifts.reduce(
      (sum, s) => sum + this.calculateShiftHours(new Date(s.startTime), new Date(s.endTime)),
      0,
    );

    return {
      dayShifts,
      weekShifts,
      hoursToday: Math.round(hoursToday * 10) / 10,
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
      maxHoursDay: this.config.maxHoursPerDay,
      maxHoursWeek: this.config.maxHoursPerWeek,
      remainingHoursToday: Math.max(0, this.config.maxHoursPerDay - hoursToday),
      remainingHoursWeek: Math.max(0, this.config.maxHoursPerWeek - hoursThisWeek),
    };
  }
}
