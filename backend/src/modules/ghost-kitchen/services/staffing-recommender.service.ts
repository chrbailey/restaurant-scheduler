import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DemandForecasterService, DailyForecast } from './demand-forecaster.service';
import { OpportunityDetectorService, OpportunityWindow, OpportunityStatus } from './opportunity-detector.service';
import { Position, ShiftType, ShiftStatus } from '@restaurant-scheduler/shared';

/**
 * Staffing Recommender Service
 *
 * AI-suggested staffing based on demand forecasts.
 * Recommends shift adjustments and creates ghost kitchen shifts.
 */

export interface StaffingRecommendation {
  date: string;
  totalRecommendedStaff: number;
  byHour: HourlyStaffing[];
  suggestedShifts: SuggestedShift[];
  adjustments: ShiftAdjustment[];
}

export interface HourlyStaffing {
  hour: number;
  deliveryForecast: number;
  dineInForecast: number;
  recommendedDeliveryStaff: number;
  recommendedDineInStaff: number;
  totalRecommended: number;
  currentScheduled: number;
  staffingGap: number;
}

export interface SuggestedShift {
  position: string;
  startHour: number;
  endHour: number;
  type: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

export interface ShiftAdjustment {
  type: 'ADD' | 'REMOVE' | 'EXTEND' | 'REDUCE';
  existingShiftId?: string;
  position: string;
  originalStartHour?: number;
  originalEndHour?: number;
  suggestedStartHour: number;
  suggestedEndHour: number;
  reason: string;
}

export interface AvailableWorker {
  workerProfileId: string;
  userId: string;
  firstName: string;
  lastName: string;
  positions: string[];
  reliabilityScore: number;
  shiftsCompleted: number;
  isAvailable: boolean;
  availabilityNote?: string;
}

@Injectable()
export class StaffingRecommenderService {
  private readonly logger = new Logger(StaffingRecommenderService.name);

  // Staffing ratios
  private readonly ORDERS_PER_DELIVERY_STAFF_HOUR = 8; // Pack/prep
  private readonly COVERS_PER_SERVER_HOUR = 15;
  private readonly COVERS_PER_BARTENDER_HOUR = 20;
  private readonly COVERS_PER_LINE_COOK_HOUR = 25;

  // Pack station capacity
  private readonly PACK_STATIONS = 2; // Typical ghost kitchen setup
  private readonly ORDERS_PER_STATION_HOUR = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecaster: DemandForecasterService,
    private readonly opportunityDetector: OpportunityDetectorService,
  ) {}

