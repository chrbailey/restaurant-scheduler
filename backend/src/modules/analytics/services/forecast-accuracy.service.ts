import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';

/**
 * Date range for queries
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Accuracy metrics for a single forecast type
 */
export interface AccuracyMetrics {
  mape: number; // Mean Absolute Percentage Error
  rmse: number; // Root Mean Square Error
  mae: number; // Mean Absolute Error
  bias: number; // Systematic over/under prediction
  r2: number; // R-squared (coefficient of determination)
  sampleCount: number;
}

/**
 * Overall accuracy measurement result
 */
export interface AccuracyMeasurement {
  restaurantId: string;
  dateRange: DateRange;
  overallAccuracy: number; // 0-100 score
  dineInAccuracy: AccuracyMetrics;
  deliveryAccuracy: AccuracyMetrics;
  combinedAccuracy: AccuracyMetrics;
  hourlyBreakdown: {
    hour: number;
    dineInMAPE: number;
    deliveryMAPE: number;
    sampleCount: number;
  }[];
  dayOfWeekBreakdown: {
    dayOfWeek: number;
    dayName: string;
    dineInMAPE: number;
    deliveryMAPE: number;
    sampleCount: number;
  }[];
}

/**
 * Accuracy trend over time
 */
export interface AccuracyTrend {
  restaurantId: string;
  periods: {
    periodStart: string;
    periodEnd: string;
    dineInMAPE: number;
    deliveryMAPE: number;
    overallAccuracy: number;
    sampleCount: number;
  }[];
  trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  trendPercent: number;
  trendDescription: string;
}

/**
 * Weak point in forecast accuracy
 */
export interface ForecastWeakPoint {
  type: 'HOUR' | 'DAY_OF_WEEK' | 'WEATHER' | 'EVENT' | 'VOLUME';
  identifier: string;
  mape: number;
  sampleCount: number;
  description: string;
  suggestedAction: string;
}

/**
 * Accuracy by external factor
 */
export interface FactorAccuracy {
  factor: string;
  values: {
    value: string;
    dineInMAPE: number;
    deliveryMAPE: number;
    sampleCount: number;
  }[];
  bestPerforming: string;
  worstPerforming: string;
}

/**
 * Comprehensive accuracy report
 */
export interface AccuracyReport {
  restaurantId: string;
  generatedAt: Date;
  dateRange: DateRange;
  summary: {
    overallAccuracy: number;
    accuracyTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    dineInAccuracy: number;
    deliveryAccuracy: number;
    totalForecasts: number;
    forecastsWithActuals: number;
  };
  detailedMetrics: {
    dineIn: AccuracyMetrics;
    delivery: AccuracyMetrics;
  };
  weakPoints: ForecastWeakPoint[];
  factorAnalysis: {
    hourOfDay: FactorAccuracy;
    dayOfWeek: FactorAccuracy;
    weather: FactorAccuracy;
  };
  recommendations: string[];
}

/**
 * Forecast Accuracy Service
 *
 * Tracks and analyzes the accuracy of demand forecasts:
 * - Compares predicted vs actual values
 * - Identifies accuracy trends over time
 * - Pinpoints where forecasts fail
 * - Breaks down accuracy by factor (weather, events, time)
 * - Generates comprehensive accuracy reports
 */
@Injectable()
export class ForecastAccuracyService {
  private readonly logger = new Logger(ForecastAccuracyService.name);

  // Cache TTL
  private readonly CACHE_TTL = 3600; // 1 hour

