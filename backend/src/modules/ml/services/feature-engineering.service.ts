import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { WeatherService, WeatherConditions } from '@/modules/ghost-kitchen/services/weather.service';
import {
  FeatureVector,
  FeatureSnapshot,
} from '../entities/ml-model.entity';

/**
 * Feature Engineering Service
 *
 * Prepares feature vectors for ML model training and inference.
 * Handles temporal encoding, weather features, event features, and lag features.
 */

// ==================== Constants ====================

// Feature names in order (must match model training)
const FEATURE_NAMES = [
  // Temporal features (one-hot encoded)
  'hour_0', 'hour_1', 'hour_2', 'hour_3', 'hour_4', 'hour_5',
  'hour_6', 'hour_7', 'hour_8', 'hour_9', 'hour_10', 'hour_11',
  'hour_12', 'hour_13', 'hour_14', 'hour_15', 'hour_16', 'hour_17',
  'hour_18', 'hour_19', 'hour_20', 'hour_21', 'hour_22', 'hour_23',
  'dow_0', 'dow_1', 'dow_2', 'dow_3', 'dow_4', 'dow_5', 'dow_6', // Sunday-Saturday
  'is_weekend',
  'is_holiday',
  'month_sin', 'month_cos', // Cyclical encoding for month
  'week_sin', 'week_cos', // Cyclical encoding for week
  // Weather features
  'temperature',
  'feels_like',
  'humidity',
  'precipitation',
  'wind_speed',
  'cloud_cover',
  'weather_clear', 'weather_cloudy', 'weather_rain', 'weather_snow', 'weather_extreme',
  // Event features
  'event_count',
  'total_attendance_log', // Log-transformed
  'nearest_event_dist_inv', // Inverse distance
  'event_impact_score',
  // Lag features
  'lag_dine_in_1d',
  'lag_dine_in_7d',
  'lag_delivery_1d',
  'lag_delivery_7d',
  // Rolling averages
  'avg_dine_in_7d',
  'avg_delivery_7d',
  'avg_dine_in_28d',
  'avg_delivery_28d',
  // Trend features
  'dine_in_trend',
  'delivery_trend',
];

// Feature scaling parameters (learned from data or defaults)
interface ScalingParams {
  mean: Record<string, number>;
  std: Record<string, number>;
  min: Record<string, number>;
  max: Record<string, number>;
}

const DEFAULT_SCALING: ScalingParams = {
  mean: {
    temperature: 18,
    feels_like: 17,
    humidity: 60,
    precipitation: 2,
    wind_speed: 5,
    cloud_cover: 50,
    total_attendance_log: 4,
    nearest_event_dist_inv: 0.1,
    event_impact_score: 0.2,
    lag_dine_in_1d: 30,
    lag_dine_in_7d: 30,
    lag_delivery_1d: 15,
    lag_delivery_7d: 15,
    avg_dine_in_7d: 30,
    avg_delivery_7d: 15,
    avg_dine_in_28d: 30,
    avg_delivery_28d: 15,
    dine_in_trend: 0,
    delivery_trend: 0,
  },
  std: {
    temperature: 10,
    feels_like: 10,
    humidity: 20,
    precipitation: 5,
    wind_speed: 3,
    cloud_cover: 30,
    total_attendance_log: 2,
    nearest_event_dist_inv: 0.2,
    event_impact_score: 0.3,
    lag_dine_in_1d: 20,
    lag_dine_in_7d: 20,
    lag_delivery_1d: 10,
    lag_delivery_7d: 10,
    avg_dine_in_7d: 15,
    avg_delivery_7d: 8,
    avg_dine_in_28d: 12,
    avg_delivery_28d: 6,
    dine_in_trend: 0.3,
    delivery_trend: 0.3,
  },
  min: {},
  max: {},
};

