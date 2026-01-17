import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Date range for analytics queries
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Hourly labor cost breakdown
 */
export interface HourlyCostBreakdown {
  hour: number;
  dayOfWeek: number;
  scheduledWorkers: number;
  laborHours: number;
  laborCost: number;
  overtimeCost: number;
  averageHourlyRate: number;
}

/**
 * Labor cost analysis result
 */
export interface LaborCostAnalysis {
  restaurantId: string;
  dateRange: DateRange;
  summary: {
    totalLaborCost: number;
    totalLaborHours: number;
    totalOvertimeCost: number;
    totalOvertimeHours: number;
    averageHourlyRate: number;
    laborCostPerHour: number;
    estimatedRevenue?: number;
    laborAsPercentOfRevenue?: number;
  };
  dailyBreakdown: {
    date: string;
    dayOfWeek: number;
    laborCost: number;
    laborHours: number;
    workerCount: number;
    overtimeCost: number;
    revenue?: number;
    laborPercent?: number;
  }[];
  positionBreakdown: {
    position: string;
    laborCost: number;
    laborHours: number;
    workerCount: number;
    averageHourlyRate: number;
  }[];
  hourlyPattern: HourlyCostBreakdown[];
}

/**
 * Overstaffing analysis result
 */
export interface OverstaffingAnalysis {
  restaurantId: string;
  dateRange: DateRange;
  overstaffedPeriods: {
    date: string;
    startTime: string;
    endTime: string;
    scheduledWorkers: number;
    recommendedWorkers: number;
    excessWorkers: number;
    excessCost: number;
    reason: string;
  }[];
  totalExcessCost: number;
  totalExcessHours: number;
  recommendations: string[];
}

/**
 * Understaffing analysis result
 */
export interface UnderstaffingAnalysis {
  restaurantId: string;
  dateRange: DateRange;
  coverageGaps: {
    date: string;
    startTime: string;
    endTime: string;
    position: string;
    scheduledWorkers: number;
    requiredWorkers: number;
    shortfall: number;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
  }[];
  totalShortfallHours: number;
  recommendations: string[];
}

/**
 * Optimal schedule suggestion
 */
export interface OptimalSchedule {
  date: string;
  shifts: {
    position: string;
    startTime: string;
    endTime: string;
    recommendedWorkers: number;
    estimatedCost: number;
    confidence: number;
  }[];
  totalLaborCost: number;
  comparedToCurrent: {
    currentCost: number;
    savings: number;
    savingsPercent: number;
  };
  notes: string[];
}

/**
 * Savings opportunity analysis
 */
export interface SavingsOpportunity {
  restaurantId: string;
  totalPotentialSavings: number;
  savingsBreakdown: {
    category: string;
    potentialSavings: number;
    description: string;
    implementation: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  }[];
  recommendations: string[];
}

/**
 * Industry benchmark comparison
 */
export interface BenchmarkComparison {
  restaurantId: string;
  laborPercentOfRevenue: number;
  industryAverage: number;
  percentile: number;
  status: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'BELOW_AVERAGE' | 'POOR';
  comparison: {
    metric: string;
    yourValue: number;
    industryAverage: number;
    difference: number;
    differencePercent: number;
  }[];
  recommendations: string[];
}

/**
 * Labor Optimizer Service
 *
 * Provides comprehensive labor cost analysis and optimization recommendations:
 * - Full labor cost breakdown by day, position, and hour
 * - Identification of overstaffing and understaffing periods
 * - AI-suggested optimal schedules
 * - Savings opportunity analysis
 * - Industry benchmark comparisons
 */
@Injectable()
export class LaborOptimizerService {
  private readonly logger = new Logger(LaborOptimizerService.name);

  // Industry benchmarks (casual dining averages)
  private readonly INDUSTRY_BENCHMARKS = {
    laborPercentOfRevenue: 28, // 28% average for casual dining
    laborCostPerCover: 8.50, // $8.50 per guest
    overtimePercentOfTotal: 5, // 5% of total labor hours
    turnoverRate: 75, // 75% annual turnover
    shiftsPerWorkerPerWeek: 4.5,
  };

