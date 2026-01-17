import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { WeatherService, WeatherConditions } from './weather.service';

/**
 * Demand Forecaster Service
 *
 * Predicts dine-in and delivery demand to identify optimal ghost kitchen windows.
 * Uses historical patterns, weather data, and event information.
 */

export interface HourlyForecast {
  hour: number; // 0-23
  dineInForecast: number; // Expected covers
  deliveryForecast: number; // Expected orders
  confidence: number; // 0-1
  weatherAdjustment: number; // -1 to +1 multiplier adjustment
  eventAdjustment: number; // -1 to +1 multiplier adjustment
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0-6
  hourlyForecasts: HourlyForecast[];
  totalDineIn: number;
  totalDelivery: number;
  peakDineInHour: number;
  peakDeliveryHour: number;
}

export interface HistoricalPattern {
  dayOfWeek: number;
  hourlyAverages: {
    hour: number;
    avgDineIn: number;
    avgDelivery: number;
    stdDevDineIn: number;
    stdDevDelivery: number;
    sampleCount: number;
  }[];
}

export interface LocalEvent {
  id: string;
  name: string;
  type: 'SPORTS' | 'CONCERT' | 'FESTIVAL' | 'CONVENTION' | 'HOLIDAY' | 'OTHER';
  startTime: Date;
  endTime: Date;
  expectedAttendance: number;
  distanceMiles: number;
}

@Injectable()
export class DemandForecasterService {
  private readonly logger = new Logger(DemandForecasterService.name);

  // Weighting factors for historical data (more recent = higher weight)
  private readonly RECENCY_WEIGHTS = [0.4, 0.25, 0.2, 0.15]; // Last 4 same day-of-week

  // Weather impact factors
  private readonly WEATHER_IMPACT = {
    rain: { dineIn: -0.2, delivery: 0.3 },
    heavyRain: { dineIn: -0.4, delivery: 0.5 },
    snow: { dineIn: -0.5, delivery: 0.4 },
    extreme: { dineIn: -0.7, delivery: -0.2 },
    sunny: { dineIn: 0.1, delivery: -0.05 },
    cloudy: { dineIn: 0, delivery: 0 },
  };

  // Event impact factors (per 1000 expected attendees)
  private readonly EVENT_IMPACT_PER_THOUSAND = {
    SPORTS: { dineIn: 0.15, delivery: 0.25 }, // Sports = more delivery orders
    CONCERT: { dineIn: 0.1, delivery: 0.2 },
    FESTIVAL: { dineIn: 0.2, delivery: 0.15 },
    CONVENTION: { dineIn: 0.25, delivery: 0.1 },
    HOLIDAY: { dineIn: -0.1, delivery: 0.2 }, // Holidays = less dine-in
    OTHER: { dineIn: 0.05, delivery: 0.1 },
  };

