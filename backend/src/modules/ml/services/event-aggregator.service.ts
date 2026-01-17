import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { EventCategory, EventSource, CachedEvent } from '../entities/ml-model.entity';

/**
 * Event Aggregator Service
 *
 * Fetches and caches local event data from external APIs (PredictHQ, Ticketmaster).
 * Provides event impact scoring for demand forecasting.
 */

// ==================== Types ====================

export interface LocalEvent {
  id: string;
  externalId: string;
  source: EventSource;
  name: string;
  category: EventCategory;
  subcategory?: string;
  lat: number;
  lng: number;
  venue?: string;
  city?: string;
  state?: string;
  startTime: Date;
  endTime: Date;
  expectedAttendance?: number;
  rank?: number;
  distanceMiles?: number;
}

export interface EventSearchParams {
  lat: number;
  lon: number;
  radiusMiles: number;
  startDate: Date;
  endDate: Date;
  categories?: EventCategory[];
}

export interface EventImpactResult {
  totalImpactScore: number;
  dineInImpact: number;
  deliveryImpact: number;
  events: LocalEvent[];
  peakHour?: number;
  peakAttendance?: number;
}

// ==================== API Response Types ====================

interface PredictHQEvent {
  id: string;
  title: string;
  category: string;
  labels: string[];
  rank: number;
  start: string;
  end: string;
  location: [number, number]; // [lng, lat]
  entities: Array<{
    entity_id: string;
    name: string;
    type: string;
  }>;
  phq_attendance?: number;
  predicted_event_spend?: number;
}

interface TicketmasterEvent {
  id: string;
  name: string;
  dates: {
    start: { dateTime: string };
    end?: { dateTime: string };
  };
  classifications: Array<{
    segment: { name: string };
    genre?: { name: string };
  }>;
  _embedded?: {
    venues?: Array<{
      name: string;
      location: { latitude: string; longitude: string };
      city?: { name: string };
      state?: { stateCode: string };
    }>;
  };
  priceRanges?: Array<{ min: number; max: number }>;
}

@Injectable()
export class EventAggregatorService {
  private readonly logger = new Logger(EventAggregatorService.name);

  private readonly predictHQApiKey?: string;
  private readonly ticketmasterApiKey?: string;

  // Event impact multipliers by category
  private readonly CATEGORY_IMPACT = {
    [EventCategory.SPORTS]: { dineIn: 0.3, delivery: 0.5, peakBefore: 2, peakAfter: 2 },
    [EventCategory.CONCERT]: { dineIn: 0.2, delivery: 0.4, peakBefore: 2, peakAfter: 1 },
    [EventCategory.FESTIVAL]: { dineIn: 0.4, delivery: 0.3, peakBefore: 1, peakAfter: 1 },
    [EventCategory.CONFERENCE]: { dineIn: 0.35, delivery: 0.15, peakBefore: 1, peakAfter: 0 },
    [EventCategory.HOLIDAY]: { dineIn: -0.2, delivery: 0.3, peakBefore: 0, peakAfter: 0 },
    [EventCategory.OTHER]: { dineIn: 0.1, delivery: 0.2, peakBefore: 1, peakAfter: 1 },
  };

  // Distance decay constants
  private readonly MAX_IMPACT_DISTANCE = 5; // Full impact within 5 miles
  private readonly DECAY_DISTANCE = 20; // No impact beyond 20 miles

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.predictHQApiKey = this.configService.get<string>('PREDICTHQ_API_KEY');
    this.ticketmasterApiKey = this.configService.get<string>('TICKETMASTER_API_KEY');

