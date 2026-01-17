import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { LaborOptimizerService } from './labor-optimizer.service';
import { ForecastAccuracyService } from './forecast-accuracy.service';
import { WorkerAnalyticsService } from './worker-analytics.service';

/**
 * Date range for queries
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Key performance indicator with trend
 */
export interface KeyMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'UP' | 'DOWN' | 'STABLE';
  trendPercent: number;
  previousValue: number;
  status: 'GOOD' | 'WARNING' | 'CRITICAL';
  description: string;
}

/**
 * Alert for executive dashboard
 */
export interface DashboardAlert {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'STAFFING' | 'LABOR_COST' | 'ATTENDANCE' | 'FORECAST' | 'WORKER';
  title: string;
  description: string;
  affectedEntity?: string;
  suggestedAction: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Executive summary for dashboard
 */
export interface ExecutiveSummary {
  restaurantId: string;
  restaurantName: string;
  dateRange: DateRange;
  generatedAt: Date;
  highlights: {
    laborCost: number;
    laborHours: number;
    laborAsPercentOfRevenue: number;
    shiftsCompleted: number;
    forecastAccuracy: number;
    workerCount: number;
    averageReliability: number;
  };
  trends: {
    laborCostTrend: number;
    laborHoursTrend: number;
    shiftCompletionTrend: number;
    forecastAccuracyTrend: number;
  };
  topPerformers: {
    workerId: string;
    name: string;
    metric: string;
    value: number;
  }[];
  areasOfConcern: string[];
}

/**
 * Restaurant comparison result
 */
export interface RestaurantComparison {
  restaurant1: {
    id: string;
    name: string;
    metrics: Record<string, number>;
  };
  restaurant2?: {
    id: string;
    name: string;
    metrics: Record<string, number>;
  };
  networkAverage?: Record<string, number>;
  differences: {
    metric: string;
    difference: number;
    percentDifference: number;
    winner?: string;
  }[];
  insights: string[];
}

/**
 * Export format options
 */
export type ExportFormat = 'PDF' | 'EXCEL' | 'CSV' | 'JSON';

/**
 * Export result
 */
export interface ExportResult {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  data: Buffer | string;
  generatedAt: Date;
}

/**
 * Dashboard Aggregator Service
 *
 * Aggregates data from multiple analytics services to provide:
 * - Executive summary dashboard
 * - Key performance indicators with trends
 * - Alerts requiring attention
 * - Restaurant comparisons
 * - Report exports
 */
@Injectable()
export class DashboardAggregatorService {
  private readonly logger = new Logger(DashboardAggregatorService.name);

  // Cache TTL
  private readonly CACHE_TTL = 900; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly laborOptimizer: LaborOptimizerService,
    private readonly forecastAccuracy: ForecastAccuracyService,
    private readonly workerAnalytics: WorkerAnalyticsService,
  ) {}