@Injectable()
export class FeatureEngineeringService {
  private readonly logger = new Logger(FeatureEngineeringService.name);
  private scalingParams: Map<string, ScalingParams> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly weatherService: WeatherService,
  ) {}

  /**
   * Extract features for a restaurant and date/hour
   */
  async extractFeatures(
    restaurantId: string,
    date: Date,
    hourSlot?: number,
  ): Promise<FeatureVector[]> {
    const hours = hourSlot !== undefined ? [hourSlot] : Array.from({ length: 24 }, (_, i) => i);
    const featureVectors: FeatureVector[] = [];

    // Get restaurant for location
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new Error(`Restaurant not found: ${restaurantId}`);
    }

    const lat = Number(restaurant.lat);
    const lng = Number(restaurant.lng);

    // Fetch weather data
    const weatherData = await this.getWeatherFeatures(lat, lng, date);

    // Fetch event data
    const eventData = await this.getEventFeatures(lat, lng, date, 15); // 15 mile radius

    // Fetch lag features
    const lagFeatures = await this.getLagFeatures(restaurantId, date);

    // Build feature vectors for each hour
    for (const hour of hours) {
      const temporalFeatures = this.getTemporalFeatures(date, hour);
      const hourWeather = weatherData[hour] || this.getDefaultWeatherFeatures();
      const hourEvents = eventData[hour] || this.getDefaultEventFeatures();
      const hourLags = lagFeatures[hour] || this.getDefaultLagFeatures();

      const snapshot: Partial<FeatureSnapshot> = {
        restaurantId,
        date,
        hourSlot: hour,
        ...temporalFeatures,
        ...hourWeather,
        ...hourEvents,
        ...hourLags,
      };

      const featureVector = this.buildFeatureVector(snapshot as FeatureSnapshot);
      featureVectors.push({
        ...featureVector,
        metadata: {
          restaurantId,
          date: date.toISOString().split('T')[0],
          hourSlot: hour,
          rawSnapshot: snapshot as FeatureSnapshot,
        },
      });
    }

    return featureVectors;
  }

  /**
   * Normalize features using z-score normalization
   */
  normalizeFeatures(
    features: FeatureVector,
    scalingParams?: ScalingParams,
  ): FeatureVector {
    const params = scalingParams || DEFAULT_SCALING;
    const normalized = [...features.features];

    for (let i = 0; i < features.featureNames.length; i++) {
      const name = features.featureNames[i];

      // Skip one-hot encoded features (already 0 or 1)
      if (
        name.startsWith('hour_') ||
        name.startsWith('dow_') ||
        name.startsWith('weather_') ||
        name === 'is_weekend' ||
        name === 'is_holiday'
      ) {
        continue;
      }

      // Z-score normalization
      const mean = params.mean[name] ?? 0;
      const std = params.std[name] ?? 1;

      if (std > 0) {
        normalized[i] = (normalized[i] - mean) / std;
      }
    }

    return {
      ...features,
      features: normalized,
    };
  }

  /**
   * Get weather features for a date
   */
  async getWeatherFeatures(
    lat: number,
    lon: number,
    date: Date,
  ): Promise<Record<number, Partial<FeatureSnapshot>>> {
    const result: Record<number, Partial<FeatureSnapshot>> = {};

    try {
      const forecast = await this.weatherService.getForecast(lat, lon, 1);
      const targetDate = date.toISOString().split('T')[0];

      for (const hourData of forecast) {
        const hourDate = new Date(hourData.datetime);
        if (hourDate.toISOString().split('T')[0] !== targetDate) continue;

        const hour = hourDate.getHours();
        const weatherCondition = this.categorizeWeather(hourData);

        result[hour] = {
          temperature: hourData.temperature,
          feelsLike: hourData.feelsLike,
          humidity: hourData.humidity,
          precipitation: hourData.precipitation,
          windSpeed: hourData.windSpeed,
          cloudCover: hourData.cloudCover,
          weatherCondition,
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch weather: ${error.message}`);
    }

    // Fill missing hours with defaults
    for (let h = 0; h < 24; h++) {
      if (!result[h]) {
        result[h] = this.getDefaultWeatherFeatures();
      }
    }

    return result;
  }

  /**
   * Get event features for a date
   */
  async getEventFeatures(
    lat: number,
    lon: number,
    date: Date,
    radiusMiles: number,
  ): Promise<Record<number, Partial<FeatureSnapshot>>> {
    const result: Record<number, Partial<FeatureSnapshot>> = {};

    // Initialize all hours with defaults
    for (let h = 0; h < 24; h++) {
      result[h] = this.getDefaultEventFeatures();
    }

    try {
      const dateString = date.toISOString().split('T')[0];
      const startOfDay = new Date(`${dateString}T00:00:00Z`);
      const endOfDay = new Date(`${dateString}T23:59:59Z`);

      // Query cached events
      const events = await this.prisma.cachedEvent.findMany({
        where: {
          startTime: { lte: endOfDay },
          endTime: { gte: startOfDay },
        },
      });

      // Filter events by distance
      const nearbyEvents = events.filter(event => {
        const dist = this.calculateDistance(lat, lon, Number(event.lat), Number(event.lng));
        return dist <= radiusMiles;
      });

      // Calculate hourly event impact
      for (const event of nearbyEvents) {
        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);
        const dist = this.calculateDistance(lat, lon, Number(event.lat), Number(event.lng));

        // Events affect 2 hours before, during, and 1 hour after
        const impactStart = Math.max(0, eventStart.getHours() - 2);
        const impactEnd = Math.min(23, eventEnd.getHours() + 1);

        for (let h = impactStart; h <= impactEnd; h++) {
          const hourData = result[h]!;
          hourData.eventCount = (hourData.eventCount || 0) + 1;
          hourData.totalAttendance = (hourData.totalAttendance || 0) + (event.expectedAttendance || 0);

          if (!hourData.nearestEventDist || dist < hourData.nearestEventDist) {
            hourData.nearestEventDist = dist;
          }

          // Calculate impact score based on event category, size, and distance
          const impactScore = this.calculateEventImpact(
            event.category,
            event.expectedAttendance || 1000,
            dist,
            event.rank || 3,
          );
          hourData.eventImpactScore = Math.max(hourData.eventImpactScore || 0, impactScore);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch events: ${error.message}`);
    }

    return result;
  }

  /**
   * Get temporal features for a date and hour
   */
  getTemporalFeatures(date: Date, hour: number): Partial<FeatureSnapshot> {
    const dayOfWeek = date.getDay();
    const weekOfYear = this.getWeekOfYear(date);
    const monthOfYear = date.getMonth() + 1;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const { isHoliday, holidayName } = this.checkHoliday(date);

    return {
      hourSlot: hour,
      dayOfWeek,
      weekOfYear,
      monthOfYear,
      isWeekend,
      isHoliday,
      holidayName,
    };
  }

  /**
   * Get lag features (historical data)
   */
  async getLagFeatures(
    restaurantId: string,
    date: Date,
  ): Promise<Record<number, Partial<FeatureSnapshot>>> {
    const result: Record<number, Partial<FeatureSnapshot>> = {};

    // Initialize all hours with defaults
    for (let h = 0; h < 24; h++) {
      result[h] = this.getDefaultLagFeatures();
    }

    try {
      // Get dates for lag features
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);

      const lastWeek = new Date(date);
      lastWeek.setDate(lastWeek.getDate() - 7);

      const fourWeeksAgo = new Date(date);
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      // Query historical demand data
      const historicalData = await this.prisma.demandForecast.findMany({
        where: {
          restaurantId,
          date: {
            gte: fourWeeksAgo,
            lt: date,
          },
          actualDineIn: { not: null },
        },
        orderBy: { date: 'desc' },
      });

      // Group by hour
      const byHour: Record<number, typeof historicalData> = {};
      for (let h = 0; h < 24; h++) {
        byHour[h] = [];
      }
      for (const record of historicalData) {
        byHour[record.hourSlot].push(record);
      }

      // Calculate lag features for each hour
      for (let h = 0; h < 24; h++) {
        const hourData = byHour[h];
        if (hourData.length === 0) continue;

        // Yesterday's values
        const yesterdayRecord = hourData.find(r =>
          r.date.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]
        );
        if (yesterdayRecord) {
          result[h].lagDineIn1d = yesterdayRecord.actualDineIn;
          result[h].lagDelivery1d = yesterdayRecord.actualDelivery;
        }

        // Last week's values
        const lastWeekRecord = hourData.find(r =>
          r.date.toISOString().split('T')[0] === lastWeek.toISOString().split('T')[0]
        );
        if (lastWeekRecord) {
          result[h].lagDineIn7d = lastWeekRecord.actualDineIn;
          result[h].lagDelivery7d = lastWeekRecord.actualDelivery;
        }

        // 7-day averages
        const last7Days = hourData.filter(r => {
          const recordDate = new Date(r.date);
          return recordDate >= lastWeek && recordDate < date;
        });
        if (last7Days.length > 0) {
          result[h].avgDineIn7d = this.average(last7Days.map(r => r.actualDineIn || 0));
          result[h].avgDelivery7d = this.average(last7Days.map(r => r.actualDelivery || 0));
        }

        // 28-day averages
        const last28Days = hourData.filter(r => {
          const recordDate = new Date(r.date);
          return recordDate >= fourWeeksAgo && recordDate < date;
        });
        if (last28Days.length > 0) {
          result[h].avgDineIn28d = this.average(last28Days.map(r => r.actualDineIn || 0));
          result[h].avgDelivery28d = this.average(last28Days.map(r => r.actualDelivery || 0));
        }

        // Calculate trends (week-over-week change)
        const hourResult = result[h];
        if (hourResult && hourResult.avgDineIn7d && hourResult.avgDineIn28d && hourResult.avgDineIn28d > 0) {
          hourResult.dineInTrend = (hourResult.avgDineIn7d - hourResult.avgDineIn28d) / hourResult.avgDineIn28d;
        }
        if (hourResult && hourResult.avgDelivery7d && hourResult.avgDelivery28d && hourResult.avgDelivery28d > 0) {
          hourResult.deliveryTrend = (hourResult.avgDelivery7d - hourResult.avgDelivery28d) / hourResult.avgDelivery28d;
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch lag features: ${error.message}`);
    }

    return result;
  }

  /**
   * Store feature snapshot in database
   */
  async storeFeatureSnapshot(snapshot: FeatureSnapshot): Promise<void> {
    await this.prisma.featureSnapshot.upsert({
      where: {
        restaurantId_date_hourSlot: {
          restaurantId: snapshot.restaurantId,
          date: snapshot.date,
          hourSlot: snapshot.hourSlot,
        },
      },
      update: {
        ...snapshot,
        date: snapshot.date,
      },
      create: {
        ...snapshot,
        date: snapshot.date,
      },
    });
  }

  /**
   * Get feature names in order
   */
  getFeatureNames(): string[] {
    return [...FEATURE_NAMES];
  }

  /**
   * Learn scaling parameters from training data
   */
  async learnScalingParams(restaurantId: string): Promise<ScalingParams> {
    const snapshots = await this.prisma.featureSnapshot.findMany({
      where: { restaurantId },
      take: 10000, // Limit to recent data
      orderBy: { date: 'desc' },
    });

    if (snapshots.length < 100) {
      this.logger.warn(`Not enough data for scaling params, using defaults`);
      return DEFAULT_SCALING;
    }

    const params: ScalingParams = {
      mean: {},
      std: {},
      min: {},
      max: {},
    };

    // Calculate statistics for numeric features
    const numericFeatures = [
      'temperature', 'feelsLike', 'humidity', 'precipitation', 'windSpeed', 'cloudCover',
      'eventCount', 'totalAttendance', 'nearestEventDist', 'eventImpactScore',
      'lagDineIn1d', 'lagDineIn7d', 'lagDelivery1d', 'lagDelivery7d',
      'avgDineIn7d', 'avgDelivery7d', 'avgDineIn28d', 'avgDelivery28d',
      'dineInTrend', 'deliveryTrend',
    ];

    for (const feature of numericFeatures) {
      const values = snapshots
        .map(s => (s as any)[feature])
        .filter(v => v !== null && v !== undefined);

      if (values.length > 0) {
        const mean = this.average(values);
        const std = this.standardDeviation(values);
        params.mean[feature] = mean;
        params.std[feature] = std > 0 ? std : 1;
        params.min[feature] = Math.min(...values);
        params.max[feature] = Math.max(...values);
      }
    }

    // Cache the params
    this.scalingParams.set(restaurantId, params);
    await this.redis.setJson(`ml:scaling:${restaurantId}`, params, 86400); // 24h cache

    return params;
  }

  // ==================== Private Methods ====================

  /**
   * Build feature vector from snapshot
   */
  private buildFeatureVector(snapshot: FeatureSnapshot): FeatureVector {
    const features: number[] = [];

    // One-hot encode hour (0-23)
    for (let h = 0; h < 24; h++) {
      features.push(snapshot.hourSlot === h ? 1 : 0);
    }

    // One-hot encode day of week (0-6)
    for (let d = 0; d < 7; d++) {
      features.push(snapshot.dayOfWeek === d ? 1 : 0);
    }

    // Binary features
    features.push(snapshot.isWeekend ? 1 : 0);
    features.push(snapshot.isHoliday ? 1 : 0);

    // Cyclical encoding for month (1-12)
    features.push(Math.sin(2 * Math.PI * snapshot.monthOfYear / 12));
    features.push(Math.cos(2 * Math.PI * snapshot.monthOfYear / 12));

    // Cyclical encoding for week (1-52)
    features.push(Math.sin(2 * Math.PI * snapshot.weekOfYear / 52));
    features.push(Math.cos(2 * Math.PI * snapshot.weekOfYear / 52));

    // Weather features
    features.push(snapshot.temperature ?? 18);
    features.push(snapshot.feelsLike ?? 17);
    features.push(snapshot.humidity ?? 60);
    features.push(snapshot.precipitation ?? 0);
    features.push(snapshot.windSpeed ?? 5);
    features.push(snapshot.cloudCover ?? 50);

    // One-hot encode weather condition
    const weatherConditions = ['clear', 'cloudy', 'rain', 'snow', 'extreme'];
    const condition = snapshot.weatherCondition?.toLowerCase() || 'cloudy';
    for (const wc of weatherConditions) {
      features.push(condition.includes(wc) ? 1 : 0);
    }

    // Event features
    features.push(snapshot.eventCount || 0);
    features.push(Math.log1p(snapshot.totalAttendance || 0)); // Log transform
    features.push(snapshot.nearestEventDist ? 1 / (1 + snapshot.nearestEventDist) : 0); // Inverse
    features.push(snapshot.eventImpactScore || 0);

    // Lag features
    features.push(snapshot.lagDineIn1d ?? 30);
    features.push(snapshot.lagDineIn7d ?? 30);
    features.push(snapshot.lagDelivery1d ?? 15);
    features.push(snapshot.lagDelivery7d ?? 15);

    // Rolling averages
    features.push(snapshot.avgDineIn7d ?? 30);
    features.push(snapshot.avgDelivery7d ?? 15);
    features.push(snapshot.avgDineIn28d ?? 30);
    features.push(snapshot.avgDelivery28d ?? 15);

    // Trend features
    features.push(snapshot.dineInTrend ?? 0);
    features.push(snapshot.deliveryTrend ?? 0);

    return {
      features,
      featureNames: FEATURE_NAMES,
      metadata: {
        restaurantId: snapshot.restaurantId,
        date: snapshot.date.toISOString().split('T')[0],
        hourSlot: snapshot.hourSlot,
      },
    };
  }

  /**
   * Categorize weather conditions
   */
  private categorizeWeather(conditions: WeatherConditions): string {
    if (conditions.temperature < -10 || conditions.temperature > 40) {
      return 'extreme';
    }
    if ((conditions.snowfall && conditions.snowfall > 0) || conditions.precipitation > 20) {
      return 'snow';
    }
    if (conditions.precipitation > 5 || conditions.precipitationProbability > 70) {
      return 'rain';
    }
    if (conditions.cloudCover > 70) {
      return 'cloudy';
    }
    return 'clear';
  }

  /**
   * Calculate event impact score
   */
  private calculateEventImpact(
    category: string,
    attendance: number,
    distanceMiles: number,
    rank: number,
  ): number {
    // Base impact by category
    const categoryImpact: Record<string, number> = {
      SPORTS: 0.8,
      CONCERT: 0.7,
      FESTIVAL: 0.9,
      CONFERENCE: 0.5,
      HOLIDAY: 0.6,
      OTHER: 0.4,
    };

    const baseImpact = categoryImpact[category] || 0.4;

    // Scale by attendance (log scale)
    const attendanceMultiplier = Math.log10(Math.max(100, attendance)) / 5;

    // Distance decay
    const distanceDecay = Math.max(0, 1 - distanceMiles / 20);

    // Rank multiplier (1-5)
    const rankMultiplier = (rank || 3) / 5;

    return Math.min(1, baseImpact * attendanceMultiplier * distanceDecay * rankMultiplier);
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get week of year
   */
  private getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    const oneWeek = 604800000;
    return Math.ceil(diff / oneWeek);
  }

  /**
   * Check if date is a holiday
   */
  private checkHoliday(date: Date): { isHoliday: boolean; holidayName: string | null } {
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    // US Federal holidays (simplified)
    const holidays: Array<{ month: number; day?: number; check?: () => boolean; name: string }> = [
      { month: 0, day: 1, name: "New Year's Day" },
      { month: 6, day: 4, name: 'Independence Day' },
      { month: 11, day: 25, name: 'Christmas' },
      { month: 11, day: 31, name: "New Year's Eve" },
      {
        month: 10,
        check: () => dayOfWeek === 4 && day >= 22 && day <= 28,
        name: 'Thanksgiving',
      },
      {
        month: 4,
        check: () => dayOfWeek === 1 && day >= 25,
        name: 'Memorial Day',
      },
      {
        month: 8,
        check: () => dayOfWeek === 1 && day <= 7,
        name: 'Labor Day',
      },
    ];

    for (const holiday of holidays) {
      if (holiday.month === month) {
        if (holiday.day !== undefined && holiday.day === day) {
          return { isHoliday: true, holidayName: holiday.name };
        }
        if (holiday.check && holiday.check()) {
          return { isHoliday: true, holidayName: holiday.name };
        }
      }
    }

    return { isHoliday: false, holidayName: null };
  }

  /**
   * Default weather features
   */
  private getDefaultWeatherFeatures(): Partial<FeatureSnapshot> {
    return {
      temperature: 18,
      feelsLike: 17,
      humidity: 60,
      precipitation: 0,
      windSpeed: 5,
      cloudCover: 40,
      weatherCondition: 'cloudy',
    };
  }

  /**
   * Default event features
   */
  private getDefaultEventFeatures(): Partial<FeatureSnapshot> {
    return {
      eventCount: 0,
      totalAttendance: 0,
      nearestEventDist: null,
      eventImpactScore: 0,
    };
  }

  /**
   * Default lag features
   */
  private getDefaultLagFeatures(): Partial<FeatureSnapshot> {
    return {
      lagDineIn1d: null,
      lagDineIn7d: null,
      lagDelivery1d: null,
      lagDelivery7d: null,
      avgDineIn7d: null,
      avgDelivery7d: null,
      avgDineIn28d: null,
      avgDelivery28d: null,
      dineInTrend: null,
      deliveryTrend: null,
    };
  }

  /**
   * Calculate average
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.average(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(this.average(squaredDiffs));
  }
}