  // Accuracy thresholds
  private readonly ACCURACY_THRESHOLDS = {
    EXCELLENT: 10, // MAPE <= 10%
    GOOD: 20, // MAPE <= 20%
    FAIR: 30, // MAPE <= 30%
    POOR: 50, // MAPE <= 50%
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Measure forecast accuracy over a date range
   */
  async measureAccuracy(
    restaurantId: string,
    dateRange: DateRange,
  ): Promise<AccuracyMeasurement> {
    const cacheKey = `accuracy:${restaurantId}:${dateRange.startDate.toISOString()}:${dateRange.endDate.toISOString()}`;
    const cached = await this.redis.getJson<AccuracyMeasurement>(cacheKey);
    if (cached) {
      return cached;
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant not found: ${restaurantId}`);
    }

    // Get forecasts with actuals
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        actualDineIn: { not: null },
        actualDelivery: { not: null },
      },
    });

    if (forecasts.length === 0) {
      return {
        restaurantId,
        dateRange,
        overallAccuracy: 0,
        dineInAccuracy: this.emptyMetrics(),
        deliveryAccuracy: this.emptyMetrics(),
        combinedAccuracy: this.emptyMetrics(),
        hourlyBreakdown: [],
        dayOfWeekBreakdown: [],
      };
    }

    // Calculate metrics
    const dineInMetrics = this.calculateMetrics(
      forecasts.map(f => ({ predicted: f.dineInForecast, actual: f.actualDineIn! })),
    );

    const deliveryMetrics = this.calculateMetrics(
      forecasts.map(f => ({ predicted: f.deliveryForecast, actual: f.actualDelivery! })),
    );

    const combinedMetrics = this.calculateMetrics(
      forecasts.map(f => ({
        predicted: f.dineInForecast + f.deliveryForecast,
        actual: f.actualDineIn! + f.actualDelivery!,
      })),
    );

    // Hourly breakdown
    const hourlyMap = new Map<number, { dineInErrors: number[]; deliveryErrors: number[] }>();
    for (const f of forecasts) {
      const hourData = hourlyMap.get(f.hourSlot) || { dineInErrors: [], deliveryErrors: [] };

      if (f.actualDineIn! > 0) {
        hourData.dineInErrors.push(
          Math.abs(f.dineInForecast - f.actualDineIn!) / f.actualDineIn!,
        );
      }
      if (f.actualDelivery! > 0) {
        hourData.deliveryErrors.push(
          Math.abs(f.deliveryForecast - f.actualDelivery!) / f.actualDelivery!,
        );
      }

      hourlyMap.set(f.hourSlot, hourData);
    }

    const hourlyBreakdown = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({
        hour,
        dineInMAPE: data.dineInErrors.length > 0
          ? this.average(data.dineInErrors) * 100
          : 0,
        deliveryMAPE: data.deliveryErrors.length > 0
          ? this.average(data.deliveryErrors) * 100
          : 0,
        sampleCount: Math.max(data.dineInErrors.length, data.deliveryErrors.length),
      }))
      .sort((a, b) => a.hour - b.hour);

    // Day of week breakdown
    const dayMap = new Map<number, { dineInErrors: number[]; deliveryErrors: number[] }>();
    for (const f of forecasts) {
      const dayOfWeek = new Date(f.date).getDay();
      const dayData = dayMap.get(dayOfWeek) || { dineInErrors: [], deliveryErrors: [] };

      if (f.actualDineIn! > 0) {
        dayData.dineInErrors.push(
          Math.abs(f.dineInForecast - f.actualDineIn!) / f.actualDineIn!,
        );
      }
      if (f.actualDelivery! > 0) {
        dayData.deliveryErrors.push(
          Math.abs(f.deliveryForecast - f.actualDelivery!) / f.actualDelivery!,
        );
      }

      dayMap.set(dayOfWeek, dayData);
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekBreakdown = Array.from(dayMap.entries())
      .map(([dayOfWeek, data]) => ({
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
        dineInMAPE: data.dineInErrors.length > 0
          ? this.average(data.dineInErrors) * 100
          : 0,
        deliveryMAPE: data.deliveryErrors.length > 0
          ? this.average(data.deliveryErrors) * 100
          : 0,
        sampleCount: Math.max(data.dineInErrors.length, data.deliveryErrors.length),
      }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    // Calculate overall accuracy score (100 - MAPE, clamped to 0-100)
    const overallAccuracy = Math.max(0, Math.min(100, 100 - combinedMetrics.mape));

    const result: AccuracyMeasurement = {
      restaurantId,
      dateRange,
      overallAccuracy: Math.round(overallAccuracy * 100) / 100,
      dineInAccuracy: dineInMetrics,
      deliveryAccuracy: deliveryMetrics,
      combinedAccuracy: combinedMetrics,
      hourlyBreakdown,
      dayOfWeekBreakdown,
    };

    // Cache result
    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  /**
   * Get accuracy trend over time
   */
  async getAccuracyTrend(
    restaurantId: string,
    periodsBack: number = 6,
    periodLengthDays: number = 7,
  ): Promise<AccuracyTrend> {
    const periods: AccuracyTrend['periods'] = [];

    for (let i = periodsBack - 1; i >= 0; i--) {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() - i * periodLengthDays);

      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - periodLengthDays);

      try {
        const accuracy = await this.measureAccuracy(restaurantId, {
          startDate: periodStart,
          endDate: periodEnd,
        });

        if (accuracy.combinedAccuracy.sampleCount > 0) {
          periods.push({
            periodStart: periodStart.toISOString().split('T')[0],
            periodEnd: periodEnd.toISOString().split('T')[0],
            dineInMAPE: accuracy.dineInAccuracy.mape,
            deliveryMAPE: accuracy.deliveryAccuracy.mape,
            overallAccuracy: accuracy.overallAccuracy,
            sampleCount: accuracy.combinedAccuracy.sampleCount,
          });
        }
      } catch (error) {
        this.logger.warn(`Error calculating accuracy for period: ${error}`);
      }
    }

    // Determine trend
    let trend: 'IMPROVING' | 'STABLE' | 'DEGRADING' = 'STABLE';
    let trendPercent = 0;
    let trendDescription = 'Accuracy is stable';

    if (periods.length >= 3) {
      const firstHalf = periods.slice(0, Math.floor(periods.length / 2));
      const secondHalf = periods.slice(Math.floor(periods.length / 2));

      const firstAvg = this.average(firstHalf.map(p => p.overallAccuracy));
      const secondAvg = this.average(secondHalf.map(p => p.overallAccuracy));

      const change = secondAvg - firstAvg;
      trendPercent = Math.round((change / Math.max(firstAvg, 1)) * 10000) / 100;

      if (change > 3) {
        trend = 'IMPROVING';
        trendDescription = `Accuracy improved by ${trendPercent}% over the period`;
      } else if (change < -3) {
        trend = 'DEGRADING';
        trendDescription = `Accuracy declined by ${Math.abs(trendPercent)}% over the period`;
      } else {
        trendDescription = 'Accuracy is stable within normal variance';
      }
    }

    return {
      restaurantId,
      periods,
      trend,
      trendPercent,
      trendDescription,
    };
  }

  /**
   * Identify weak points in forecast accuracy
   */
  async identifyWeakPoints(
    restaurantId: string,
    dateRange?: DateRange,
  ): Promise<ForecastWeakPoint[]> {
    const range = dateRange || {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const accuracy = await this.measureAccuracy(restaurantId, range);
    const weakPoints: ForecastWeakPoint[] = [];

    // Check hourly weak points
    for (const hourData of accuracy.hourlyBreakdown) {
      const avgMAPE = (hourData.dineInMAPE + hourData.deliveryMAPE) / 2;
      if (avgMAPE > this.ACCURACY_THRESHOLDS.POOR && hourData.sampleCount >= 5) {
        weakPoints.push({
          type: 'HOUR',
          identifier: `${hourData.hour}:00`,
          mape: Math.round(avgMAPE * 100) / 100,
          sampleCount: hourData.sampleCount,
          description: `Forecasts at ${hourData.hour}:00 have ${avgMAPE.toFixed(1)}% average error`,
          suggestedAction: 'Review historical patterns for this hour and adjust forecasting model',
        });
      }
    }

    // Check day of week weak points
    for (const dayData of accuracy.dayOfWeekBreakdown) {
      const avgMAPE = (dayData.dineInMAPE + dayData.deliveryMAPE) / 2;
      if (avgMAPE > this.ACCURACY_THRESHOLDS.POOR && dayData.sampleCount >= 3) {
        weakPoints.push({
          type: 'DAY_OF_WEEK',
          identifier: dayData.dayName,
          mape: Math.round(avgMAPE * 100) / 100,
          sampleCount: dayData.sampleCount,
          description: `${dayData.dayName} forecasts have ${avgMAPE.toFixed(1)}% average error`,
          suggestedAction: `Collect more training data for ${dayData.dayName}s or check for recurring events`,
        });
      }
    }

    // Check for volume-related weak points
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: { gte: range.startDate, lte: range.endDate },
        actualDineIn: { not: null },
      },
    });

    // Group by volume level
    const highVolume = forecasts.filter(f => f.actualDineIn! + f.actualDelivery! > 50);
    const lowVolume = forecasts.filter(f => f.actualDineIn! + f.actualDelivery! <= 10);

    if (highVolume.length >= 5) {
      const highVolumeMAPE = this.calculateMAPE(
        highVolume.map(f => ({
          predicted: f.dineInForecast + f.deliveryForecast,
          actual: f.actualDineIn! + f.actualDelivery!,
        })),
      );

      if (highVolumeMAPE > this.ACCURACY_THRESHOLDS.FAIR) {
        weakPoints.push({
          type: 'VOLUME',
          identifier: 'High Volume',
          mape: Math.round(highVolumeMAPE * 100) / 100,
          sampleCount: highVolume.length,
          description: `High-volume periods (50+ covers) have ${highVolumeMAPE.toFixed(1)}% error`,
          suggestedAction: 'Model may underestimate peak demand - consider adjusting capacity assumptions',
        });
      }
    }

    if (lowVolume.length >= 5) {
      const lowVolumeMAPE = this.calculateMAPE(
        lowVolume.map(f => ({
          predicted: f.dineInForecast + f.deliveryForecast,
          actual: f.actualDineIn! + f.actualDelivery!,
        })),
      );

      if (lowVolumeMAPE > this.ACCURACY_THRESHOLDS.POOR) {
        weakPoints.push({
          type: 'VOLUME',
          identifier: 'Low Volume',
          mape: Math.round(lowVolumeMAPE * 100) / 100,
          sampleCount: lowVolume.length,
          description: `Low-volume periods (<10 covers) have ${lowVolumeMAPE.toFixed(1)}% error`,
          suggestedAction: 'Small variations have large percentage impact - consider absolute error metrics',
        });
      }
    }

    // Check weather-related accuracy
    const weatherGroups = new Map<string, typeof forecasts>();
    for (const f of forecasts) {
      const weatherType = this.categorizeWeather(f.weatherAdjustment);
      const group = weatherGroups.get(weatherType) || [];
      group.push(f);
      weatherGroups.set(weatherType, group);
    }

    for (const [weather, group] of weatherGroups) {
      if (group.length >= 5) {
        const mape = this.calculateMAPE(
          group.map(f => ({
            predicted: f.dineInForecast + f.deliveryForecast,
            actual: f.actualDineIn! + f.actualDelivery!,
          })),
        );

        if (mape > this.ACCURACY_THRESHOLDS.POOR) {
          weakPoints.push({
            type: 'WEATHER',
            identifier: weather,
            mape: Math.round(mape * 100) / 100,
            sampleCount: group.length,
            description: `${weather} weather forecasts have ${mape.toFixed(1)}% error`,
            suggestedAction: 'Recalibrate weather adjustment factors for this condition',
          });
        }
      }
    }

    return weakPoints.sort((a, b) => b.mape - a.mape);
  }

  /**
   * Get accuracy breakdown by factor
   */
  async getAccuracyByFactor(
    restaurantId: string,
    dateRange?: DateRange,
  ): Promise<{
    weather: FactorAccuracy;
    dayOfWeek: FactorAccuracy;
    hourOfDay: FactorAccuracy;
    events: FactorAccuracy;
  }> {
    const range = dateRange || {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: { gte: range.startDate, lte: range.endDate },
        actualDineIn: { not: null },
        actualDelivery: { not: null },
      },
    });

    // Weather accuracy
    const weatherGroups = this.groupBy(forecasts, f => this.categorizeWeather(f.weatherAdjustment));
    const weatherAccuracy = this.buildFactorAccuracy('Weather', weatherGroups);

    // Day of week accuracy
    const dayGroups = this.groupBy(forecasts, f => {
      const day = new Date(f.date).getDay();
      return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    });
    const dayOfWeekAccuracy = this.buildFactorAccuracy('Day of Week', dayGroups);

    // Hour of day accuracy
    const hourGroups = this.groupBy(forecasts, f => `${f.hourSlot}:00`);
    const hourOfDayAccuracy = this.buildFactorAccuracy('Hour', hourGroups);

    // Events accuracy
    const eventGroups = this.groupBy(forecasts, f => this.categorizeEvent(f.eventAdjustment));
    const eventsAccuracy = this.buildFactorAccuracy('Events', eventGroups);

    return {
      weather: weatherAccuracy,
      dayOfWeek: dayOfWeekAccuracy,
      hourOfDay: hourOfDayAccuracy,
      events: eventsAccuracy,
    };
  }

  /**
   * Generate comprehensive accuracy report
   */
  async generateAccuracyReport(
    restaurantId: string,
    dateRange?: DateRange,
  ): Promise<AccuracyReport> {
    const range = dateRange || {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const [accuracy, trend, weakPoints, factors] = await Promise.all([
      this.measureAccuracy(restaurantId, range),
      this.getAccuracyTrend(restaurantId),
      this.identifyWeakPoints(restaurantId, range),
      this.getAccuracyByFactor(restaurantId, range),
    ]);

    // Count total forecasts
    const totalForecasts = await this.prisma.demandForecast.count({
      where: {
        restaurantId,
        date: { gte: range.startDate, lte: range.endDate },
      },
    });

    const forecastsWithActuals = await this.prisma.demandForecast.count({
      where: {
        restaurantId,
        date: { gte: range.startDate, lte: range.endDate },
        actualDineIn: { not: null },
      },
    });

    // Generate recommendations
    const recommendations: string[] = [];

    if (accuracy.overallAccuracy < 70) {
      recommendations.push('Overall accuracy is below target - consider retraining the forecast model');
    }

    if (trend.trend === 'DEGRADING') {
      recommendations.push('Accuracy is declining - investigate recent changes in demand patterns');
    }

    if (weakPoints.length > 0) {
      const topWeakPoint = weakPoints[0];
      recommendations.push(
        `Priority fix: ${topWeakPoint.type} "${topWeakPoint.identifier}" - ${topWeakPoint.suggestedAction}`,
      );
    }

    if (accuracy.dineInAccuracy.bias > 10) {
      recommendations.push('Dine-in forecasts are systematically too high - adjust baseline down');
    } else if (accuracy.dineInAccuracy.bias < -10) {
      recommendations.push('Dine-in forecasts are systematically too low - adjust baseline up');
    }

    if (accuracy.deliveryAccuracy.bias > 10) {
      recommendations.push('Delivery forecasts are systematically too high - adjust baseline down');
    } else if (accuracy.deliveryAccuracy.bias < -10) {
      recommendations.push('Delivery forecasts are systematically too low - adjust baseline up');
    }

    if (forecastsWithActuals / totalForecasts < 0.5) {
      recommendations.push('Less than 50% of forecasts have actuals recorded - improve data collection');
    }

    if (recommendations.length === 0) {
      recommendations.push('Forecast accuracy is within acceptable range - continue monitoring');
    }

    return {
      restaurantId,
      generatedAt: new Date(),
      dateRange: range,
      summary: {
        overallAccuracy: accuracy.overallAccuracy,
        accuracyTrend: trend.trend,
        dineInAccuracy: Math.max(0, 100 - accuracy.dineInAccuracy.mape),
        deliveryAccuracy: Math.max(0, 100 - accuracy.deliveryAccuracy.mape),
        totalForecasts,
        forecastsWithActuals,
      },
      detailedMetrics: {
        dineIn: accuracy.dineInAccuracy,
        delivery: accuracy.deliveryAccuracy,
      },
      weakPoints,
      factorAnalysis: {
        hourOfDay: factors.hourOfDay,
        dayOfWeek: factors.dayOfWeek,
        weather: factors.weather,
      },
      recommendations,
    };
  }

  // ==================== Private Helper Methods ====================

  private calculateMetrics(
    data: { predicted: number; actual: number }[],
  ): AccuracyMetrics {
    if (data.length === 0) {
      return this.emptyMetrics();
    }

    const mape = this.calculateMAPE(data);
    const { rmse, mae } = this.calculateRMSEandMAE(data);
    const bias = this.calculateBias(data);
    const r2 = this.calculateR2(data);

    return {
      mape: Math.round(mape * 100) / 100,
      rmse: Math.round(rmse * 100) / 100,
      mae: Math.round(mae * 100) / 100,
      bias: Math.round(bias * 100) / 100,
      r2: Math.round(r2 * 1000) / 1000,
      sampleCount: data.length,
    };
  }

  private emptyMetrics(): AccuracyMetrics {
    return {
      mape: 0,
      rmse: 0,
      mae: 0,
      bias: 0,
      r2: 0,
      sampleCount: 0,
    };
  }

  private calculateMAPE(data: { predicted: number; actual: number }[]): number {
    const validData = data.filter(d => d.actual > 0);
    if (validData.length === 0) return 0;

    const sum = validData.reduce(
      (acc, d) => acc + Math.abs(d.predicted - d.actual) / d.actual,
      0,
    );

    return (sum / validData.length) * 100;
  }

  private calculateRMSEandMAE(data: { predicted: number; actual: number }[]): {
    rmse: number;
    mae: number;
  } {
    if (data.length === 0) return { rmse: 0, mae: 0 };

    const errors = data.map(d => d.predicted - d.actual);
    const squaredErrors = errors.map(e => e * e);

    const mae = errors.reduce((acc, e) => acc + Math.abs(e), 0) / data.length;
    const mse = squaredErrors.reduce((acc, e) => acc + e, 0) / data.length;
    const rmse = Math.sqrt(mse);

    return { rmse, mae };
  }

  private calculateBias(data: { predicted: number; actual: number }[]): number {
    if (data.length === 0) return 0;

    const validData = data.filter(d => d.actual > 0);
    if (validData.length === 0) return 0;

    const biasSum = validData.reduce(
      (acc, d) => acc + (d.predicted - d.actual) / d.actual,
      0,
    );

    return (biasSum / validData.length) * 100;
  }

  private calculateR2(data: { predicted: number; actual: number }[]): number {
    if (data.length < 2) return 0;

    const actuals = data.map(d => d.actual);
    const predicted = data.map(d => d.predicted);
    const meanActual = this.average(actuals);

    const ssTot = actuals.reduce((acc, a) => acc + Math.pow(a - meanActual, 2), 0);
    const ssRes = data.reduce((acc, d) => acc + Math.pow(d.actual - d.predicted, 2), 0);

    if (ssTot === 0) return 0;

    return 1 - ssRes / ssTot;
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private categorizeWeather(adjustment: number): string {
    if (adjustment <= -0.3) return 'Severe';
    if (adjustment <= -0.1) return 'Bad';
    if (adjustment >= 0.1) return 'Good';
    return 'Neutral';
  }

  private categorizeEvent(adjustment: number): string {
    if (adjustment >= 0.3) return 'Major Event';
    if (adjustment >= 0.1) return 'Minor Event';
    if (adjustment <= -0.1) return 'Slow Period';
    return 'Normal';
  }

  private groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of arr) {
      const key = keyFn(item);
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return map;
  }

  private buildFactorAccuracy(
    factor: string,
    groups: Map<string, any[]>,
  ): FactorAccuracy {
    const values = Array.from(groups.entries())
      .map(([value, items]) => ({
        value,
        dineInMAPE: this.calculateMAPE(
          items.map(f => ({ predicted: f.dineInForecast, actual: f.actualDineIn! })),
        ),
        deliveryMAPE: this.calculateMAPE(
          items.map(f => ({ predicted: f.deliveryForecast, actual: f.actualDelivery! })),
        ),
        sampleCount: items.length,
      }))
      .filter(v => v.sampleCount >= 3);

    const sorted = [...values].sort((a, b) =>
      (a.dineInMAPE + a.deliveryMAPE) - (b.dineInMAPE + b.deliveryMAPE),
    );

    return {
      factor,
      values,
      bestPerforming: sorted[0]?.value || 'N/A',
      worstPerforming: sorted[sorted.length - 1]?.value || 'N/A',
    };
  }
}