  /**
   * Get comprehensive staffing recommendation for a date
   */
  async getStaffingRecommendation(
    restaurantId: string,
    date: Date,
  ): Promise<StaffingRecommendation> {
    const dateString = date.toISOString().split('T')[0];

    // Get forecast for the day
    const forecasts = await this.forecaster.forecastDemand(
      restaurantId,
      date,
    );

    // Get current scheduled shifts
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const scheduledShifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { notIn: [ShiftStatus.CANCELLED] },
      },
      include: {
        assignedTo: {
          include: { user: true },
        },
      },
    });

    // Calculate hourly staffing needs
    const hourlyStaffing: HourlyStaffing[] = [];
    const suggestedShifts: SuggestedShift[] = [];
    const adjustments: ShiftAdjustment[] = [];

    for (const forecast of forecasts) {
      const deliveryStaff = this.getDeliveryStaffNeeded(forecast.deliveryForecast);
      const dineInStaff = this.getDineInStaffNeeded(forecast.dineInForecast);

      // Count currently scheduled staff for this hour
      const scheduledForHour = scheduledShifts.filter(shift => {
        const shiftStart = new Date(shift.startTime).getHours();
        const shiftEnd = new Date(shift.endTime).getHours();
        return forecast.hour >= shiftStart && forecast.hour < shiftEnd;
      });

      const currentScheduled = scheduledForHour.length;
      const totalNeeded = deliveryStaff + dineInStaff;

      hourlyStaffing.push({
        hour: forecast.hour,
        deliveryForecast: forecast.deliveryForecast,
        dineInForecast: forecast.dineInForecast,
        recommendedDeliveryStaff: deliveryStaff,
        recommendedDineInStaff: dineInStaff,
        totalRecommended: totalNeeded,
        currentScheduled,
        staffingGap: totalNeeded - currentScheduled,
      });
    }

    // Identify shifts to suggest based on gaps
    const gaps = this.findConsecutiveGaps(hourlyStaffing);

    for (const gap of gaps) {
      // Determine position needed
      const avgDeliveryGap = gap.hours.reduce(
        (sum, h) => sum + h.recommendedDeliveryStaff, 0
      ) / gap.hours.length;

      const avgDineInGap = gap.hours.reduce(
        (sum, h) => sum + h.recommendedDineInStaff, 0
      ) / gap.hours.length;

      if (avgDeliveryGap > avgDineInGap) {
        suggestedShifts.push({
          position: Position.DELIVERY_PACK,
          startHour: gap.startHour,
          endHour: gap.endHour,
          type: ShiftType.GHOST_KITCHEN,
          priority: gap.avgGap >= 2 ? 'HIGH' : 'MEDIUM',
          reason: `Delivery forecast indicates ${Math.round(gap.avgGap)} additional staff needed`,
        });
      } else if (avgDineInGap > 0) {
        suggestedShifts.push({
          position: Position.SERVER,
          startHour: gap.startHour,
          endHour: gap.endHour,
          type: ShiftType.DINE_IN,
          priority: gap.avgGap >= 2 ? 'HIGH' : 'MEDIUM',
          reason: `Dine-in forecast indicates ${Math.round(gap.avgGap)} additional staff needed`,
        });
      }
    }

    // Identify overstaffed periods for adjustments
    const overstaffed = hourlyStaffing.filter(h => h.staffingGap < -1);
    for (const hour of overstaffed) {
      const overstaffedShifts = scheduledShifts.filter(shift => {
        const shiftStart = new Date(shift.startTime).getHours();
        const shiftEnd = new Date(shift.endTime).getHours();
        return hour.hour >= shiftStart && hour.hour < shiftEnd;
      });

      if (overstaffedShifts.length > 0) {
        adjustments.push({
          type: 'REDUCE',
          existingShiftId: overstaffedShifts[0].id,
          position: overstaffedShifts[0].position,
          originalStartHour: new Date(overstaffedShifts[0].startTime).getHours(),
          originalEndHour: new Date(overstaffedShifts[0].endTime).getHours(),
          suggestedStartHour: hour.hour + 1,
          suggestedEndHour: new Date(overstaffedShifts[0].endTime).getHours(),
          reason: `Overstaffed by ${Math.abs(hour.staffingGap)} at ${hour.hour}:00`,
        });
      }
    }

    const totalRecommended = Math.max(
      ...hourlyStaffing.map(h => h.totalRecommended)
    );

    return {
      date: dateString,
      totalRecommendedStaff: totalRecommended,
      byHour: hourlyStaffing,
      suggestedShifts,
      adjustments,
    };
  }

  /**
   * Calculate delivery staff needed for forecasted orders
   */
  getDeliveryStaffNeeded(forecastedOrders: number): number {
    if (forecastedOrders <= 0) return 0;

    // Calculate based on orders per staff hour
    const baseStaff = forecastedOrders / this.ORDERS_PER_DELIVERY_STAFF_HOUR;

    // Consider pack station capacity
    const stationLimit = this.PACK_STATIONS * this.ORDERS_PER_STATION_HOUR;
    const stationStaff = forecastedOrders / stationLimit * this.PACK_STATIONS;

    // Take the higher requirement
    const needed = Math.max(baseStaff, stationStaff);

    return Math.ceil(needed);
  }

  /**
   * Calculate dine-in staff needed
   */
  private getDineInStaffNeeded(forecastedCovers: number): number {
    if (forecastedCovers <= 0) return 0;

    // Servers are the primary constraint
    const servers = forecastedCovers / this.COVERS_PER_SERVER_HOUR;

    return Math.ceil(servers);
  }

  /**
   * Suggest shift adjustments based on forecast vs scheduled
   */
  async suggestShiftAdjustments(
    restaurantId: string,
    forecast: DailyForecast,
  ): Promise<ShiftAdjustment[]> {
    const recommendation = await this.getStaffingRecommendation(
      restaurantId,
      new Date(forecast.date),
    );

    return recommendation.adjustments;
  }

  /**
   * Find workers with DELIVERY_PACK position available for a time slot
   */
  async findAvailableDeliveryWorkers(
    restaurantId: string,
    date: Date,
    startHour: number,
    endHour: number,
  ): Promise<AvailableWorker[]> {
    const dayOfWeek = date.getDay();

    // Find workers with DELIVERY_PACK position
    const workers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        positions: { has: Position.DELIVERY_PACK },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        availability: {
          where: {
            dayOfWeek,
            effectiveFrom: { lte: date },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gte: date } },
            ],
          },
        },
      },
      orderBy: {
        reliabilityScore: 'desc',
      },
    });

    // Check for conflicting shifts
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingShifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { notIn: [ShiftStatus.CANCELLED] },
      },
      select: {
        assignedToId: true,
        startTime: true,
        endTime: true,
      },
    });

    // Check time-off requests
    const timeOff = await this.prisma.timeOffRequest.findMany({
      where: {
        workerProfile: {
          restaurantId,
          positions: { has: Position.DELIVERY_PACK },
        },
        status: 'APPROVED',
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: {
        workerProfileId: true,
      },
    });

    const timeOffIds = new Set(timeOff.map(t => t.workerProfileId));

    const availableWorkers: AvailableWorker[] = [];

    for (const worker of workers) {
      // Check if on time off
      if (timeOffIds.has(worker.id)) {
        availableWorkers.push({
          workerProfileId: worker.id,
          userId: worker.userId,
          firstName: worker.user.firstName,
          lastName: worker.user.lastName,
          positions: worker.positions,
          reliabilityScore: Number(worker.reliabilityScore),
          shiftsCompleted: worker.shiftsCompleted,
          isAvailable: false,
          availabilityNote: 'On approved time off',
        });
        continue;
      }

      // Check for conflicting shift
      const conflictingShift = existingShifts.find(shift => {
        if (shift.assignedToId !== worker.id) return false;
        const shiftStart = new Date(shift.startTime).getHours();
        const shiftEnd = new Date(shift.endTime).getHours();
        return (startHour < shiftEnd && endHour > shiftStart);
      });

      if (conflictingShift) {
        availableWorkers.push({
          workerProfileId: worker.id,
          userId: worker.userId,
          firstName: worker.user.firstName,
          lastName: worker.user.lastName,
          positions: worker.positions,
          reliabilityScore: Number(worker.reliabilityScore),
          shiftsCompleted: worker.shiftsCompleted,
          isAvailable: false,
          availabilityNote: 'Has conflicting shift',
        });
        continue;
      }

      // Check availability preferences
      const hasAvailability = worker.availability.some(a => {
        const availStart = parseInt(a.startTime.split(':')[0], 10);
        const availEnd = parseInt(a.endTime.split(':')[0], 10);
        return startHour >= availStart && endHour <= availEnd;
      });

      availableWorkers.push({
        workerProfileId: worker.id,
        userId: worker.userId,
        firstName: worker.user.firstName,
        lastName: worker.user.lastName,
        positions: worker.positions,
        reliabilityScore: Number(worker.reliabilityScore),
        shiftsCompleted: worker.shiftsCompleted,
        isAvailable: true,
        availabilityNote: hasAvailability ? 'Within preferred availability' : 'Outside preferred hours',
      });
    }

    // Sort: available first, then by reliability score
    availableWorkers.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) {
        return a.isAvailable ? -1 : 1;
      }
      return b.reliabilityScore - a.reliabilityScore;
    });

    return availableWorkers;
  }

  /**
   * Auto-create ghost kitchen shifts for an opportunity
   */
  async autoCreateGhostShifts(
    restaurantId: string,
    opportunity: OpportunityWindow,
    createdByUserId: string,
    options: {
      autoAssign?: boolean;
      notifyWorkers?: boolean;
    } = {},
  ): Promise<string[]> {
    const { autoAssign = false, notifyWorkers = true } = options;

    const date = new Date(opportunity.date);
    date.setHours(opportunity.startHour, 0, 0, 0);

    const endDate = new Date(opportunity.date);
    endDate.setHours(opportunity.endHour, 0, 0, 0);

    const createdShiftIds: string[] = [];

    // Determine number of shifts needed
    const shiftsNeeded = opportunity.recommendedStaff;

    for (let i = 0; i < shiftsNeeded; i++) {
      const shift = await this.prisma.shift.create({
        data: {
          restaurantId,
          position: Position.DELIVERY_PACK,
          status: autoAssign ? ShiftStatus.PUBLISHED_OFFERED : ShiftStatus.PUBLISHED_UNASSIGNED,
          type: ShiftType.GHOST_KITCHEN,
          startTime: date,
          endTime: endDate,
          breakMinutes: opportunity.endHour - opportunity.startHour >= 6 ? 30 : 0,
          autoApprove: true, // Ghost kitchen shifts typically auto-approve
          createdById: createdByUserId,
          notes: `Ghost kitchen opportunity shift - Forecasted ${opportunity.forecastedDelivery} orders`,
        },
      });

      // Record status history
      await this.prisma.shiftStatusHistory.create({
        data: {
          shiftId: shift.id,
          fromStatus: 'NONE',
          toStatus: shift.status,
          changedBy: createdByUserId,
          reason: 'Auto-created from ghost kitchen opportunity',
        },
      });

      createdShiftIds.push(shift.id);

      // Auto-assign if requested
      if (autoAssign) {
        const availableWorkers = await this.findAvailableDeliveryWorkers(
          restaurantId,
          date,
          opportunity.startHour,
          opportunity.endHour,
        );

        const topWorker = availableWorkers.find(w => w.isAvailable);
        if (topWorker) {
          await this.prisma.shift.update({
            where: { id: shift.id },
            data: {
              assignedToId: topWorker.workerProfileId,
              status: ShiftStatus.CONFIRMED,
            },
          });

          await this.prisma.shiftStatusHistory.create({
            data: {
              shiftId: shift.id,
              fromStatus: ShiftStatus.PUBLISHED_OFFERED,
              toStatus: ShiftStatus.CONFIRMED,
              changedBy: 'SYSTEM',
              reason: 'Auto-assigned to highest rated available worker',
            },
          });
        }
      }
    }

    this.logger.log(
      `Created ${createdShiftIds.length} ghost kitchen shifts for opportunity ` +
      `on ${date.toISOString()} (${opportunity.startHour}:00-${opportunity.endHour}:00)`,
    );

    // Update opportunity status
    if (opportunity.id) {
      await this.prisma.opportunityWindow.update({
        where: { id: opportunity.id },
        data: { status: OpportunityStatus.IN_PROGRESS },
      });
    }

    return createdShiftIds;
  }

  /**
   * Find consecutive gaps in staffing
   */
  private findConsecutiveGaps(
    hourlyStaffing: HourlyStaffing[],
  ): Array<{
    startHour: number;
    endHour: number;
    hours: HourlyStaffing[];
    avgGap: number;
  }> {
    const gaps: Array<{
      startHour: number;
      endHour: number;
      hours: HourlyStaffing[];
      avgGap: number;
    }> = [];

    let currentGap: HourlyStaffing[] = [];
    let startHour: number | null = null;

    for (const hour of hourlyStaffing) {
      if (hour.staffingGap > 0) {
        if (startHour === null) {
          startHour = hour.hour;
        }
        currentGap.push(hour);
      } else if (currentGap.length > 0) {
        // End of gap
        if (currentGap.length >= 2) { // At least 2 hour gap
          const avgGap = currentGap.reduce((sum, h) => sum + h.staffingGap, 0) / currentGap.length;
          gaps.push({
            startHour: startHour!,
            endHour: hour.hour,
            hours: currentGap,
            avgGap,
          });
        }
        currentGap = [];
        startHour = null;
      }
    }

    // Check final gap
    if (currentGap.length >= 2) {
      const avgGap = currentGap.reduce((sum, h) => sum + h.staffingGap, 0) / currentGap.length;
      gaps.push({
        startHour: startHour!,
        endHour: currentGap[currentGap.length - 1].hour + 1,
        hours: currentGap,
        avgGap,
      });
    }

    return gaps;
  }
}
