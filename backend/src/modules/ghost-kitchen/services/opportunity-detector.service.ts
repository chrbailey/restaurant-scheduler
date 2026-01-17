import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { NotificationService } from '@/modules/notification/services/notification.service';
import { DemandForecasterService, HourlyForecast } from './demand-forecaster.service';
import { NotificationType } from '@restaurant-scheduler/shared';

/**
 * Opportunity Detector Service
 *
 * Identifies optimal ghost kitchen windows based on:
 * - Low dine-in forecast
 * - High delivery demand forecast
 * - Available staffing
 * - Kitchen capacity
 */

export enum OpportunityStatus {
  SUGGESTED = 'SUGGESTED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface OpportunityWindow {
  id?: string;
  restaurantId: string;
  date: Date;
  startHour: number;
  endHour: number;
  score: number;
  status: OpportunityStatus;
  forecastedDineIn: number;
  forecastedDelivery: number;
  recommendedStaff: number;
  potentialRevenue: number;
  confidence: number;
}

export interface OpportunityCriteria {
  /** Dine-in must be below this % of capacity */
  maxDineInCapacityPercent: number;
  /** Minimum delivery orders forecasted per hour */
  minDeliveryOrdersPerHour: number;
  /** Minimum window duration in hours */
  minWindowHours: number;
  /** Minimum confidence level */
  minConfidence: number;
  /** Average revenue per delivery order */
  avgDeliveryOrderRevenue: number;
}

const DEFAULT_CRITERIA: OpportunityCriteria = {
  maxDineInCapacityPercent: 50,
  minDeliveryOrdersPerHour: 5,
  minWindowHours: 2,
  minConfidence: 0.5,
  avgDeliveryOrderRevenue: 35, // $35 average order
};

@Injectable()
export class OpportunityDetectorService {
  private readonly logger = new Logger(OpportunityDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly forecaster: DemandForecasterService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Detect ghost kitchen opportunities for a date range
   */
  async detectOpportunities(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
    criteria: Partial<OpportunityCriteria> = {},
  ): Promise<OpportunityWindow[]> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new Error(`Restaurant not found: ${restaurantId}`);
    }

    if (!restaurant.ghostKitchenEnabled) {
      this.logger.debug(`Ghost kitchen not enabled for ${restaurantId}`);
      return [];
    }

    const activeCriteria = { ...DEFAULT_CRITERIA, ...criteria };
    const opportunities: OpportunityWindow[] = [];

    // Get operating hours for capacity calculation
    const operatingHours = await this.prisma.operatingHours.findMany({
      where: { restaurantId },
    });

    // Estimate capacity (would come from restaurant settings in production)
    const estimatedCapacity = 50; // Seats

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dayHours = operatingHours.find(h => h.dayOfWeek === dayOfWeek);

      if (dayHours?.isClosed) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Get forecast for this day
      const forecast = await this.forecaster.forecastDemand(
        restaurantId,
        new Date(currentDate),
      );

      // Find consecutive hours that meet criteria
      const windows = this.findOpportunityWindows(
        forecast,
        estimatedCapacity,
        activeCriteria,
        dayHours,
      );

      for (const window of windows) {
        const opportunity: OpportunityWindow = {
          restaurantId,
          date: new Date(currentDate),
          startHour: window.startHour,
          endHour: window.endHour,
          score: this.scoreOpportunity(window, activeCriteria),
          status: OpportunityStatus.SUGGESTED,
          forecastedDineIn: window.totalDineIn,
          forecastedDelivery: window.totalDelivery,
          recommendedStaff: this.calculateRecommendedStaff(window.totalDelivery, window.hours),
          potentialRevenue: window.totalDelivery * activeCriteria.avgDeliveryOrderRevenue,
          confidence: window.avgConfidence,
        };

        opportunities.push(opportunity);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by score (highest first)
    opportunities.sort((a, b) => b.score - a.score);

    return opportunities;
  }