    if (!this.predictHQApiKey && !this.ticketmasterApiKey) {
      this.logger.warn('No event API keys configured - event features will be limited');
    }
  }

  /**
   * Get local events for a location and date range
   */
  async getLocalEvents(
    lat: number,
    lon: number,
    radiusMiles: number,
    dateRange: { start: Date; end: Date },
  ): Promise<LocalEvent[]> {
    const cacheKey = this.getCacheKey(lat, lon, radiusMiles, dateRange.start, dateRange.end);

    // Check cache first
    const cached = await this.redis.getJson<LocalEvent[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Event cache hit for ${lat}, ${lon}`);
      return cached.map(e => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      }));
    }

    // Fetch from database (cached events)
    const dbEvents = await this.getEventsFromDatabase(lat, lon, radiusMiles, dateRange);

    // If we have recent cached data, use it
    if (dbEvents.length > 0) {
      await this.redis.setJson(cacheKey, dbEvents, 3600); // 1 hour cache
      return dbEvents;
    }

    // Fetch from APIs
    const freshEvents = await this.fetchEventsFromAPIs(lat, lon, radiusMiles, dateRange);

    // Cache to database
    await this.cacheEvents(freshEvents);

    // Cache to Redis
    await this.redis.setJson(cacheKey, freshEvents, 3600);

    return freshEvents;
  }

  /**
   * Categorize an event based on its attributes
   */
  categorizeEvent(
    name: string,
    category: string,
    labels: string[] = [],
  ): EventCategory {
    const lowerName = name.toLowerCase();
    const lowerCategory = category.toLowerCase();
    const lowerLabels = labels.map(l => l.toLowerCase());

    // Sports detection
    if (
      lowerCategory.includes('sport') ||
      lowerLabels.some(l => l.includes('sport')) ||
      /\b(game|match|nba|nfl|mlb|nhl|mls|ncaa|soccer|football|basketball|baseball|hockey)\b/.test(lowerName)
    ) {
      return EventCategory.SPORTS;
    }

    // Concert detection
    if (
      lowerCategory.includes('concert') ||
      lowerCategory.includes('music') ||
      lowerLabels.some(l => l.includes('concert') || l.includes('music')) ||
      /\b(tour|concert|live|performance|show)\b/.test(lowerName)
    ) {
      return EventCategory.CONCERT;
    }

    // Festival detection
    if (
      lowerCategory.includes('festival') ||
      lowerLabels.some(l => l.includes('festival')) ||
      /\b(festival|fest|fair|carnival)\b/.test(lowerName)
    ) {
      return EventCategory.FESTIVAL;
    }

    // Conference detection
    if (
      lowerCategory.includes('conference') ||
      lowerCategory.includes('convention') ||
      lowerCategory.includes('expo') ||
      lowerLabels.some(l =>
        l.includes('conference') || l.includes('convention') || l.includes('expo')
      ) ||
      /\b(conference|convention|expo|summit|symposium|meetup)\b/.test(lowerName)
    ) {
      return EventCategory.CONFERENCE;
    }

    // Holiday detection
    if (
      lowerCategory.includes('holiday') ||
      lowerLabels.some(l => l.includes('holiday')) ||
      /\b(christmas|thanksgiving|easter|halloween|new\s+year|fourth|memorial|labor\s+day)\b/.test(lowerName)
    ) {
      return EventCategory.HOLIDAY;
    }

    return EventCategory.OTHER;
  }

  /**
   * Estimate event impact on restaurant demand
   */
  estimateEventImpact(
    event: LocalEvent,
    restaurantLat: number,
    restaurantLon: number,
  ): { dineInImpact: number; deliveryImpact: number; impactHours: number[] } {
    // Calculate distance
    const distance = event.distanceMiles ??
      this.calculateDistance(restaurantLat, restaurantLon, event.lat, event.lng);

    // No impact if too far
    if (distance > this.DECAY_DISTANCE) {
      return { dineInImpact: 0, deliveryImpact: 0, impactHours: [] };
    }

    // Distance decay factor
    const distanceFactor = distance <= this.MAX_IMPACT_DISTANCE
      ? 1
      : 1 - (distance - this.MAX_IMPACT_DISTANCE) / (this.DECAY_DISTANCE - this.MAX_IMPACT_DISTANCE);

    // Get category impact multipliers
    const categoryImpact = this.CATEGORY_IMPACT[event.category] || this.CATEGORY_IMPACT[EventCategory.OTHER];

    // Attendance factor (log scale, normalized to 10k attendees)
    const attendance = event.expectedAttendance || 1000;
    const attendanceFactor = Math.log10(Math.max(100, attendance)) / 4; // log10(10000) = 4

    // Rank factor (1-5 scale)
    const rankFactor = (event.rank || 3) / 5;

    // Calculate impacts
    const baseDineIn = categoryImpact.dineIn * distanceFactor * attendanceFactor * rankFactor;
    const baseDelivery = categoryImpact.delivery * distanceFactor * attendanceFactor * rankFactor;

    // Determine impact hours
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);
    const impactHours: number[] = [];

    // Add hours before event
    for (let h = categoryImpact.peakBefore; h > 0; h--) {
      const hour = eventStart.getHours() - h;
      if (hour >= 0) impactHours.push(hour);
    }

    // Add hours during event
    for (let h = eventStart.getHours(); h <= eventEnd.getHours() && h < 24; h++) {
      if (!impactHours.includes(h)) impactHours.push(h);
    }

    // Add hours after event
    for (let h = 1; h <= categoryImpact.peakAfter; h++) {
      const hour = eventEnd.getHours() + h;
      if (hour < 24 && !impactHours.includes(hour)) impactHours.push(hour);
    }

    return {
      dineInImpact: Math.min(0.8, baseDineIn), // Cap at 80%
      deliveryImpact: Math.min(1.0, baseDelivery), // Cap at 100%
      impactHours,
    };
  }

  /**
   * Get aggregated event impact for a date and location
   */
  async getAggregatedImpact(
    lat: number,
    lon: number,
    date: Date,
    radiusMiles: number = 15,
  ): Promise<EventImpactResult> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await this.getLocalEvents(lat, lon, radiusMiles, {
      start: startOfDay,
      end: endOfDay,
    });

    if (events.length === 0) {
      return {
        totalImpactScore: 0,
        dineInImpact: 0,
        deliveryImpact: 0,
        events: [],
      };
    }

    // Calculate aggregate impact
    let totalDineIn = 0;
    let totalDelivery = 0;
    const hourlyImpact: Record<number, { dineIn: number; delivery: number; attendance: number }> = {};

    for (let h = 0; h < 24; h++) {
      hourlyImpact[h] = { dineIn: 0, delivery: 0, attendance: 0 };
    }

    for (const event of events) {
      const impact = this.estimateEventImpact(event, lat, lon);

      totalDineIn += impact.dineInImpact;
      totalDelivery += impact.deliveryImpact;

      for (const hour of impact.impactHours) {
        hourlyImpact[hour].dineIn += impact.dineInImpact;
        hourlyImpact[hour].delivery += impact.deliveryImpact;
        hourlyImpact[hour].attendance += event.expectedAttendance || 1000;
      }
    }

    // Find peak hour
    let peakHour = 0;
    let peakAttendance = 0;

    for (let h = 0; h < 24; h++) {
      if (hourlyImpact[h].attendance > peakAttendance) {
        peakAttendance = hourlyImpact[h].attendance;
        peakHour = h;
      }
    }

    return {
      totalImpactScore: Math.min(1, (totalDineIn + totalDelivery) / 2),
      dineInImpact: Math.min(0.8, totalDineIn),
      deliveryImpact: Math.min(1.0, totalDelivery),
      events,
      peakHour,
      peakAttendance,
    };
  }

  /**
   * Cache events to database
   */
  async cacheEvents(events: LocalEvent[]): Promise<void> {
    for (const event of events) {
      try {
        const expiresAt = new Date(event.endTime);
        expiresAt.setDate(expiresAt.getDate() + 7); // Keep for 7 days after event ends

        await this.prisma.cachedEvent.upsert({
          where: {
            externalId_source: {
              externalId: event.externalId,
              source: event.source,
            },
          },
          update: {
            name: event.name,
            category: event.category,
            subcategory: event.subcategory,
            lat: event.lat,
            lng: event.lng,
            venue: event.venue,
            city: event.city,
            state: event.state,
            startTime: event.startTime,
            endTime: event.endTime,
            expectedAttendance: event.expectedAttendance,
            rank: event.rank,
            expiresAt,
          },
          create: {
            externalId: event.externalId,
            source: event.source,
            name: event.name,
            category: event.category,
            subcategory: event.subcategory,
            lat: event.lat,
            lng: event.lng,
            venue: event.venue,
            city: event.city,
            state: event.state,
            startTime: event.startTime,
            endTime: event.endTime,
            expectedAttendance: event.expectedAttendance,
            rank: event.rank,
            fetchedAt: new Date(),
            expiresAt,
          },
        });
      } catch (error) {
        this.logger.warn(`Failed to cache event ${event.externalId}: ${error.message}`);
      }
    }
  }

  /**
   * Clean up expired cached events
   */
  async cleanupExpiredEvents(): Promise<number> {
    const result = await this.prisma.cachedEvent.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired events`);
    return result.count;
  }

  /**
   * Add manual event (for known local events not in APIs)
   */
  async addManualEvent(event: Omit<LocalEvent, 'id' | 'source'>): Promise<CachedEvent> {
    const expiresAt = new Date(event.endTime);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const created = await this.prisma.cachedEvent.create({
      data: {
        externalId: event.externalId || `manual-${Date.now()}`,
        source: EventSource.MANUAL,
        name: event.name,
        category: event.category,
        subcategory: event.subcategory,
        lat: event.lat,
        lng: event.lng,
        venue: event.venue,
        city: event.city,
        state: event.state,
        startTime: event.startTime,
        endTime: event.endTime,
        expectedAttendance: event.expectedAttendance,
        rank: event.rank,
        fetchedAt: new Date(),
        expiresAt,
      },
    });

    return created as unknown as CachedEvent;
  }

  // ==================== Private Methods ====================

  /**
   * Get events from database cache
   */
  private async getEventsFromDatabase(
    lat: number,
    lon: number,
    radiusMiles: number,
    dateRange: { start: Date; end: Date },
  ): Promise<LocalEvent[]> {
    // Query events in the date range
    const events = await this.prisma.cachedEvent.findMany({
      where: {
        startTime: { lte: dateRange.end },
        endTime: { gte: dateRange.start },
        expiresAt: { gt: new Date() },
      },
    });

    // Filter by distance
    return events
      .map(e => ({
        id: e.id,
        externalId: e.externalId,
        source: e.source as EventSource,
        name: e.name,
        category: e.category as EventCategory,
        subcategory: e.subcategory ?? undefined,
        lat: Number(e.lat),
        lng: Number(e.lng),
        venue: e.venue ?? undefined,
        city: e.city ?? undefined,
        state: e.state ?? undefined,
        startTime: e.startTime,
        endTime: e.endTime,
        expectedAttendance: e.expectedAttendance ?? undefined,
        rank: e.rank ?? undefined,
        distanceMiles: this.calculateDistance(lat, lon, Number(e.lat), Number(e.lng)),
      }))
      .filter(e => e.distanceMiles <= radiusMiles);
  }

  /**
   * Fetch events from external APIs
   */
  private async fetchEventsFromAPIs(
    lat: number,
    lon: number,
    radiusMiles: number,
    dateRange: { start: Date; end: Date },
  ): Promise<LocalEvent[]> {
    const events: LocalEvent[] = [];

    // Fetch from PredictHQ
    if (this.predictHQApiKey) {
      try {
        const phqEvents = await this.fetchFromPredictHQ(lat, lon, radiusMiles, dateRange);
        events.push(...phqEvents);
      } catch (error) {
        this.logger.error(`PredictHQ fetch failed: ${error.message}`);
      }
    }

    // Fetch from Ticketmaster
    if (this.ticketmasterApiKey) {
      try {
        const tmEvents = await this.fetchFromTicketmaster(lat, lon, radiusMiles, dateRange);
        // Deduplicate with PredictHQ events
        for (const event of tmEvents) {
          if (!events.find(e => this.isSameEvent(e, event))) {
            events.push(event);
          }
        }
      } catch (error) {
        this.logger.error(`Ticketmaster fetch failed: ${error.message}`);
      }
    }

    return events;
  }

  /**
   * Fetch events from PredictHQ API
   */
  private async fetchFromPredictHQ(
    lat: number,
    lon: number,
    radiusMiles: number,
    dateRange: { start: Date; end: Date },
  ): Promise<LocalEvent[]> {
    const radiusKm = radiusMiles * 1.60934;
    const startStr = dateRange.start.toISOString().split('T')[0];
    const endStr = dateRange.end.toISOString().split('T')[0];

    const url = new URL('https://api.predicthq.com/v1/events/');
    url.searchParams.set('within', `${radiusKm}km@${lat},${lon}`);
    url.searchParams.set('active.gte', startStr);
    url.searchParams.set('active.lte', endStr);
    url.searchParams.set('limit', '100');
    url.searchParams.set('sort', 'rank');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.predictHQApiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`PredictHQ API error: ${response.status}`);
    }

    const data = await response.json();
    const events: LocalEvent[] = [];

    for (const event of data.results as PredictHQEvent[]) {
      const [lng, eventLat] = event.location;
      const venue = event.entities.find(e => e.type === 'venue')?.name;

      events.push({
        id: event.id,
        externalId: event.id,
        source: EventSource.PREDICTHQ,
        name: event.title,
        category: this.categorizeEvent(event.title, event.category, event.labels),
        lat: eventLat,
        lng,
        venue,
        startTime: new Date(event.start),
        endTime: new Date(event.end),
        expectedAttendance: event.phq_attendance,
        rank: Math.min(5, Math.ceil(event.rank / 20)), // Convert 0-100 to 1-5
        distanceMiles: this.calculateDistance(lat, lon, eventLat, lng),
      });
    }

    return events;
  }

  /**
   * Fetch events from Ticketmaster API
   */
  private async fetchFromTicketmaster(
    lat: number,
    lon: number,
    radiusMiles: number,
    dateRange: { start: Date; end: Date },
  ): Promise<LocalEvent[]> {
    const startStr = dateRange.start.toISOString().split('.')[0] + 'Z';
    const endStr = dateRange.end.toISOString().split('.')[0] + 'Z';

    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    url.searchParams.set('apikey', this.ticketmasterApiKey!);
    url.searchParams.set('latlong', `${lat},${lon}`);
    url.searchParams.set('radius', radiusMiles.toString());
    url.searchParams.set('unit', 'miles');
    url.searchParams.set('startDateTime', startStr);
    url.searchParams.set('endDateTime', endStr);
    url.searchParams.set('size', '100');
    url.searchParams.set('sort', 'date,asc');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Ticketmaster API error: ${response.status}`);
    }

    const data = await response.json();
    const events: LocalEvent[] = [];

    if (!data._embedded?.events) {
      return events;
    }

    for (const event of data._embedded.events as TicketmasterEvent[]) {
      const venue = event._embedded?.venues?.[0];
      if (!venue?.location) continue;

      const eventLat = parseFloat(venue.location.latitude);
      const eventLng = parseFloat(venue.location.longitude);

      const segment = event.classifications?.[0]?.segment?.name || 'Other';
      const endTime = event.dates.end?.dateTime
        ? new Date(event.dates.end.dateTime)
        : new Date(new Date(event.dates.start.dateTime).getTime() + 3 * 3600 * 1000); // Default 3 hours

      events.push({
        id: event.id,
        externalId: event.id,
        source: EventSource.TICKETMASTER,
        name: event.name,
        category: this.categorizeEvent(event.name, segment),
        lat: eventLat,
        lng: eventLng,
        venue: venue.name,
        city: venue.city?.name,
        state: venue.state?.stateCode,
        startTime: new Date(event.dates.start.dateTime),
        endTime,
        rank: 3, // Default rank for Ticketmaster events
        distanceMiles: this.calculateDistance(lat, lon, eventLat, eventLng),
      });
    }

    return events;
  }

  /**
   * Check if two events are the same (for deduplication)
   */
  private isSameEvent(a: LocalEvent, b: LocalEvent): boolean {
    // Same name and similar start time
    const nameMatch = a.name.toLowerCase() === b.name.toLowerCase();
    const timeDiff = Math.abs(a.startTime.getTime() - b.startTime.getTime());
    const timeClose = timeDiff < 2 * 3600 * 1000; // Within 2 hours

    // Similar location
    const distance = this.calculateDistance(a.lat, a.lng, b.lat, b.lng);
    const locationClose = distance < 1; // Within 1 mile

    return nameMatch && timeClose && locationClose;
  }

  /**
   * Calculate distance between two points (Haversine formula)
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
   * Generate cache key for event queries
   */
  private getCacheKey(
    lat: number,
    lon: number,
    radius: number,
    start: Date,
    end: Date,
  ): string {
    const latRounded = lat.toFixed(2);
    const lonRounded = lon.toFixed(2);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    return `events:${latRounded}:${lonRounded}:${radius}:${startStr}:${endStr}`;
  }
}