  /**
   * Get executive summary for a restaurant
   */
  async getExecutiveSummary(
    restaurantId: string,
    dateRange: DateRange,
  ): Promise<ExecutiveSummary> {
    const cacheKey = `exec-summary:${restaurantId}:${dateRange.startDate.toISOString()}:${dateRange.endDate.toISOString()}`;
    const cached = await this.redis.getJson<ExecutiveSummary>(cacheKey);
    if (cached) {
      return cached;
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    // Get labor analysis
    const laborAnalysis = await this.laborOptimizer.analyzeLaborCosts(restaurantId, dateRange);

    // Get forecast accuracy
    let forecastAccuracyScore = 0;
    try {
      const accuracy = await this.forecastAccuracy.measureAccuracy(restaurantId, dateRange);
      forecastAccuracyScore = accuracy.overallAccuracy;
    } catch (error) {
      this.logger.warn(`Could not get forecast accuracy: ${error}`);
    }

    // Get worker stats
    const workers = await this.prisma.workerProfile.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const workerCount = workers.length;
    const averageReliability = workers.length > 0
      ? workers.reduce((sum, w) => sum + Number(w.reliabilityScore), 0) / workers.length
      : 0;

    // Get shifts completed
    const shiftsCompleted = await this.prisma.shift.count({
      where: {
        restaurantId,
        startTime: { gte: dateRange.startDate },
        endTime: { lte: dateRange.endDate },
        status: 'COMPLETED',
      },
    });

    // Calculate previous period for trends
    const periodLength = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const previousDateRange = {
      startDate: new Date(dateRange.startDate.getTime() - periodLength),
      endDate: new Date(dateRange.startDate.getTime()),
    };

    let previousLaborAnalysis;
    try {
      previousLaborAnalysis = await this.laborOptimizer.analyzeLaborCosts(restaurantId, previousDateRange);
    } catch (error) {
      this.logger.debug('No previous period data available');
    }

    const previousShiftsCompleted = await this.prisma.shift.count({
      where: {
        restaurantId,
        startTime: { gte: previousDateRange.startDate },
        endTime: { lte: previousDateRange.endDate },
        status: 'COMPLETED',
      },
    });

    // Calculate trends
    const laborCostTrend = previousLaborAnalysis
      ? this.calculateTrendPercent(
          laborAnalysis.summary.totalLaborCost,
          previousLaborAnalysis.summary.totalLaborCost,
        )
      : 0;

    const laborHoursTrend = previousLaborAnalysis
      ? this.calculateTrendPercent(
          laborAnalysis.summary.totalLaborHours,
          previousLaborAnalysis.summary.totalLaborHours,
        )
      : 0;

    const shiftCompletionTrend = previousShiftsCompleted > 0
      ? this.calculateTrendPercent(shiftsCompleted, previousShiftsCompleted)
      : 0;

    // Get top performers
    const topPerformers = workers
      .sort((a, b) => Number(b.reliabilityScore) - Number(a.reliabilityScore))
      .slice(0, 5)
      .map(w => ({
        workerId: w.userId,
        name: `${w.user.firstName} ${w.user.lastName}`,
        metric: 'Reliability Score',
        value: Number(w.reliabilityScore),
      }));

    // Identify areas of concern
    const areasOfConcern: string[] = [];

    if (laborAnalysis.summary.totalOvertimeHours > laborAnalysis.summary.totalLaborHours * 0.1) {
      areasOfConcern.push('Overtime hours exceed 10% of total labor hours');
    }

    if (forecastAccuracyScore < 70) {
      areasOfConcern.push('Forecast accuracy below 70% - consider model tuning');
    }

    if (averageReliability < 3.5) {
      areasOfConcern.push('Average worker reliability is below target');
    }

    const workersWithNoShows = workers.filter(w => w.noShowCount > 2);
    if (workersWithNoShows.length > 0) {
      areasOfConcern.push(`${workersWithNoShows.length} workers with recurring no-show issues`);
    }

    const summary: ExecutiveSummary = {
      restaurantId,
      restaurantName: restaurant.name,
      dateRange,
      generatedAt: new Date(),
      highlights: {
        laborCost: laborAnalysis.summary.totalLaborCost,
        laborHours: laborAnalysis.summary.totalLaborHours,
        laborAsPercentOfRevenue: laborAnalysis.summary.laborAsPercentOfRevenue || 0,
        shiftsCompleted,
        forecastAccuracy: forecastAccuracyScore,
        workerCount,
        averageReliability: Math.round(averageReliability * 100) / 100,
      },
      trends: {
        laborCostTrend,
        laborHoursTrend,
        shiftCompletionTrend,
        forecastAccuracyTrend: 0, // Would need historical data
      },
      topPerformers,
      areasOfConcern,
    };

    // Cache result
    await this.redis.setJson(cacheKey, summary, this.CACHE_TTL);

    return summary;
  }

  /**
   * Get key metrics with trends
   */
  async getKeyMetrics(restaurantId: string): Promise<KeyMetric[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const currentRange = { startDate: thirtyDaysAgo, endDate: now };
    const previousRange = { startDate: sixtyDaysAgo, endDate: thirtyDaysAgo };

    const [currentLabor, previousLabor] = await Promise.all([
      this.laborOptimizer.analyzeLaborCosts(restaurantId, currentRange),
      this.laborOptimizer.analyzeLaborCosts(restaurantId, previousRange).catch(() => null),
    ]);

    const [currentShifts, previousShifts] = await Promise.all([
      this.prisma.shift.count({
        where: {
          restaurantId,
          startTime: { gte: thirtyDaysAgo },
          status: 'COMPLETED',
        },
      }),
      this.prisma.shift.count({
        where: {
          restaurantId,
          startTime: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          status: 'COMPLETED',
        },
      }),
    ]);

    const workers = await this.prisma.workerProfile.findMany({
      where: { restaurantId, status: 'ACTIVE' },
    });

    const avgReliability = workers.length > 0
      ? workers.reduce((sum, w) => sum + Number(w.reliabilityScore), 0) / workers.length
      : 0;

    const metrics: KeyMetric[] = [];

    // Labor Cost
    const laborCostTrend = previousLabor
      ? this.calculateTrendPercent(
          currentLabor.summary.totalLaborCost,
          previousLabor.summary.totalLaborCost,
        )
      : 0;

    metrics.push({
      name: 'Total Labor Cost',
      value: currentLabor.summary.totalLaborCost,
      unit: 'USD',
      trend: laborCostTrend > 5 ? 'UP' : laborCostTrend < -5 ? 'DOWN' : 'STABLE',
      trendPercent: laborCostTrend,
      previousValue: previousLabor?.summary.totalLaborCost || 0,
      status: laborCostTrend > 10 ? 'WARNING' : 'GOOD',
      description: 'Total labor cost for the last 30 days',
    });

    // Labor Hours
    const laborHoursTrend = previousLabor
      ? this.calculateTrendPercent(
          currentLabor.summary.totalLaborHours,
          previousLabor.summary.totalLaborHours,
        )
      : 0;

    metrics.push({
      name: 'Total Labor Hours',
      value: currentLabor.summary.totalLaborHours,
      unit: 'hours',
      trend: laborHoursTrend > 5 ? 'UP' : laborHoursTrend < -5 ? 'DOWN' : 'STABLE',
      trendPercent: laborHoursTrend,
      previousValue: previousLabor?.summary.totalLaborHours || 0,
      status: 'GOOD',
      description: 'Total scheduled labor hours',
    });

    // Overtime
    const overtimePercent = currentLabor.summary.totalLaborHours > 0
      ? (currentLabor.summary.totalOvertimeHours / currentLabor.summary.totalLaborHours) * 100
      : 0;

    metrics.push({
      name: 'Overtime Rate',
      value: Math.round(overtimePercent * 100) / 100,
      unit: '%',
      trend: 'STABLE',
      trendPercent: 0,
      previousValue: 0,
      status: overtimePercent > 10 ? 'CRITICAL' : overtimePercent > 5 ? 'WARNING' : 'GOOD',
      description: 'Overtime as percentage of total hours',
    });

    // Shifts Completed
    const shiftsTrend = this.calculateTrendPercent(currentShifts, previousShifts);

    metrics.push({
      name: 'Shifts Completed',
      value: currentShifts,
      unit: 'shifts',
      trend: shiftsTrend > 5 ? 'UP' : shiftsTrend < -5 ? 'DOWN' : 'STABLE',
      trendPercent: shiftsTrend,
      previousValue: previousShifts,
      status: 'GOOD',
      description: 'Number of shifts completed',
    });

    // Average Hourly Rate
    metrics.push({
      name: 'Avg Hourly Rate',
      value: currentLabor.summary.averageHourlyRate,
      unit: 'USD/hr',
      trend: 'STABLE',
      trendPercent: 0,
      previousValue: previousLabor?.summary.averageHourlyRate || 0,
      status: 'GOOD',
      description: 'Average hourly rate across all workers',
    });

    // Worker Count
    metrics.push({
      name: 'Active Workers',
      value: workers.length,
      unit: 'workers',
      trend: 'STABLE',
      trendPercent: 0,
      previousValue: workers.length,
      status: 'GOOD',
      description: 'Number of active workers',
    });

    // Average Reliability
    metrics.push({
      name: 'Avg Reliability',
      value: Math.round(avgReliability * 100) / 100,
      unit: 'score',
      trend: 'STABLE',
      trendPercent: 0,
      previousValue: 0,
      status: avgReliability >= 4 ? 'GOOD' : avgReliability >= 3 ? 'WARNING' : 'CRITICAL',
      description: 'Average worker reliability score (1-5)',
    });

    return metrics;
  }

  /**
   * Get alerts requiring attention
   */
  async getAlerts(restaurantId: string): Promise<DashboardAlert[]> {
    const alerts: DashboardAlert[] = [];
    const now = new Date();

    // Check for staffing gaps
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const unstaffedShifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: now, lte: next7Days },
        assignedToId: null,
        status: 'PUBLISHED_UNASSIGNED',
      },
      orderBy: { startTime: 'asc' },
    });

    if (unstaffedShifts.length > 0) {
      const urgentShifts = unstaffedShifts.filter(
        s => new Date(s.startTime).getTime() - now.getTime() < 48 * 60 * 60 * 1000,
      );

      if (urgentShifts.length > 0) {
        alerts.push({
          id: `staffing-urgent-${Date.now()}`,
          severity: 'CRITICAL',
          category: 'STAFFING',
          title: 'Urgent Staffing Gap',
          description: `${urgentShifts.length} shifts in the next 48 hours have no assigned worker`,
          suggestedAction: 'Immediately reach out to available workers or use pool suggestions',
          createdAt: now,
        });
      }

      if (unstaffedShifts.length > urgentShifts.length) {
        alerts.push({
          id: `staffing-upcoming-${Date.now()}`,
          severity: 'HIGH',
          category: 'STAFFING',
          title: 'Upcoming Staffing Gaps',
          description: `${unstaffedShifts.length - urgentShifts.length} shifts in the next 7 days need coverage`,
          suggestedAction: 'Review shift pool suggestions and send offers',
          createdAt: now,
        });
      }
    }

    // Check for high-risk workers
    const workers = await this.prisma.workerProfile.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    for (const worker of workers.slice(0, 10)) {
      try {
        const churnRisk = await this.workerAnalytics.predictChurnRisk(worker.id);
        if (churnRisk.riskLevel === 'CRITICAL' || churnRisk.riskLevel === 'HIGH') {
          alerts.push({
            id: `churn-risk-${worker.id}`,
            severity: churnRisk.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            category: 'WORKER',
            title: 'High Churn Risk',
            description: `${worker.user.firstName} ${worker.user.lastName} has ${churnRisk.riskLevel.toLowerCase()} churn risk (score: ${churnRisk.riskScore})`,
            affectedEntity: worker.id,
            suggestedAction: 'Schedule a check-in conversation and review retention actions',
            createdAt: now,
          });
        }
      } catch (error) {
        // Skip if churn calculation fails
      }
    }

    // Check for attendance issues
    const recentNoShows = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        status: 'NO_SHOW',
      },
      include: {
        assignedTo: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (recentNoShows.length > 0) {
      alerts.push({
        id: `attendance-noshows-${Date.now()}`,
        severity: recentNoShows.length > 3 ? 'HIGH' : 'MEDIUM',
        category: 'ATTENDANCE',
        title: 'Recent No-Shows',
        description: `${recentNoShows.length} no-shows in the last 7 days`,
        suggestedAction: 'Review no-show patterns and address with affected workers',
        createdAt: now,
      });
    }

    // Check forecast accuracy
    try {
      const last30Days = {
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: now,
      };
      const accuracy = await this.forecastAccuracy.measureAccuracy(restaurantId, last30Days);

      if (accuracy.overallAccuracy < 60) {
        alerts.push({
          id: `forecast-accuracy-${Date.now()}`,
          severity: 'MEDIUM',
          category: 'FORECAST',
          title: 'Low Forecast Accuracy',
          description: `Forecast accuracy is ${accuracy.overallAccuracy.toFixed(1)}% - below target of 70%`,
          suggestedAction: 'Review forecast model and historical data quality',
          createdAt: now,
        });
      }
    } catch (error) {
      // Skip if forecast accuracy unavailable
    }

    // Check labor costs
    try {
      const last30Days = {
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: now,
      };
      const laborAnalysis = await this.laborOptimizer.analyzeLaborCosts(restaurantId, last30Days);

      const overtimePercent = laborAnalysis.summary.totalLaborHours > 0
        ? (laborAnalysis.summary.totalOvertimeHours / laborAnalysis.summary.totalLaborHours) * 100
        : 0;

      if (overtimePercent > 10) {
        alerts.push({
          id: `overtime-high-${Date.now()}`,
          severity: overtimePercent > 15 ? 'HIGH' : 'MEDIUM',
          category: 'LABOR_COST',
          title: 'High Overtime Rate',
          description: `Overtime is ${overtimePercent.toFixed(1)}% of total hours (target: <5%)`,
          suggestedAction: 'Consider hiring additional workers or rebalancing schedules',
          createdAt: now,
        });
      }
    } catch (error) {
      // Skip if labor analysis unavailable
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Compare metrics between restaurants
   */
  async getComparisons(
    restaurantId: string,
    compareToId?: string,
  ): Promise<RestaurantComparison> {
    const restaurant1 = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant1) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateRange = { startDate: thirtyDaysAgo, endDate: now };

    // Get metrics for restaurant 1
    const labor1 = await this.laborOptimizer.analyzeLaborCosts(restaurantId, dateRange);
    const workers1 = await this.prisma.workerProfile.findMany({
      where: { restaurantId, status: 'ACTIVE' },
    });
    const shifts1 = await this.prisma.shift.count({
      where: { restaurantId, startTime: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
    });

    const metrics1: Record<string, number> = {
      laborCost: labor1.summary.totalLaborCost,
      laborHours: labor1.summary.totalLaborHours,
      avgHourlyRate: labor1.summary.averageHourlyRate,
      overtimePercent: labor1.summary.totalLaborHours > 0
        ? (labor1.summary.totalOvertimeHours / labor1.summary.totalLaborHours) * 100
        : 0,
      workerCount: workers1.length,
      avgReliability: workers1.length > 0
        ? workers1.reduce((sum, w) => sum + Number(w.reliabilityScore), 0) / workers1.length
        : 0,
      shiftsCompleted: shifts1,
    };

    const result: RestaurantComparison = {
      restaurant1: {
        id: restaurantId,
        name: restaurant1.name,
        metrics: metrics1,
      },
      differences: [],
      insights: [],
    };

    // Compare to specific restaurant if provided
    if (compareToId) {
      const restaurant2 = await this.prisma.restaurant.findUnique({
        where: { id: compareToId },
      });

      if (restaurant2) {
        const labor2 = await this.laborOptimizer.analyzeLaborCosts(compareToId, dateRange);
        const workers2 = await this.prisma.workerProfile.findMany({
          where: { restaurantId: compareToId, status: 'ACTIVE' },
        });
        const shifts2 = await this.prisma.shift.count({
          where: { restaurantId: compareToId, startTime: { gte: thirtyDaysAgo }, status: 'COMPLETED' },
        });

        const metrics2: Record<string, number> = {
          laborCost: labor2.summary.totalLaborCost,
          laborHours: labor2.summary.totalLaborHours,
          avgHourlyRate: labor2.summary.averageHourlyRate,
          overtimePercent: labor2.summary.totalLaborHours > 0
            ? (labor2.summary.totalOvertimeHours / labor2.summary.totalLaborHours) * 100
            : 0,
          workerCount: workers2.length,
          avgReliability: workers2.length > 0
            ? workers2.reduce((sum, w) => sum + Number(w.reliabilityScore), 0) / workers2.length
            : 0,
          shiftsCompleted: shifts2,
        };

        result.restaurant2 = {
          id: compareToId,
          name: restaurant2.name,
          metrics: metrics2,
        };

        // Calculate differences
        for (const metric of Object.keys(metrics1)) {
          const v1 = metrics1[metric];
          const v2 = metrics2[metric];
          const diff = v1 - v2;
          const percentDiff = v2 !== 0 ? (diff / v2) * 100 : 0;

          result.differences.push({
            metric,
            difference: Math.round(diff * 100) / 100,
            percentDifference: Math.round(percentDiff * 100) / 100,
            winner: diff > 0
              ? (metric === 'laborCost' || metric === 'overtimePercent' ? restaurant2.name : restaurant1.name)
              : (metric === 'laborCost' || metric === 'overtimePercent' ? restaurant1.name : restaurant2.name),
          });
        }

        // Generate insights
        if (metrics1.avgHourlyRate > metrics2.avgHourlyRate * 1.1) {
          result.insights.push(`${restaurant1.name} has higher average hourly rates`);
        }
        if (metrics1.overtimePercent > metrics2.overtimePercent * 1.5) {
          result.insights.push(`${restaurant1.name} has significantly more overtime`);
        }
        if (metrics1.avgReliability > metrics2.avgReliability) {
          result.insights.push(`${restaurant1.name} has more reliable workers on average`);
        }
      }
    }

    return result;
  }

  /**
   * Export report in various formats
   */
  async exportReport(
    restaurantId: string,
    format: ExportFormat,
    dateRange?: DateRange,
  ): Promise<ExportResult> {
    const range = dateRange || {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const [summary, metrics, alerts] = await Promise.all([
      this.getExecutiveSummary(restaurantId, range),
      this.getKeyMetrics(restaurantId),
      this.getAlerts(restaurantId),
    ]);

    const reportData = {
      summary,
      metrics,
      alerts,
      generatedAt: new Date().toISOString(),
    };

    const timestamp = new Date().toISOString().split('T')[0];

    switch (format) {
      case 'JSON':
        return {
          format: 'JSON',
          filename: `analytics-report-${timestamp}.json`,
          mimeType: 'application/json',
          data: JSON.stringify(reportData, null, 2),
          generatedAt: new Date(),
        };

      case 'CSV':
        const csvData = this.generateCSV(summary, metrics);
        return {
          format: 'CSV',
          filename: `analytics-report-${timestamp}.csv`,
          mimeType: 'text/csv',
          data: csvData,
          generatedAt: new Date(),
        };

      case 'EXCEL':
        // Would use a library like exceljs in production
        const excelJson = JSON.stringify({
          sheets: [
            { name: 'Summary', data: this.flattenSummary(summary) },
            { name: 'Metrics', data: metrics },
            { name: 'Alerts', data: alerts },
          ],
        });
        return {
          format: 'EXCEL',
          filename: `analytics-report-${timestamp}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          data: excelJson, // In production, would be actual Excel binary
          generatedAt: new Date(),
        };

      case 'PDF':
        // Would use a library like pdfkit in production
        const pdfContent = this.generatePDFContent(summary, metrics, alerts);
        return {
          format: 'PDF',
          filename: `analytics-report-${timestamp}.pdf`,
          mimeType: 'application/pdf',
          data: pdfContent, // In production, would be actual PDF binary
          generatedAt: new Date(),
        };

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private calculateTrendPercent(current: number, previous: number): number {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  private generateCSV(summary: ExecutiveSummary, metrics: KeyMetric[]): string {
    const lines: string[] = [];

    // Header
    lines.push('Analytics Report');
    lines.push(`Restaurant,${summary.restaurantName}`);
    lines.push(`Generated,${summary.generatedAt.toISOString()}`);
    lines.push(`Period,${summary.dateRange.startDate.toISOString()} to ${summary.dateRange.endDate.toISOString()}`);
    lines.push('');

    // Highlights
    lines.push('Highlights');
    lines.push('Metric,Value');
    lines.push(`Labor Cost,$${summary.highlights.laborCost.toFixed(2)}`);
    lines.push(`Labor Hours,${summary.highlights.laborHours.toFixed(2)}`);
    lines.push(`Shifts Completed,${summary.highlights.shiftsCompleted}`);
    lines.push(`Worker Count,${summary.highlights.workerCount}`);
    lines.push(`Avg Reliability,${summary.highlights.averageReliability}`);
    lines.push('');

    // Key Metrics
    lines.push('Key Metrics');
    lines.push('Metric,Value,Unit,Trend,Status');
    for (const m of metrics) {
      lines.push(`${m.name},${m.value},${m.unit},${m.trendPercent}%,${m.status}`);
    }

    return lines.join('\n');
  }

  private flattenSummary(summary: ExecutiveSummary): Record<string, any>[] {
    return [
      { Metric: 'Labor Cost', Value: summary.highlights.laborCost },
      { Metric: 'Labor Hours', Value: summary.highlights.laborHours },
      { Metric: 'Shifts Completed', Value: summary.highlights.shiftsCompleted },
      { Metric: 'Forecast Accuracy', Value: summary.highlights.forecastAccuracy },
      { Metric: 'Worker Count', Value: summary.highlights.workerCount },
      { Metric: 'Avg Reliability', Value: summary.highlights.averageReliability },
    ];
  }

  private generatePDFContent(
    summary: ExecutiveSummary,
    metrics: KeyMetric[],
    alerts: DashboardAlert[],
  ): string {
    // In production, would use pdfkit to generate actual PDF
    // For now, return structured text representation
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push(`ANALYTICS REPORT - ${summary.restaurantName}`);
    lines.push(`Generated: ${summary.generatedAt.toISOString()}`);
    lines.push('='.repeat(60));
    lines.push('');

    lines.push('EXECUTIVE SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(`Labor Cost: $${summary.highlights.laborCost.toFixed(2)}`);
    lines.push(`Labor Hours: ${summary.highlights.laborHours.toFixed(2)}`);
    lines.push(`Shifts Completed: ${summary.highlights.shiftsCompleted}`);
    lines.push(`Active Workers: ${summary.highlights.workerCount}`);
    lines.push('');

    lines.push('KEY METRICS');
    lines.push('-'.repeat(40));
    for (const m of metrics) {
      lines.push(`${m.name}: ${m.value} ${m.unit} (${m.trend} ${m.trendPercent}%)`);
    }
    lines.push('');

    if (alerts.length > 0) {
      lines.push('ALERTS');
      lines.push('-'.repeat(40));
      for (const a of alerts) {
        lines.push(`[${a.severity}] ${a.title}`);
        lines.push(`  ${a.description}`);
        lines.push(`  Action: ${a.suggestedAction}`);
        lines.push('');
      }
    }

    lines.push('');
    lines.push('='.repeat(60));
    lines.push('END OF REPORT');

    return lines.join('\n');
  }
}