  /**
   * Score an opportunity window (0-100)
   */
  scoreOpportunity(
    window: {
      totalDelivery: number;
      totalDineIn: number;
      hours: number;
      avgConfidence: number;
    },
    criteria: OpportunityCriteria,
  ): number {
    let score = 0;

    // Delivery volume score (0-40 points)
    const deliveryPerHour = window.totalDelivery / window.hours;
    const deliveryScore = Math.min(40, (deliveryPerHour / 15) * 40); // Max at 15 orders/hour
    score += deliveryScore;

    // Low dine-in score (0-25 points)
    const dineInPerHour = window.totalDineIn / window.hours;
    const dineInScore = Math.max(0, 25 - dineInPerHour);
    score += dineInScore;

    // Window duration score (0-15 points)
    const durationScore = Math.min(15, (window.hours / 4) * 15); // Max at 4 hours
    score += durationScore;

    // Confidence score (0-20 points)
    const confidenceScore = window.avgConfidence * 20;
    score += confidenceScore;

    return Math.round(score);
  }

  /**
   * Get upcoming opportunities for next 7 days
   */
  async getUpcomingOpportunities(restaurantId: string): Promise<OpportunityWindow[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    // Check for existing suggestions in database
    const existingOpportunities = await this.prisma.opportunityWindow.findMany({
      where: {
        restaurantId,
        date: { gte: startDate },
        status: { in: ['SUGGESTED', 'ACCEPTED'] },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    if (existingOpportunities.length > 0) {
      return existingOpportunities.map(o => ({
        id: o.id,
        restaurantId: o.restaurantId,
        date: o.date,
        startHour: this.timeToHour(o.startTime),
        endHour: this.timeToHour(o.endTime),
        score: o.score,
        status: o.status as OpportunityStatus,
        forecastedDineIn: 0, // Not stored in current schema
        forecastedDelivery: o.forecastedOrders,
        recommendedStaff: o.recommendedStaff,
        potentialRevenue: o.forecastedOrders * 35,
        confidence: 0.7, // Not stored
      }));
    }

    // Generate new opportunities if none exist
    return this.detectOpportunities(restaurantId, startDate, endDate);
  }

  /**
   * Create and store an opportunity alert
   */
  async createOpportunityAlert(
    restaurantId: string,
    window: OpportunityWindow,
  ): Promise<string> {
    // Store in database
    const opportunity = await this.prisma.opportunityWindow.create({
      data: {
        restaurantId,
        date: window.date,
        startTime: this.hourToTime(window.startHour),
        endTime: this.hourToTime(window.endHour),
        score: window.score,
        status: OpportunityStatus.SUGGESTED,
        forecastedOrders: window.forecastedDelivery,
        recommendedStaff: window.recommendedStaff,
        notifiedAt: new Date(),
      },
    });

    // Notify managers
    await this.notifyManagers(restaurantId, opportunity.id, window);

    this.logger.log(
      `Created opportunity alert ${opportunity.id} for ${restaurantId} ` +
      `on ${window.date.toISOString()} ${window.startHour}:00-${window.endHour}:00`,
    );

    return opportunity.id;
  }

  /**
   * Accept an opportunity
   */
  async acceptOpportunity(opportunityId: string, userId: string): Promise<void> {
    const opportunity = await this.prisma.opportunityWindow.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new Error(`Opportunity not found: ${opportunityId}`);
    }

    if (opportunity.status !== OpportunityStatus.SUGGESTED) {
      throw new Error(`Opportunity is not in SUGGESTED status`);
    }

    await this.prisma.opportunityWindow.update({
      where: { id: opportunityId },
      data: {
        status: OpportunityStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    });

    this.logger.log(`Opportunity ${opportunityId} accepted by user ${userId}`);
  }

  /**
   * Decline an opportunity
   */
  async declineOpportunity(opportunityId: string, userId: string): Promise<void> {
    await this.prisma.opportunityWindow.update({
      where: { id: opportunityId },
      data: {
        status: OpportunityStatus.DECLINED,
        respondedAt: new Date(),
      },
    });

    this.logger.log(`Opportunity ${opportunityId} declined by user ${userId}`);
  }

  /**
   * Mark expired opportunities
   */
  async markExpiredOpportunities(): Promise<number> {
    const now = new Date();

    // Find opportunities that have passed their start time without response
    const result = await this.prisma.opportunityWindow.updateMany({
      where: {
        status: OpportunityStatus.SUGGESTED,
        date: { lt: now },
      },
      data: {
        status: OpportunityStatus.EXPIRED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} opportunities as expired`);
    }

    return result.count;
  }

  /**
   * Update opportunity with actual results
   */
  async updateActualResults(opportunityId: string, actualOrders: number): Promise<void> {
    await this.prisma.opportunityWindow.update({
      where: { id: opportunityId },
      data: {
        actualOrders,
        status: OpportunityStatus.COMPLETED,
      },
    });
  }

  /**
   * Get opportunity performance metrics
   */
  async getPerformanceMetrics(
    restaurantId: string,
    daysBack: number = 30,
  ): Promise<{
    totalOpportunities: number;
    acceptedCount: number;
    acceptanceRate: number;
    avgScore: number;
    avgForecastedOrders: number;
    avgActualOrders: number;
    forecastAccuracy: number;
    totalRevenue: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const opportunities = await this.prisma.opportunityWindow.findMany({
      where: {
        restaurantId,
        date: { gte: startDate },
      },
    });

    const total = opportunities.length;
    const accepted = opportunities.filter(o => o.status === OpportunityStatus.ACCEPTED);
    const completed = opportunities.filter(o =>
      o.status === OpportunityStatus.COMPLETED && o.actualOrders !== null
    );

    const avgScore = total > 0
      ? opportunities.reduce((sum, o) => sum + o.score, 0) / total
      : 0;

    const avgForecasted = total > 0
      ? opportunities.reduce((sum, o) => sum + o.forecastedOrders, 0) / total
      : 0;

    const avgActual = completed.length > 0
      ? completed.reduce((sum, o) => sum + (o.actualOrders || 0), 0) / completed.length
      : 0;

    // Calculate MAPE for forecast accuracy
    let forecastAccuracy = 0;
    if (completed.length > 0) {
      const mape = completed.reduce((sum, o) => {
        if (o.actualOrders && o.actualOrders > 0) {
          return sum + Math.abs(o.forecastedOrders - o.actualOrders) / o.actualOrders;
        }
        return sum;
      }, 0) / completed.length;
      forecastAccuracy = Math.max(0, 100 - mape * 100);
    }

    const totalRevenue = completed.reduce((sum, o) =>
      sum + (o.actualOrders || 0) * 35, 0);

    return {
      totalOpportunities: total,
      acceptedCount: accepted.length,
      acceptanceRate: total > 0 ? (accepted.length / total) * 100 : 0,
      avgScore,
      avgForecastedOrders: avgForecasted,
      avgActualOrders: avgActual,
      forecastAccuracy,
      totalRevenue,
    };
  }

  /**
   * Find consecutive hours that meet opportunity criteria
   */
  private findOpportunityWindows(
    forecast: HourlyForecast[],
    capacity: number,
    criteria: OpportunityCriteria,
    operatingHours?: { openTime: string; closeTime: string } | null,
  ): Array<{
    startHour: number;
    endHour: number;
    hours: number;
    totalDineIn: number;
    totalDelivery: number;
    avgConfidence: number;
  }> {
    const windows: Array<{
      startHour: number;
      endHour: number;
      hours: number;
      totalDineIn: number;
      totalDelivery: number;
      avgConfidence: number;
    }> = [];

    const openHour = operatingHours
      ? parseInt(operatingHours.openTime.split(':')[0], 10)
      : 11;
    const closeHour = operatingHours
      ? parseInt(operatingHours.closeTime.split(':')[0], 10)
      : 22;

    // Filter to operating hours and qualifying hours
    const qualifyingHours = forecast.filter(h => {
      if (h.hour < openHour || h.hour >= closeHour) return false;
      if (h.confidence < criteria.minConfidence) return false;

      // Check dine-in is below threshold
      const dineInPercent = (h.dineInForecast / capacity) * 100;
      if (dineInPercent > criteria.maxDineInCapacityPercent) return false;

      // Check delivery is above threshold
      if (h.deliveryForecast < criteria.minDeliveryOrdersPerHour) return false;

      return true;
    });

    // Find consecutive windows
    let windowStart: number | null = null;
    let windowHours: HourlyForecast[] = [];

    for (let i = 0; i < forecast.length; i++) {
      const h = forecast[i];
      const isQualifying = qualifyingHours.includes(h);

      if (isQualifying) {
        if (windowStart === null) {
          windowStart = h.hour;
        }
        windowHours.push(h);
      } else if (windowStart !== null) {
        // End of window
        if (windowHours.length >= criteria.minWindowHours) {
          windows.push(this.createWindow(windowStart, windowHours));
        }
        windowStart = null;
        windowHours = [];
      }
    }

    // Check final window
    if (windowStart !== null && windowHours.length >= criteria.minWindowHours) {
      windows.push(this.createWindow(windowStart, windowHours));
    }

    return windows;
  }

  /**
   * Create window summary from hours
   */
  private createWindow(
    startHour: number,
    hours: HourlyForecast[],
  ): {
    startHour: number;
    endHour: number;
    hours: number;
    totalDineIn: number;
    totalDelivery: number;
    avgConfidence: number;
  } {
    return {
      startHour,
      endHour: startHour + hours.length,
      hours: hours.length,
      totalDineIn: hours.reduce((sum, h) => sum + h.dineInForecast, 0),
      totalDelivery: hours.reduce((sum, h) => sum + h.deliveryForecast, 0),
      avgConfidence: hours.reduce((sum, h) => sum + h.confidence, 0) / hours.length,
    };
  }

  /**
   * Calculate recommended staff for delivery orders
   */
  private calculateRecommendedStaff(totalOrders: number, hours: number): number {
    const ordersPerHour = totalOrders / hours;

    // Assume 1 staff can handle 8-10 orders per hour
    const staffNeeded = Math.ceil(ordersPerHour / 8);

    // Minimum 1, maximum based on reasonable limits
    return Math.max(1, Math.min(5, staffNeeded));
  }

  /**
   * Notify managers about opportunity
   */
  private async notifyManagers(
    restaurantId: string,
    opportunityId: string,
    window: OpportunityWindow,
  ): Promise<void> {
    // Find managers for this restaurant
    const managers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId,
        role: { in: ['OWNER', 'MANAGER'] },
        status: 'ACTIVE',
      },
      include: { user: true },
    });

    const dateStr = window.date.toLocaleDateString();
    const timeStr = `${window.startHour}:00 - ${window.endHour}:00`;

    for (const manager of managers) {
      await this.notificationService.send(
        manager.userId,
        NotificationType.GHOST_KITCHEN_OPPORTUNITY,
        {
          opportunityId,
          restaurantId,
          date: dateStr,
          time: timeStr,
          score: window.score.toString(),
          forecastedOrders: window.forecastedDelivery.toString(),
          potentialRevenue: `$${window.potentialRevenue}`,
        },
      );
    }
  }

  /**
   * Convert time string (HH:MM) to hour number
   */
  private timeToHour(time: string): number {
    return parseInt(time.split(':')[0], 10);
  }

  /**
   * Convert hour number to time string (HH:00)
   */
  private hourToTime(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }
}