  // Staffing guidelines per position
  private readonly STAFFING_GUIDELINES: Record<string, { coversPerWorker: number; minWorkers: number }> = {
    SERVER: { coversPerWorker: 20, minWorkers: 1 },
    BARTENDER: { coversPerWorker: 40, minWorkers: 1 },
    LINE_COOK: { coversPerWorker: 30, minWorkers: 2 },
    PREP_COOK: { coversPerWorker: 50, minWorkers: 1 },
    HOST: { coversPerWorker: 100, minWorkers: 1 },
    BUSSER: { coversPerWorker: 30, minWorkers: 1 },
    DISHWASHER: { coversPerWorker: 50, minWorkers: 1 },
    MANAGER: { coversPerWorker: 200, minWorkers: 1 },
  };

  // Cache TTL
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Analyze labor costs for a restaurant over a date range
   */
  async analyzeLaborCosts(
    restaurantId: string,
    dateRange: DateRange,
  ): Promise<LaborCostAnalysis> {
    const cacheKey = `labor-analysis:${restaurantId}:${dateRange.startDate.toISOString()}:${dateRange.endDate.toISOString()}`;
    const cached = await this.redis.getJson<LaborCostAnalysis>(cacheKey);
    if (cached) {
      return cached;
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    // Get all completed and in-progress shifts in the date range
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: dateRange.startDate },
        endTime: { lte: dateRange.endDate },
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'ASSIGNED'] },
        assignedToId: { not: null },
      },
      include: {
        assignedTo: true,
      },
    });

    // Calculate summary statistics
    let totalLaborCost = 0;
    let totalLaborHours = 0;
    let totalOvertimeCost = 0;
    let totalOvertimeHours = 0;

    // Track worker weekly hours for overtime calculation
    const workerWeeklyHours: Map<string, Map<string, number>> = new Map();

    // Daily breakdown
    const dailyMap: Map<string, {
      laborCost: number;
      laborHours: number;
      workerCount: Set<string>;
      overtimeCost: number;
    }> = new Map();

    // Position breakdown
    const positionMap: Map<string, {
      laborCost: number;
      laborHours: number;
      workerIds: Set<string>;
      totalRate: number;
    }> = new Map();

    // Hourly pattern (aggregate by hour of day and day of week)
    const hourlyMap: Map<string, {
      scheduledWorkers: Set<string>;
      laborHours: number;
      laborCost: number;
      overtimeCost: number;
      totalRate: number;
      count: number;
    }> = new Map();

    for (const shift of shifts) {
      if (!shift.assignedTo) continue;

      const startDate = new Date(shift.startTime);
      const endDate = new Date(shift.endTime);
      const dateKey = startDate.toISOString().split('T')[0];
      const weekKey = this.getWeekKey(startDate);

      // Calculate shift duration (in hours)
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      const netHours = durationHours - (shift.breakMinutes || 0) / 60;

      // Get hourly rate
      const hourlyRate = shift.hourlyRateOverride
        ? Number(shift.hourlyRateOverride)
        : Number(shift.assignedTo.hourlyRate);

      // Track worker's weekly hours for overtime
      if (!workerWeeklyHours.has(shift.assignedTo.id)) {
        workerWeeklyHours.set(shift.assignedTo.id, new Map());
      }
      const workerWeeks = workerWeeklyHours.get(shift.assignedTo.id)!;
      const currentWeekHours = workerWeeks.get(weekKey) || 0;
      workerWeeks.set(weekKey, currentWeekHours + netHours);

      // Calculate overtime
      const totalWeekHours = workerWeeks.get(weekKey)!;
      let regularHours = netHours;
      let overtimeHours = 0;

      if (totalWeekHours > 40) {
        if (currentWeekHours >= 40) {
          // All hours are overtime
          overtimeHours = netHours;
          regularHours = 0;
        } else {
          // Split between regular and overtime
          regularHours = 40 - currentWeekHours;
          overtimeHours = netHours - regularHours;
        }
      }

      const regularCost = regularHours * hourlyRate;
      const overtimeCost = overtimeHours * hourlyRate * 1.5;
      const totalCost = regularCost + overtimeCost;

      totalLaborCost += totalCost;
      totalLaborHours += netHours;
      totalOvertimeCost += overtimeCost;
      totalOvertimeHours += overtimeHours;

      // Update daily breakdown
      const dailyData = dailyMap.get(dateKey) || {
        laborCost: 0,
        laborHours: 0,
        workerCount: new Set<string>(),
        overtimeCost: 0,
      };
      dailyData.laborCost += totalCost;
      dailyData.laborHours += netHours;
      dailyData.workerCount.add(shift.assignedTo.id);
      dailyData.overtimeCost += overtimeCost;
      dailyMap.set(dateKey, dailyData);

      // Update position breakdown
      const positionData = positionMap.get(shift.position) || {
        laborCost: 0,
        laborHours: 0,
        workerIds: new Set<string>(),
        totalRate: 0,
      };
      positionData.laborCost += totalCost;
      positionData.laborHours += netHours;
      positionData.workerIds.add(shift.assignedTo.id);
      positionData.totalRate += hourlyRate;
      positionMap.set(shift.position, positionData);

      // Update hourly pattern
      const startHour = startDate.getHours();
      const endHour = endDate.getHours() || 24;
      const dayOfWeek = startDate.getDay();

      for (let hour = startHour; hour < endHour && hour < 24; hour++) {
        const hourKey = `${dayOfWeek}-${hour}`;
        const hourData = hourlyMap.get(hourKey) || {
          scheduledWorkers: new Set<string>(),
          laborHours: 0,
          laborCost: 0,
          overtimeCost: 0,
          totalRate: 0,
          count: 0,
        };
        hourData.scheduledWorkers.add(shift.assignedTo.id);
        hourData.laborHours += 1;
        hourData.laborCost += hourlyRate;
        hourData.totalRate += hourlyRate;
        hourData.count += 1;
        hourlyMap.set(hourKey, hourData);
      }
    }

    // Build daily breakdown array
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        dayOfWeek: new Date(date).getDay(),
        laborCost: Math.round(data.laborCost * 100) / 100,
        laborHours: Math.round(data.laborHours * 100) / 100,
        workerCount: data.workerCount.size,
        overtimeCost: Math.round(data.overtimeCost * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Build position breakdown array
    const positionBreakdown = Array.from(positionMap.entries())
      .map(([position, data]) => ({
        position,
        laborCost: Math.round(data.laborCost * 100) / 100,
        laborHours: Math.round(data.laborHours * 100) / 100,
        workerCount: data.workerIds.size,
        averageHourlyRate: Math.round(data.totalRate / data.laborHours * 100) / 100,
      }))
      .sort((a, b) => b.laborCost - a.laborCost);

    // Build hourly pattern array
    const hourlyPattern = Array.from(hourlyMap.entries())
      .map(([key, data]) => {
        const [dayOfWeek, hour] = key.split('-').map(Number);
        return {
          hour,
          dayOfWeek,
          scheduledWorkers: data.scheduledWorkers.size,
          laborHours: Math.round(data.laborHours * 100) / 100,
          laborCost: Math.round(data.laborCost * 100) / 100,
          overtimeCost: Math.round(data.overtimeCost * 100) / 100,
          averageHourlyRate: data.count > 0
            ? Math.round(data.totalRate / data.count * 100) / 100
            : 0,
        };
      })
      .sort((a, b) => a.dayOfWeek * 100 + a.hour - (b.dayOfWeek * 100 + b.hour));

    const result: LaborCostAnalysis = {
      restaurantId,
      dateRange,
      summary: {
        totalLaborCost: Math.round(totalLaborCost * 100) / 100,
        totalLaborHours: Math.round(totalLaborHours * 100) / 100,
        totalOvertimeCost: Math.round(totalOvertimeCost * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        averageHourlyRate: totalLaborHours > 0
          ? Math.round(totalLaborCost / totalLaborHours * 100) / 100
          : 0,
        laborCostPerHour: totalLaborHours > 0
          ? Math.round(totalLaborCost / totalLaborHours * 100) / 100
          : 0,
      },
      dailyBreakdown,
      positionBreakdown,
      hourlyPattern,
    };

    // Cache result
    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  /**
   * Identify overstaffed periods
   */
  async identifyOverstaffing(
    restaurantId: string,
    dateRange: DateRange,
  ): Promise<OverstaffingAnalysis> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    // Get hourly staffing data
    const laborAnalysis = await this.analyzeLaborCosts(restaurantId, dateRange);

    // Get demand forecasts for comparison
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const overstaffedPeriods: OverstaffingAnalysis['overstaffedPeriods'] = [];
    let totalExcessCost = 0;
    let totalExcessHours = 0;

    // Analyze each hourly period
    for (const hourData of laborAnalysis.hourlyPattern) {
      // Find matching forecast
      const matchingForecast = forecasts.find(f =>
        f.hourSlot === hourData.hour &&
        new Date(f.date).getDay() === hourData.dayOfWeek,
      );

      // Calculate recommended staffing based on demand
      const expectedCovers = matchingForecast
        ? matchingForecast.dineInForecast + matchingForecast.deliveryForecast
        : 20; // Default estimate

      const recommendedWorkers = this.calculateRecommendedStaffing(expectedCovers);

      if (hourData.scheduledWorkers > recommendedWorkers + 1) {
        const excessWorkers = hourData.scheduledWorkers - recommendedWorkers;
        const excessCost = excessWorkers * hourData.averageHourlyRate;

        overstaffedPeriods.push({
          date: this.getDayName(hourData.dayOfWeek),
          startTime: `${hourData.hour.toString().padStart(2, '0')}:00`,
          endTime: `${(hourData.hour + 1).toString().padStart(2, '0')}:00`,
          scheduledWorkers: hourData.scheduledWorkers,
          recommendedWorkers,
          excessWorkers,
          excessCost: Math.round(excessCost * 100) / 100,
          reason: `Expected ${expectedCovers} covers, need ${recommendedWorkers} workers but have ${hourData.scheduledWorkers}`,
        });

        totalExcessCost += excessCost;
        totalExcessHours += excessWorkers;
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (overstaffedPeriods.length > 0) {
      const peakExcessTimes = overstaffedPeriods
        .sort((a, b) => b.excessCost - a.excessCost)
        .slice(0, 3);

      recommendations.push(
        `Focus on reducing staffing during ${peakExcessTimes.map(p => p.startTime).join(', ')} - highest excess costs`,
      );

      if (totalExcessCost > 500) {
        recommendations.push(
          `Consider implementing demand-based scheduling to save approximately $${Math.round(totalExcessCost)} per period`,
        );
      }

      recommendations.push('Review historical demand data and adjust future schedules accordingly');
    } else {
      recommendations.push('Staffing levels appear well-aligned with demand');
    }

    return {
      restaurantId,
      dateRange,
      overstaffedPeriods,
      totalExcessCost: Math.round(totalExcessCost * 100) / 100,
      totalExcessHours,
      recommendations,
    };
  }

  /**
   * Identify understaffed periods / coverage gaps
   */
  async identifyUnderstaffing(
    restaurantId: string,
    dateRange: DateRange,
  ): Promise<UnderstaffingAnalysis> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { operatingHours: true },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    // Get all shifts in the date range
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: dateRange.startDate },
        endTime: { lte: dateRange.endDate },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
    });

    // Get demand forecasts
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const coverageGaps: UnderstaffingAnalysis['coverageGaps'] = [];
    let totalShortfallHours = 0;

    // Analyze coverage by position and hour
    const positionHourlyCoverage: Map<string, Map<string, number>> = new Map();

    for (const position of Object.keys(this.STAFFING_GUIDELINES)) {
      positionHourlyCoverage.set(position, new Map());
    }

    // Count shifts per position per hour
    for (const shift of shifts) {
      if (shift.assignedToId) {
        const startHour = new Date(shift.startTime).getHours();
        const endHour = new Date(shift.endTime).getHours() || 24;
        const dateKey = new Date(shift.startTime).toISOString().split('T')[0];

        const positionMap = positionHourlyCoverage.get(shift.position);
        if (positionMap) {
          for (let hour = startHour; hour < endHour; hour++) {
            const key = `${dateKey}-${hour}`;
            positionMap.set(key, (positionMap.get(key) || 0) + 1);
          }
        }
      }
    }

    // Check for gaps against requirements
    const currentDate = new Date(dateRange.startDate);
    while (currentDate <= dateRange.endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();

      // Find operating hours for this day
      const hours = restaurant.operatingHours.find(h => h.dayOfWeek === dayOfWeek);
      if (hours && !hours.isClosed) {
        const openHour = parseInt(hours.openTime.split(':')[0], 10);
        const closeHour = parseInt(hours.closeTime.split(':')[0], 10) || 24;

        for (let hour = openHour; hour < closeHour; hour++) {
          // Find demand forecast
          const forecast = forecasts.find(f =>
            f.date.toISOString().split('T')[0] === dateKey &&
            f.hourSlot === hour,
          );

          const expectedCovers = forecast
            ? forecast.dineInForecast + forecast.deliveryForecast
            : 20;

          // Check each position
          for (const [position, guidelines] of Object.entries(this.STAFFING_GUIDELINES)) {
            const key = `${dateKey}-${hour}`;
            const scheduled = positionHourlyCoverage.get(position)?.get(key) || 0;
            const required = Math.max(
              guidelines.minWorkers,
              Math.ceil(expectedCovers / guidelines.coversPerWorker),
            );

            if (scheduled < required) {
              const shortfall = required - scheduled;
              totalShortfallHours += shortfall;

              // Determine urgency
              let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
              if (scheduled === 0 && required > 0) {
                urgency = 'HIGH';
              } else if (shortfall >= required / 2) {
                urgency = 'MEDIUM';
              }

              coverageGaps.push({
                date: dateKey,
                startTime: `${hour.toString().padStart(2, '0')}:00`,
                endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
                position,
                scheduledWorkers: scheduled,
                requiredWorkers: required,
                shortfall,
                urgency,
                reason: scheduled === 0
                  ? `No ${position} scheduled`
                  : `Expected ${expectedCovers} covers, need ${required} ${position}s but only have ${scheduled}`,
              });
            }
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate recommendations
    const recommendations: string[] = [];

    const criticalGaps = coverageGaps.filter(g => g.urgency === 'HIGH');
    if (criticalGaps.length > 0) {
      recommendations.push(
        `URGENT: ${criticalGaps.length} critical coverage gaps found - positions completely unstaffed`,
      );
    }

    const positionShortfalls = coverageGaps.reduce((acc, gap) => {
      acc[gap.position] = (acc[gap.position] || 0) + gap.shortfall;
      return acc;
    }, {} as Record<string, number>);

    const worstPositions = Object.entries(positionShortfalls)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (worstPositions.length > 0) {
      recommendations.push(
        `Focus hiring/scheduling on: ${worstPositions.map(([p, s]) => `${p} (${s} hours short)`).join(', ')}`,
      );
    }

    if (totalShortfallHours > 20) {
      recommendations.push('Consider hiring additional part-time staff to fill recurring gaps');
    }

    return {
      restaurantId,
      dateRange,
      coverageGaps: coverageGaps.sort((a, b) => {
        const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }),
      totalShortfallHours,
      recommendations,
    };
  }

  /**
   * Generate optimal schedule for a specific date
   */
  async getOptimalSchedule(
    restaurantId: string,
    date: Date,
  ): Promise<OptimalSchedule> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { operatingHours: true },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    const dateKey = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    // Get operating hours
    const hours = restaurant.operatingHours.find(h => h.dayOfWeek === dayOfWeek);
    if (!hours || hours.isClosed) {
      return {
        date: dateKey,
        shifts: [],
        totalLaborCost: 0,
        comparedToCurrent: { currentCost: 0, savings: 0, savingsPercent: 0 },
        notes: ['Restaurant is closed on this day'],
      };
    }

    // Get demand forecasts
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: {
          gte: new Date(dateKey),
          lt: new Date(new Date(dateKey).getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });

    // Get average hourly rates by position
    const workerRates = await this.prisma.workerProfile.groupBy({
      by: ['positions'],
      where: { restaurantId, status: 'ACTIVE' },
      _avg: { hourlyRate: true },
    });

    const avgRateByPosition: Record<string, number> = {};
    for (const wr of workerRates) {
      for (const pos of wr.positions) {
        avgRateByPosition[pos] = Number(wr._avg.hourlyRate) || 15;
      }
    }

    const openHour = parseInt(hours.openTime.split(':')[0], 10);
    const closeHour = parseInt(hours.closeTime.split(':')[0], 10) || 24;

    const shifts: OptimalSchedule['shifts'] = [];
    let totalLaborCost = 0;

    // Generate optimal shifts by position
    for (const [position, guidelines] of Object.entries(this.STAFFING_GUIDELINES)) {
      const hourlyRate = avgRateByPosition[position] || 15;
      let currentShiftStart: number | null = null;
      let currentWorkerCount = 0;

      for (let hour = openHour; hour <= closeHour; hour++) {
        const forecast = forecasts.find(f => f.hourSlot === hour);
        const expectedCovers = forecast
          ? forecast.dineInForecast + forecast.deliveryForecast
          : this.estimateCoversForHour(hour, dayOfWeek);

        const neededWorkers = Math.max(
          guidelines.minWorkers,
          Math.ceil(expectedCovers / guidelines.coversPerWorker),
        );

        // Start new shift or adjust if worker count changes significantly
        if (currentShiftStart === null) {
          currentShiftStart = hour;
          currentWorkerCount = neededWorkers;
        } else if (
          neededWorkers !== currentWorkerCount ||
          hour === closeHour
        ) {
          // End current shift
          const shiftHours = hour - currentShiftStart;
          const shiftCost = currentWorkerCount * hourlyRate * shiftHours;

          if (shiftHours >= 2 && currentWorkerCount > 0) {
            shifts.push({
              position,
              startTime: `${currentShiftStart.toString().padStart(2, '0')}:00`,
              endTime: `${hour.toString().padStart(2, '0')}:00`,
              recommendedWorkers: currentWorkerCount,
              estimatedCost: Math.round(shiftCost * 100) / 100,
              confidence: forecast ? forecast.confidence : 0.5,
            });
            totalLaborCost += shiftCost;
          }

          if (hour < closeHour) {
            currentShiftStart = hour;
            currentWorkerCount = neededWorkers;
          }
        }
      }
    }

    // Calculate current cost for comparison
    const currentShifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: {
          gte: new Date(dateKey),
          lt: new Date(new Date(dateKey).getTime() + 24 * 60 * 60 * 1000),
        },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      include: { assignedTo: true },
    });

    const currentCost = currentShifts.reduce((total, shift) => {
      const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      const rate = shift.hourlyRateOverride
        ? Number(shift.hourlyRateOverride)
        : (shift.assignedTo ? Number(shift.assignedTo.hourlyRate) : 15);
      return total + hours * rate;
    }, 0);

    const savings = currentCost - totalLaborCost;

    return {
      date: dateKey,
      shifts,
      totalLaborCost: Math.round(totalLaborCost * 100) / 100,
      comparedToCurrent: {
        currentCost: Math.round(currentCost * 100) / 100,
        savings: Math.round(savings * 100) / 100,
        savingsPercent: currentCost > 0
          ? Math.round((savings / currentCost) * 10000) / 100
          : 0,
      },
      notes: [
        'Schedule optimized based on historical demand patterns',
        'Actual staffing may need adjustment based on reservations and events',
        'Consider minimum shift lengths per labor law requirements',
      ],
    };
  }

  /**
   * Calculate potential savings opportunities
   */
  async calculateSavingsOpportunity(
    restaurantId: string,
  ): Promise<SavingsOpportunity> {
    const last30Days = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const laborAnalysis = await this.analyzeLaborCosts(restaurantId, last30Days);
    const overstaffing = await this.identifyOverstaffing(restaurantId, last30Days);
    const understaffing = await this.identifyUnderstaffing(restaurantId, last30Days);

    const savingsBreakdown: SavingsOpportunity['savingsBreakdown'] = [];
    let totalPotentialSavings = 0;

    // Overstaffing savings
    if (overstaffing.totalExcessCost > 0) {
      const monthlySavings = overstaffing.totalExcessCost * 4; // Extrapolate to monthly
      savingsBreakdown.push({
        category: 'Reduce Overstaffing',
        potentialSavings: Math.round(monthlySavings * 100) / 100,
        description: `${overstaffing.overstaffedPeriods.length} periods identified with excess staff`,
        implementation: 'Adjust schedules based on demand forecasts',
        difficulty: 'EASY',
      });
      totalPotentialSavings += monthlySavings;
    }

    // Overtime reduction
    const overtimePercent = laborAnalysis.summary.totalOvertimeHours / laborAnalysis.summary.totalLaborHours;
    if (overtimePercent > 0.05) {
      const excessOvertimeCost = laborAnalysis.summary.totalOvertimeCost * 0.5; // Could save 50%
      savingsBreakdown.push({
        category: 'Reduce Overtime',
        potentialSavings: Math.round(excessOvertimeCost * 100) / 100,
        description: `${Math.round(overtimePercent * 100)}% of hours are overtime vs 5% industry standard`,
        implementation: 'Hire additional part-time workers to distribute hours',
        difficulty: 'MEDIUM',
      });
      totalPotentialSavings += excessOvertimeCost;
    }

    // Rate optimization
    const avgRate = laborAnalysis.summary.averageHourlyRate;
    if (avgRate > 20) {
      const potentialRateSavings = (avgRate - 18) * laborAnalysis.summary.totalLaborHours * 0.2;
      savingsBreakdown.push({
        category: 'Optimize Labor Mix',
        potentialSavings: Math.round(potentialRateSavings * 100) / 100,
        description: `Average rate $${avgRate.toFixed(2)}/hr is above optimal`,
        implementation: 'Shift some hours to less experienced workers or adjust scheduling',
        difficulty: 'MEDIUM',
      });
      totalPotentialSavings += potentialRateSavings;
    }

    // Schedule efficiency
    const scheduleOptimizationSavings = laborAnalysis.summary.totalLaborCost * 0.05;
    savingsBreakdown.push({
      category: 'Schedule Optimization',
      potentialSavings: Math.round(scheduleOptimizationSavings * 100) / 100,
      description: 'Use AI-optimized scheduling to improve efficiency',
      implementation: 'Implement demand-based scheduling system',
      difficulty: 'HARD',
    });
    totalPotentialSavings += scheduleOptimizationSavings;

    const recommendations = [
      'Start with easy wins: adjust overstaffed periods first',
      'Review overtime patterns and consider hiring additional staff',
      'Implement demand forecasting for proactive scheduling',
    ];

    return {
      restaurantId,
      totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
      savingsBreakdown,
      recommendations,
    };
  }

  /**
   * Compare restaurant metrics to industry benchmarks
   */
  async compareToIndustryBenchmarks(
    restaurantId: string,
    estimatedMonthlyRevenue?: number,
  ): Promise<BenchmarkComparison> {
    const last30Days = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const laborAnalysis = await this.analyzeLaborCosts(restaurantId, last30Days);

    // Use provided revenue or estimate
    const revenue = estimatedMonthlyRevenue || laborAnalysis.summary.totalLaborCost * 3.5;

    const laborPercent = (laborAnalysis.summary.totalLaborCost / revenue) * 100;
    const overtimePercent = laborAnalysis.summary.totalOvertimeHours / laborAnalysis.summary.totalLaborHours * 100;

    // Calculate percentile (simplified - would use actual industry data in production)
    let percentile: number;
    let status: BenchmarkComparison['status'];

    if (laborPercent <= 22) {
      percentile = 90;
      status = 'EXCELLENT';
    } else if (laborPercent <= 26) {
      percentile = 75;
      status = 'GOOD';
    } else if (laborPercent <= 30) {
      percentile = 50;
      status = 'AVERAGE';
    } else if (laborPercent <= 35) {
      percentile = 25;
      status = 'BELOW_AVERAGE';
    } else {
      percentile = 10;
      status = 'POOR';
    }

    const comparison = [
      {
        metric: 'Labor % of Revenue',
        yourValue: Math.round(laborPercent * 100) / 100,
        industryAverage: this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue,
        difference: Math.round((laborPercent - this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue) * 100) / 100,
        differencePercent: Math.round((laborPercent - this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue) / this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue * 10000) / 100,
      },
      {
        metric: 'Overtime % of Hours',
        yourValue: Math.round(overtimePercent * 100) / 100,
        industryAverage: this.INDUSTRY_BENCHMARKS.overtimePercentOfTotal,
        difference: Math.round((overtimePercent - this.INDUSTRY_BENCHMARKS.overtimePercentOfTotal) * 100) / 100,
        differencePercent: Math.round((overtimePercent - this.INDUSTRY_BENCHMARKS.overtimePercentOfTotal) / this.INDUSTRY_BENCHMARKS.overtimePercentOfTotal * 10000) / 100,
      },
      {
        metric: 'Avg Hourly Rate',
        yourValue: laborAnalysis.summary.averageHourlyRate,
        industryAverage: 16.50,
        difference: Math.round((laborAnalysis.summary.averageHourlyRate - 16.50) * 100) / 100,
        differencePercent: Math.round((laborAnalysis.summary.averageHourlyRate - 16.50) / 16.50 * 10000) / 100,
      },
    ];

    const recommendations: string[] = [];

    if (laborPercent > this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue) {
      recommendations.push(
        `Your labor cost (${laborPercent.toFixed(1)}%) exceeds industry average (${this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue}%) - review staffing levels`,
      );
    }

    if (overtimePercent > this.INDUSTRY_BENCHMARKS.overtimePercentOfTotal) {
      recommendations.push(
        `Overtime hours (${overtimePercent.toFixed(1)}%) exceed benchmark (${this.INDUSTRY_BENCHMARKS.overtimePercentOfTotal}%) - consider hiring`,
      );
    }

    if (percentile < 50) {
      recommendations.push('Focus on schedule optimization and demand-based staffing');
    }

    return {
      restaurantId,
      laborPercentOfRevenue: Math.round(laborPercent * 100) / 100,
      industryAverage: this.INDUSTRY_BENCHMARKS.laborPercentOfRevenue,
      percentile,
      status,
      comparison,
      recommendations,
    };
  }

  // ==================== Private Helper Methods ====================

  private getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - day); // Start of week (Sunday)
    return d.toISOString().split('T')[0];
  }

  private getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || 'Unknown';
  }

  private calculateRecommendedStaffing(expectedCovers: number): number {
    // Simple calculation: 1 worker per 15 covers, minimum 2
    return Math.max(2, Math.ceil(expectedCovers / 15));
  }

  private estimateCoversForHour(hour: number, dayOfWeek: number): number {
    // Typical restaurant demand patterns
    const weekdayPattern: Record<number, number> = {
      6: 0, 7: 0, 8: 5, 9: 10, 10: 15,
      11: 30, 12: 50, 13: 40, 14: 20, 15: 10,
      16: 15, 17: 30, 18: 50, 19: 60, 20: 45,
      21: 30, 22: 15, 23: 5,
    };

    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.3 : 1.0;
    return Math.round((weekdayPattern[hour] || 0) * weekendMultiplier);
  }
}