  // Distance decay for events (impact reduces with distance)
  private readonly DISTANCE_DECAY_MILES = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly weatherService: WeatherService,
  ) {}

  /**
   * Generate demand forecast for a restaurant
   */
  async forecastDemand(
    restaurantId: string,
    date: Date,
    hours: number[] = Array.from({ length: 24 }, (_, i) => i),
  ): Promise<HourlyForecast[]> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new Error(`Restaurant not found: ${restaurantId}`);
    }

    const dateString = this.toDateString(date);
    const dayOfWeek = date.getDay();

    // Get historical patterns for this day of week
    const historicalPatterns = await this.getHistoricalPatterns(restaurantId);
    const dayPattern = historicalPatterns.find(p => p.dayOfWeek === dayOfWeek);

    // Get weather forecast
    const weatherForecast = await this.weatherService.getForecast(
      Number(restaurant.lat),
      Number(restaurant.lng),
      1,
    );

    // Get local events (would integrate with external event API)
    const localEvents = await this.getLocalEvents(restaurantId, date);

    const forecasts: HourlyForecast[] = [];

    for (const hour of hours) {
      const hourlyPattern = dayPattern?.hourlyAverages.find(h => h.hour === hour);
      const hourWeather = weatherForecast.find(w =>
        new Date(w.datetime).getHours() === hour
      );

      // Base forecast from historical data
      const baseDineIn = hourlyPattern?.avgDineIn || 0;
      const baseDelivery = hourlyPattern?.avgDelivery || 0;

      // Calculate adjustments
      const weatherAdj = hourWeather
        ? this.calculateWeatherImpact(hourWeather)
        : { dineIn: 0, delivery: 0 };

      const eventAdj = this.calculateEventImpact(localEvents, date, hour);

      // Apply adjustments
      const dineInForecast = Math.max(0, Math.round(
        baseDineIn * (1 + weatherAdj.dineIn + eventAdj.dineIn)
      ));
      const deliveryForecast = Math.max(0, Math.round(
        baseDelivery * (1 + weatherAdj.delivery + eventAdj.delivery)
      ));

      // Calculate confidence based on sample size and variance
      const confidence = this.calculateConfidence(hourlyPattern);

      forecasts.push({
        hour,
        dineInForecast,
        deliveryForecast,
        confidence,
        weatherAdjustment: (weatherAdj.dineIn + weatherAdj.delivery) / 2,
        eventAdjustment: (eventAdj.dineIn + eventAdj.delivery) / 2,
      });
    }

    // Store forecast in database
    await this.storeForecast(restaurantId, dateString, forecasts);

    return forecasts;
  }

  /**
   * Get dine-in traffic prediction for a date range
   */
  async getDineInForecast(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DailyForecast[]> {
    const forecasts: DailyForecast[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const hourlyForecasts = await this.forecastDemand(restaurantId, new Date(currentDate));

      const totalDineIn = hourlyForecasts.reduce((sum, h) => sum + h.dineInForecast, 0);
      const totalDelivery = hourlyForecasts.reduce((sum, h) => sum + h.deliveryForecast, 0);

      const peakDineInHour = hourlyForecasts.reduce(
        (max, h) => h.dineInForecast > max.dineInForecast ? h : max,
        hourlyForecasts[0],
      ).hour;

      const peakDeliveryHour = hourlyForecasts.reduce(
        (max, h) => h.deliveryForecast > max.deliveryForecast ? h : max,
        hourlyForecasts[0],
      ).hour;

      forecasts.push({
        date: this.toDateString(currentDate),
        dayOfWeek: currentDate.getDay(),
        hourlyForecasts,
        totalDineIn,
        totalDelivery,
        peakDineInHour,
        peakDeliveryHour,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return forecasts;
  }

  /**
   * Get delivery order prediction for a date range
   */
  async getDeliveryForecast(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DailyForecast[]> {
    // Uses same underlying data as getDineInForecast
    return this.getDineInForecast(restaurantId, startDate, endDate);
  }

  /**
   * Get historical patterns for a restaurant
   */
  async getHistoricalPatterns(restaurantId: string): Promise<HistoricalPattern[]> {
    const cacheKey = `forecast:patterns:${restaurantId}`;
    const cached = await this.redis.getJson<HistoricalPattern[]>(cacheKey);

    if (cached) {
      return cached;
    }

    // Look back 8 weeks for pattern analysis
    const lookbackWeeks = 8;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackWeeks * 7);

    // Get historical sessions and orders
    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: { gte: startDate },
      },
      include: {
        orders: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    // Build patterns by day of week
    const patterns: HistoricalPattern[] = [];

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const hourlyData: Map<number, { dineIn: number[]; delivery: number[] }> = new Map();

      // Initialize all hours
      for (let h = 0; h < 24; h++) {
        hourlyData.set(h, { dineIn: [], delivery: [] });
      }

      // Aggregate data from sessions
      for (const session of sessions) {
        const sessionDate = new Date(session.startedAt);
        if (sessionDate.getDay() !== dayOfWeek) continue;

        // Group orders by hour
        for (const order of session.orders) {
          const orderHour = new Date(order.receivedAt).getHours();
          const hourData = hourlyData.get(orderHour)!;
          hourData.delivery.push(1);
        }
      }

      // TODO: In production, would also pull actual dine-in POS data
      // For now, estimate dine-in based on delivery inverse pattern

      const hourlyAverages = Array.from(hourlyData.entries()).map(([hour, data]) => {
        const deliverySum = data.delivery.length;
        const deliverySamples = Math.ceil(data.delivery.length / lookbackWeeks) || 1;
        const avgDelivery = deliverySum / deliverySamples;

        // Estimate dine-in (inverse correlation in ghost kitchen periods)
        const estimatedDineIn = this.estimateDineInFromDelivery(hour, avgDelivery);

        return {
          hour,
          avgDineIn: estimatedDineIn,
          avgDelivery,
          stdDevDineIn: this.calculateStdDev(data.dineIn) || estimatedDineIn * 0.3,
          stdDevDelivery: this.calculateStdDev(data.delivery) || avgDelivery * 0.3,
          sampleCount: deliverySamples,
        };
      });

      patterns.push({
        dayOfWeek,
        hourlyAverages,
      });
    }

    // Cache for 1 hour
    await this.redis.setJson(cacheKey, patterns, 3600);

    return patterns;
  }

  /**
   * Incorporate weather data into forecast
   */
  incorporateWeather(
    forecast: HourlyForecast[],
    weatherData: WeatherConditions,
  ): HourlyForecast[] {
    const impact = this.calculateWeatherImpact(weatherData);

    return forecast.map(f => ({
      ...f,
      dineInForecast: Math.max(0, Math.round(f.dineInForecast * (1 + impact.dineIn))),
      deliveryForecast: Math.max(0, Math.round(f.deliveryForecast * (1 + impact.delivery))),
      weatherAdjustment: (impact.dineIn + impact.delivery) / 2,
    }));
  }

  /**
   * Incorporate local events into forecast
   */
  incorporateEvents(
    forecast: HourlyForecast[],
    date: Date,
    localEvents: LocalEvent[],
  ): HourlyForecast[] {
    return forecast.map(f => {
      const eventAdj = this.calculateEventImpact(localEvents, date, f.hour);
      return {
        ...f,
        dineInForecast: Math.max(0, Math.round(f.dineInForecast * (1 + eventAdj.dineIn))),
        deliveryForecast: Math.max(0, Math.round(f.deliveryForecast * (1 + eventAdj.delivery))),
        eventAdjustment: (eventAdj.dineIn + eventAdj.delivery) / 2,
      };
    });
  }

  /**
   * Store forecast in database for tracking accuracy
   */
  private async storeForecast(
    restaurantId: string,
    date: string,
    forecasts: HourlyForecast[],
  ): Promise<void> {
    for (const forecast of forecasts) {
      await this.prisma.demandForecast.upsert({
        where: {
          restaurantId_date_hourSlot: {
            restaurantId,
            date: new Date(date),
            hourSlot: forecast.hour,
          },
        },
        update: {
          dineInForecast: forecast.dineInForecast,
          deliveryForecast: forecast.deliveryForecast,
          weatherAdjustment: forecast.weatherAdjustment,
          eventAdjustment: forecast.eventAdjustment,
          confidence: forecast.confidence,
        },
        create: {
          restaurantId,
          date: new Date(date),
          hourSlot: forecast.hour,
          dineInForecast: forecast.dineInForecast,
          deliveryForecast: forecast.deliveryForecast,
          weatherAdjustment: forecast.weatherAdjustment,
          eventAdjustment: forecast.eventAdjustment,
          confidence: forecast.confidence,
        },
      });
    }
  }

  /**
   * Update actual values for ML training
   */
  async updateActuals(
    restaurantId: string,
    date: Date,
    hourSlot: number,
    actualDineIn: number,
    actualDelivery: number,
  ): Promise<void> {
    await this.prisma.demandForecast.updateMany({
      where: {
        restaurantId,
        date,
        hourSlot,
      },
      data: {
        actualDineIn,
        actualDelivery,
      },
    });

    this.logger.debug(
      `Updated actuals for ${restaurantId} ${date.toISOString()} hour ${hourSlot}: ` +
      `dineIn=${actualDineIn}, delivery=${actualDelivery}`,
    );
  }

  /**
   * Get forecast accuracy metrics
   */
  async getAccuracyMetrics(
    restaurantId: string,
    daysBack: number = 30,
  ): Promise<{
    dineInMAPE: number;
    deliveryMAPE: number;
    dineInBias: number;
    deliveryBias: number;
    sampleCount: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        date: { gte: startDate },
        actualDineIn: { not: null },
        actualDelivery: { not: null },
      },
    });

    if (forecasts.length === 0) {
      return {
        dineInMAPE: 0,
        deliveryMAPE: 0,
        dineInBias: 0,
        deliveryBias: 0,
        sampleCount: 0,
      };
    }

    // Calculate MAPE (Mean Absolute Percentage Error)
    let dineInAPE = 0;
    let deliveryAPE = 0;
    let dineInBias = 0;
    let deliveryBias = 0;

    for (const f of forecasts) {
      const actualDineIn = f.actualDineIn || 0;
      const actualDelivery = f.actualDelivery || 0;

      if (actualDineIn > 0) {
        dineInAPE += Math.abs(f.dineInForecast - actualDineIn) / actualDineIn;
        dineInBias += (f.dineInForecast - actualDineIn) / actualDineIn;
      }

      if (actualDelivery > 0) {
        deliveryAPE += Math.abs(f.deliveryForecast - actualDelivery) / actualDelivery;
        deliveryBias += (f.deliveryForecast - actualDelivery) / actualDelivery;
      }
    }

    return {
      dineInMAPE: (dineInAPE / forecasts.length) * 100,
      deliveryMAPE: (deliveryAPE / forecasts.length) * 100,
      dineInBias: (dineInBias / forecasts.length) * 100,
      deliveryBias: (deliveryBias / forecasts.length) * 100,
      sampleCount: forecasts.length,
    };
  }

  /**
   * Calculate weather impact on demand
   */
  private calculateWeatherImpact(
    conditions: WeatherConditions,
  ): { dineIn: number; delivery: number } {
    // Check for extreme conditions first
    if (conditions.temperature < 0 || conditions.temperature > 40) {
      return this.WEATHER_IMPACT.extreme;
    }

    if (conditions.precipitation > 50) {
      return this.WEATHER_IMPACT.heavyRain;
    }

    if (conditions.precipitation > 20) {
      return this.WEATHER_IMPACT.rain;
    }

    if (conditions.snowfall && conditions.snowfall > 0) {
      return this.WEATHER_IMPACT.snow;
    }

    if (conditions.cloudCover < 30) {
      return this.WEATHER_IMPACT.sunny;
    }

    return this.WEATHER_IMPACT.cloudy;
  }

  /**
   * Calculate event impact on demand
   */
  private calculateEventImpact(
    events: LocalEvent[],
    date: Date,
    hour: number,
  ): { dineIn: number; delivery: number } {
    let totalDineInImpact = 0;
    let totalDeliveryImpact = 0;

    const targetTime = new Date(date);
    targetTime.setHours(hour, 0, 0, 0);

    for (const event of events) {
      // Check if event overlaps with this hour
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Events impact demand before, during, and after
      const impactStart = new Date(eventStart);
      impactStart.setHours(impactStart.getHours() - 2); // 2 hours before

      const impactEnd = new Date(eventEnd);
      impactEnd.setHours(impactEnd.getHours() + 1); // 1 hour after

      if (targetTime >= impactStart && targetTime <= impactEnd) {
        // Calculate distance decay
        const distanceMultiplier = Math.max(
          0,
          1 - event.distanceMiles / this.DISTANCE_DECAY_MILES,
        );

        // Calculate attendance multiplier
        const attendanceMultiplier = event.expectedAttendance / 1000;

        const eventImpact = this.EVENT_IMPACT_PER_THOUSAND[event.type] ||
          this.EVENT_IMPACT_PER_THOUSAND.OTHER;

        totalDineInImpact += eventImpact.dineIn * distanceMultiplier * attendanceMultiplier;
        totalDeliveryImpact += eventImpact.delivery * distanceMultiplier * attendanceMultiplier;
      }
    }

    // Cap impact at reasonable levels
    return {
      dineIn: Math.min(0.5, Math.max(-0.5, totalDineInImpact)),
      delivery: Math.min(0.8, Math.max(-0.3, totalDeliveryImpact)),
    };
  }

  /**
   * Get local events for forecasting
   * TODO: Integrate with external event API (Ticketmaster, SeatGeek, etc.)
   */
  private async getLocalEvents(
    restaurantId: string,
    date: Date,
  ): Promise<LocalEvent[]> {
    // For now, return empty array - would integrate with event API
    // Could also check for known holidays

    const holidays = this.getHolidays(date);
    return holidays.map(name => ({
      id: `holiday-${name}`,
      name,
      type: 'HOLIDAY' as const,
      startTime: new Date(date.setHours(0, 0, 0, 0)),
      endTime: new Date(date.setHours(23, 59, 59, 999)),
      expectedAttendance: 0,
      distanceMiles: 0,
    }));
  }

  /**
   * Get holidays for a given date
   */
  private getHolidays(date: Date): string[] {
    const holidays: string[] = [];
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    // US Federal holidays (simplified)
    if (month === 0 && day === 1) holidays.push("New Year's Day");
    if (month === 6 && day === 4) holidays.push('Independence Day');
    if (month === 11 && day === 25) holidays.push('Christmas');
    if (month === 11 && day === 31) holidays.push("New Year's Eve");

    // Thanksgiving (4th Thursday of November)
    if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) {
      holidays.push('Thanksgiving');
    }

    // Super Bowl Sunday (usually first Sunday in February)
    if (month === 1 && dayOfWeek === 0 && day <= 14) {
      holidays.push('Super Bowl Sunday');
    }

    return holidays;
  }

  /**
   * Estimate dine-in traffic from delivery patterns
   */
  private estimateDineInFromDelivery(hour: number, avgDelivery: number): number {
    // Typical dine-in pattern multipliers by hour
    const dineInPattern: Record<number, number> = {
      11: 1.0, 12: 1.5, 13: 1.2, 14: 0.6,  // Lunch
      17: 0.8, 18: 1.3, 19: 1.5, 20: 1.2, 21: 0.8, // Dinner
    };

    const baseMultiplier = dineInPattern[hour] || 0.3;

    // When delivery is high, dine-in tends to be lower (ghost kitchen windows)
    const inverseMultiplier = Math.max(0.5, 1.5 - avgDelivery * 0.1);

    return Math.round(baseMultiplier * inverseMultiplier * 20); // Base of ~20 covers/hour
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(
    hourlyPattern?: { sampleCount: number; stdDevDineIn: number; stdDevDelivery: number },
  ): number {
    if (!hourlyPattern) return 0.3; // Low confidence without data

    const sampleScore = Math.min(1, hourlyPattern.sampleCount / 10); // Max at 10 samples

    // Lower variance = higher confidence
    const avgStdDev = (hourlyPattern.stdDevDineIn + hourlyPattern.stdDevDelivery) / 2;
    const varianceScore = Math.max(0, 1 - avgStdDev / 50);

    return Math.round((sampleScore * 0.6 + varianceScore * 0.4) * 100) / 100;
  }

  /**
   * Convert date to YYYY-MM-DD string
   */
  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
