import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/redis/redis.service';

/**
 * Weather Service
 *
 * Integrates with OpenWeatherMap API for weather data.
 * Caches responses to reduce API calls.
 */

export interface WeatherConditions {
  datetime: Date;
  temperature: number; // Celsius
  feelsLike: number;
  humidity: number; // Percentage
  windSpeed: number; // m/s
  cloudCover: number; // Percentage
  precipitation: number; // mm in last hour
  precipitationProbability: number; // Percentage
  snowfall?: number; // mm
  description: string;
  icon: string;
}

export interface WeatherForecast {
  current: WeatherConditions;
  hourly: WeatherConditions[];
  daily: DailyWeather[];
}

export interface DailyWeather {
  date: string;
  tempMin: number;
  tempMax: number;
  precipitation: number;
  precipitationProbability: number;
  description: string;
  icon: string;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://api.openweathermap.org/data/3.0';

  // Cache TTLs in seconds
  private readonly CURRENT_CACHE_TTL = 15 * 60; // 15 minutes
  private readonly FORECAST_CACHE_TTL = 60 * 60; // 1 hour

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.configService.get<string>('OPENWEATHER_API_KEY');

    if (!this.apiKey) {
      this.logger.warn('OpenWeatherMap API key not configured - weather features disabled');
    }
  }

  /**
   * Get current weather for a location
   */
  async getCurrentWeather(lat: number, lon: number): Promise<WeatherConditions | null> {
    const cacheKey = `weather:current:${lat.toFixed(2)}:${lon.toFixed(2)}`;

    // Check cache
    const cached = await this.redis.getJson<WeatherConditions>(cacheKey);
    if (cached) {
      this.logger.debug(`Weather cache hit for ${lat}, ${lon}`);
      return { ...cached, datetime: new Date(cached.datetime) };
    }

    if (!this.apiKey) {
      return this.getMockWeather();
    }

    try {
      const url = `${this.baseUrl}/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&units=metric&appid=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      const current = this.parseCurrentWeather(data.current);

      // Cache the result
      await this.redis.setJson(cacheKey, current, this.CURRENT_CACHE_TTL);

      return current;
    } catch (error) {
      this.logger.error(`Failed to fetch weather: ${error.message}`);
      return this.getMockWeather();
    }
  }

  /**
   * Get weather forecast for multiple days
   */
  async getForecast(
    lat: number,
    lon: number,
    days: number = 7,
  ): Promise<WeatherConditions[]> {
    const cacheKey = `weather:forecast:${lat.toFixed(2)}:${lon.toFixed(2)}:${days}`;

    // Check cache
    const cached = await this.redis.getJson<WeatherConditions[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Forecast cache hit for ${lat}, ${lon}`);
      return cached.map(w => ({ ...w, datetime: new Date(w.datetime) }));
    }

    if (!this.apiKey) {
      return this.getMockForecast(days);
    }

    try {
      const url = `${this.baseUrl}/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&units=metric&appid=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      const hourly = this.parseHourlyForecast(data.hourly, days);

      // Cache the result
      await this.redis.setJson(cacheKey, hourly, this.FORECAST_CACHE_TTL);

      return hourly;
    } catch (error) {
      this.logger.error(`Failed to fetch forecast: ${error.message}`);
      return this.getMockForecast(days);
    }
  }

  /**
   * Calculate weather impact score on demand
   * Returns a value from -1 (very negative impact) to +1 (very positive impact)
   */
  getWeatherImpactScore(conditions: WeatherConditions): {
    dineIn: number;
    delivery: number;
    overall: number;
  } {
    let dineInImpact = 0;
    let deliveryImpact = 0;

    // Temperature impact
    if (conditions.temperature < 0) {
      // Very cold
      dineInImpact -= 0.3;
      deliveryImpact += 0.2;
    } else if (conditions.temperature < 10) {
      // Cold
      dineInImpact -= 0.1;
      deliveryImpact += 0.1;
    } else if (conditions.temperature > 35) {
      // Very hot
      dineInImpact -= 0.2;
      deliveryImpact += 0.15;
    } else if (conditions.temperature > 25 && conditions.temperature <= 35) {
      // Warm - good for outdoor dining
      dineInImpact += 0.1;
    }

    // Precipitation impact
    if (conditions.precipitation > 0 || conditions.precipitationProbability > 50) {
      const rainIntensity = conditions.precipitation > 10 ? 'heavy' :
        conditions.precipitation > 2 ? 'moderate' : 'light';

      switch (rainIntensity) {
        case 'heavy':
          dineInImpact -= 0.4;
          deliveryImpact += 0.5;
          break;
        case 'moderate':
          dineInImpact -= 0.2;
          deliveryImpact += 0.3;
          break;
        case 'light':
          dineInImpact -= 0.1;
          deliveryImpact += 0.15;
          break;
      }
    }

    // Snow impact
    if (conditions.snowfall && conditions.snowfall > 0) {
      dineInImpact -= 0.5;
      // Delivery also impacted in heavy snow
      deliveryImpact += conditions.snowfall > 5 ? -0.2 : 0.3;
    }

    // Wind impact (affects outdoor dining)
    if (conditions.windSpeed > 15) {
      dineInImpact -= 0.15;
    }

    // Sunny/clear weather bonus
    if (conditions.cloudCover < 30 && conditions.precipitation === 0) {
      dineInImpact += 0.15;
      deliveryImpact -= 0.05;
    }

    // Clamp values
    dineInImpact = Math.max(-1, Math.min(1, dineInImpact));
    deliveryImpact = Math.max(-1, Math.min(1, deliveryImpact));

    return {
      dineIn: Math.round(dineInImpact * 100) / 100,
      delivery: Math.round(deliveryImpact * 100) / 100,
      overall: Math.round((dineInImpact + deliveryImpact) / 2 * 100) / 100,
    };
  }

  /**
   * Get weather summary for display
   */
  getWeatherSummary(conditions: WeatherConditions): string {
    const parts: string[] = [];

    parts.push(`${Math.round(conditions.temperature)}C`);

    if (conditions.precipitation > 0) {
      parts.push(conditions.snowfall && conditions.snowfall > 0 ? 'Snowing' : 'Raining');
    } else if (conditions.precipitationProbability > 50) {
      parts.push(`${conditions.precipitationProbability}% chance of rain`);
    }

    if (conditions.cloudCover > 70) {
      parts.push('Cloudy');
    } else if (conditions.cloudCover < 30) {
      parts.push('Clear');
    }

    if (conditions.windSpeed > 10) {
      parts.push('Windy');
    }

    return parts.join(', ');
  }

  /**
   * Parse current weather from API response
   */
  private parseCurrentWeather(data: any): WeatherConditions {
    return {
      datetime: new Date(data.dt * 1000),
      temperature: data.temp,
      feelsLike: data.feels_like,
      humidity: data.humidity,
      windSpeed: data.wind_speed,
      cloudCover: data.clouds,
      precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      precipitationProbability: 0, // Not in current weather
      snowfall: data.snow?.['1h'],
      description: data.weather?.[0]?.description || 'Unknown',
      icon: data.weather?.[0]?.icon || '01d',
    };
  }

  /**
   * Parse hourly forecast from API response
   */
  private parseHourlyForecast(data: any[], days: number): WeatherConditions[] {
    const hoursToGet = days * 24;

    return data.slice(0, hoursToGet).map(hour => ({
      datetime: new Date(hour.dt * 1000),
      temperature: hour.temp,
      feelsLike: hour.feels_like,
      humidity: hour.humidity,
      windSpeed: hour.wind_speed,
      cloudCover: hour.clouds,
      precipitation: hour.rain?.['1h'] || hour.snow?.['1h'] || 0,
      precipitationProbability: Math.round((hour.pop || 0) * 100),
      snowfall: hour.snow?.['1h'],
      description: hour.weather?.[0]?.description || 'Unknown',
      icon: hour.weather?.[0]?.icon || '01d',
    }));
  }

  /**
   * Get mock weather for development/testing
   */
  private getMockWeather(): WeatherConditions {
    return {
      datetime: new Date(),
      temperature: 20,
      feelsLike: 19,
      humidity: 50,
      windSpeed: 5,
      cloudCover: 30,
      precipitation: 0,
      precipitationProbability: 10,
      description: 'Partly cloudy',
      icon: '02d',
    };
  }

  /**
   * Get mock forecast for development/testing
   */
  private getMockForecast(days: number): WeatherConditions[] {
    const forecast: WeatherConditions[] = [];
    const now = new Date();

    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) {
        const datetime = new Date(now);
        datetime.setDate(datetime.getDate() + d);
        datetime.setHours(h, 0, 0, 0);

        // Simulate typical weather patterns
        const hourlyTemp = 15 + Math.sin((h - 6) * Math.PI / 12) * 8;
        const rainChance = d % 3 === 0 ? 40 : 10; // Rain every 3rd day

        forecast.push({
          datetime,
          temperature: Math.round(hourlyTemp),
          feelsLike: Math.round(hourlyTemp - 1),
          humidity: 50 + Math.random() * 30,
          windSpeed: 3 + Math.random() * 7,
          cloudCover: rainChance > 20 ? 60 + Math.random() * 30 : 20 + Math.random() * 30,
          precipitation: Math.random() < rainChance / 100 ? Math.random() * 5 : 0,
          precipitationProbability: rainChance,
          description: rainChance > 30 ? 'Chance of rain' : 'Partly cloudy',
          icon: rainChance > 30 ? '10d' : '02d',
        });
      }
    }

    return forecast;
  }

  /**
   * Clear weather cache
   */
  async clearCache(lat?: number, lon?: number): Promise<void> {
    if (lat !== undefined && lon !== undefined) {
      await this.redis.del(`weather:current:${lat.toFixed(2)}:${lon.toFixed(2)}`);
      await this.redis.del(`weather:forecast:${lat.toFixed(2)}:${lon.toFixed(2)}:7`);
    }
    // Note: For full cache clear, would need pattern delete capability
  }
}
