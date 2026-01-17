import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { KitchenHubClient } from '../clients/kitchenhub.client';

/**
 * Cached capacity state
 */
interface CapacityState {
  restaurantId: string;
  sessionId: string | null;
  maxOrders: number;
  currentOrders: number;
  utilizationPercent: number;
  isPaused: boolean;
  pausedAt?: string;
  pauseReason?: string;
  lastUpdated: string;
}

/**
 * Capacity history entry
 */
interface CapacityHistoryEntry {
  timestamp: Date;
  currentOrders: number;
  maxOrders: number;
  utilizationPercent: number;
}

/**
 * Kitchen Capacity Service
 *
 * Manages kitchen order capacity:
 * - Tracks current order load vs maximum
 * - Auto-pauses orders at configurable threshold
 * - Provides capacity analytics
 */
@Injectable()
export class CapacityService {
  private readonly logger = new Logger(CapacityService.name);
  private readonly warningThreshold: number;
  private readonly autoDisableThreshold: number;
  private readonly defaultMaxOrders: number;

  private static readonly CAPACITY_CACHE_KEY_PREFIX = 'ghost:capacity:';
  private static readonly CAPACITY_HISTORY_KEY_PREFIX = 'ghost:capacity:history:';
  private static readonly CAPACITY_CACHE_TTL = 60; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly kitchenHubClient: KitchenHubClient,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.warningThreshold = this.configService.get<number>(
      'kitchenhub.capacity.warningThreshold',
      75,
    );
    this.autoDisableThreshold = this.configService.get<number>(
      'kitchenhub.capacity.autoDisableThreshold',
      90,
    );
    this.defaultMaxOrders = this.configService.get<number>(
      'kitchenhub.capacity.defaultMaxOrders',
      20,
    );
  }

  // ==================== Core Capacity Methods ====================

  /**
   * Get current capacity state for a restaurant
   */
  async getCurrentCapacity(restaurantId: string): Promise<CapacityState> {
    // Try cache first
    const cacheKey = `${CapacityService.CAPACITY_CACHE_KEY_PREFIX}${restaurantId}`;
    const cached = await this.redis.getJson<CapacityState>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get from database
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        maxConcurrentOrders: true,
        autoDisableThreshold: true,
      },
    });

    if (!restaurant) {
      throw new BadRequestException('Restaurant not found');
    }

    // Get active session
    const activeSession = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        endedAt: null,
      },
    });

    // Count active orders
    const activeOrderCount = activeSession
      ? await this.prisma.ghostKitchenOrder.count({
          where: {
            sessionId: activeSession.id,
            status: {
              in: ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY'],
            },
          },
        })
      : 0;

    const maxOrders = restaurant.maxConcurrentOrders || this.defaultMaxOrders;
    const utilizationPercent = Math.round((activeOrderCount / maxOrders) * 100);

    const state: CapacityState = {
      restaurantId,
      sessionId: activeSession?.id || null,
      maxOrders,
      currentOrders: activeOrderCount,
      utilizationPercent,
      isPaused: false, // Will be updated from session if applicable
      lastUpdated: new Date().toISOString(),
    };

    // Cache the state
    await this.redis.setJson(cacheKey, state, CapacityService.CAPACITY_CACHE_TTL);

    return state;
  }

  /**
   * Check if kitchen can accept a new order
   */
  async canAcceptOrder(
    restaurantId: string,
    orderSize: number = 1,
  ): Promise<{
    canAccept: boolean;
    reason?: string;
    currentUtilization: number;
    availableCapacity: number;
  }> {
    const capacity = await this.getCurrentCapacity(restaurantId);

    if (capacity.isPaused) {
      return {
        canAccept: false,
        reason: capacity.pauseReason || 'Orders are paused',
        currentUtilization: capacity.utilizationPercent,
        availableCapacity: 0,
      };
    }

    if (!capacity.sessionId) {
      return {
        canAccept: false,
        reason: 'Ghost kitchen session not active',
        currentUtilization: 0,
        availableCapacity: 0,
      };
    }

    const availableCapacity = capacity.maxOrders - capacity.currentOrders;

    if (capacity.currentOrders + orderSize > capacity.maxOrders) {
      return {
        canAccept: false,
        reason: 'At maximum capacity',
        currentUtilization: capacity.utilizationPercent,
        availableCapacity,
      };
    }

    return {
      canAccept: true,
      currentUtilization: capacity.utilizationPercent,
      availableCapacity,
    };
  }

  /**
   * Get capacity utilization percentage
   */
  async getCapacityUtilization(restaurantId: string): Promise<{
    current: number;
    max: number;
    utilizationPercent: number;
    status: 'LOW' | 'NORMAL' | 'WARNING' | 'CRITICAL';
  }> {
    const capacity = await this.getCurrentCapacity(restaurantId);

    let status: 'LOW' | 'NORMAL' | 'WARNING' | 'CRITICAL';
    if (capacity.utilizationPercent < 50) {
      status = 'LOW';
    } else if (capacity.utilizationPercent < this.warningThreshold) {
      status = 'NORMAL';
    } else if (capacity.utilizationPercent < this.autoDisableThreshold) {
      status = 'WARNING';
    } else {
      status = 'CRITICAL';
    }

    return {
      current: capacity.currentOrders,
      max: capacity.maxOrders,
      utilizationPercent: capacity.utilizationPercent,
      status,
    };
  }

  /**
   * Set maximum order capacity for a restaurant
   */
  async setMaxCapacity(restaurantId: string, maxOrders: number): Promise<void> {
    if (maxOrders < 1 || maxOrders > 100) {
      throw new BadRequestException('Max orders must be between 1 and 100');
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { maxConcurrentOrders: maxOrders },
    });

    // Invalidate cache
    await this.invalidateCapacityCache(restaurantId);

    this.logger.log(`Set max capacity to ${maxOrders} for restaurant ${restaurantId}`);

    // Emit event
    this.eventEmitter.emit('capacity.max-updated', {
      restaurantId,
      maxOrders,
    });
  }

  // ==================== Capacity Updates ====================

  /**
   * Increment current order count (call when new order received)
   */
  async incrementOrderCount(restaurantId: string): Promise<CapacityState> {
    const capacity = await this.getCurrentCapacity(restaurantId);
    capacity.currentOrders += 1;
    capacity.utilizationPercent = Math.round(
      (capacity.currentOrders / capacity.maxOrders) * 100,
    );
    capacity.lastUpdated = new Date().toISOString();

    // Update cache
    const cacheKey = `${CapacityService.CAPACITY_CACHE_KEY_PREFIX}${restaurantId}`;
    await this.redis.setJson(cacheKey, capacity, CapacityService.CAPACITY_CACHE_TTL);

    // Record history point
    await this.recordCapacityHistory(restaurantId, capacity);

    // Check thresholds
    await this.checkCapacityThresholds(restaurantId, capacity);

    return capacity;
  }

  /**
   * Decrement current order count (call when order completed/cancelled)
   */
  async decrementOrderCount(restaurantId: string): Promise<CapacityState> {
    const capacity = await this.getCurrentCapacity(restaurantId);
    capacity.currentOrders = Math.max(0, capacity.currentOrders - 1);
    capacity.utilizationPercent = Math.round(
      (capacity.currentOrders / capacity.maxOrders) * 100,
    );
    capacity.lastUpdated = new Date().toISOString();

    // Update cache
    const cacheKey = `${CapacityService.CAPACITY_CACHE_KEY_PREFIX}${restaurantId}`;
    await this.redis.setJson(cacheKey, capacity, CapacityService.CAPACITY_CACHE_TTL);

    // Record history point
    await this.recordCapacityHistory(restaurantId, capacity);

    // Check if we can resume orders
    if (capacity.isPaused && capacity.utilizationPercent < this.warningThreshold) {
      await this.resumeOrders(restaurantId);
    }

    return capacity;
  }

  // ==================== Auto-pause Logic ====================

  /**
   * Check capacity thresholds and take action
   */
  private async checkCapacityThresholds(
    restaurantId: string,
    capacity: CapacityState,
  ): Promise<void> {
    // Warning threshold
    if (
      capacity.utilizationPercent >= this.warningThreshold &&
      capacity.utilizationPercent < this.autoDisableThreshold
    ) {
      this.eventEmitter.emit('capacity.warning', {
        restaurantId,
        utilization: capacity.utilizationPercent,
        maxOrders: capacity.maxOrders,
        currentOrders: capacity.currentOrders,
      });
    }

    // Auto-disable threshold
    if (capacity.utilizationPercent >= this.autoDisableThreshold && !capacity.isPaused) {
      await this.pauseOrders(restaurantId, 'AUTO_CAPACITY');
    }
  }

  /**
   * Pause order acceptance
   */
  async pauseOrders(restaurantId: string, reason: string): Promise<void> {
    const capacity = await this.getCurrentCapacity(restaurantId);

    if (capacity.isPaused) {
      return; // Already paused
    }

    capacity.isPaused = true;
    capacity.pausedAt = new Date().toISOString();
    capacity.pauseReason = reason;

    // Update cache
    const cacheKey = `${CapacityService.CAPACITY_CACHE_KEY_PREFIX}${restaurantId}`;
    await this.redis.setJson(cacheKey, capacity, CapacityService.CAPACITY_CACHE_TTL);

    // Notify KitchenHub to stop sending orders
    try {
      await this.kitchenHubClient.setAcceptingOrders(restaurantId, false);
    } catch (error) {
      this.logger.error(`Failed to pause orders on KitchenHub: ${error.message}`);
    }

    this.logger.warn(`Paused orders for restaurant ${restaurantId}: ${reason}`);

    // Emit event
    this.eventEmitter.emit('capacity.paused', {
      restaurantId,
      reason,
      utilization: capacity.utilizationPercent,
    });
  }

  /**
   * Resume order acceptance
   */
  async resumeOrders(restaurantId: string): Promise<void> {
    const capacity = await this.getCurrentCapacity(restaurantId);

    if (!capacity.isPaused) {
      return; // Not paused
    }

    capacity.isPaused = false;
    capacity.pausedAt = undefined;
    capacity.pauseReason = undefined;

    // Update cache
    const cacheKey = `${CapacityService.CAPACITY_CACHE_KEY_PREFIX}${restaurantId}`;
    await this.redis.setJson(cacheKey, capacity, CapacityService.CAPACITY_CACHE_TTL);

    // Notify KitchenHub to resume orders
    try {
      await this.kitchenHubClient.setAcceptingOrders(restaurantId, true);
    } catch (error) {
      this.logger.error(`Failed to resume orders on KitchenHub: ${error.message}`);
    }

    this.logger.log(`Resumed orders for restaurant ${restaurantId}`);

    // Emit event
    this.eventEmitter.emit('capacity.resumed', {
      restaurantId,
      utilization: capacity.utilizationPercent,
    });
  }

  // ==================== Capacity History ====================

  /**
   * Record capacity history point
   */
  private async recordCapacityHistory(
    restaurantId: string,
    capacity: CapacityState,
  ): Promise<void> {
    const historyKey = `${CapacityService.CAPACITY_HISTORY_KEY_PREFIX}${restaurantId}`;

    const entry: CapacityHistoryEntry = {
      timestamp: new Date(),
      currentOrders: capacity.currentOrders,
      maxOrders: capacity.maxOrders,
      utilizationPercent: capacity.utilizationPercent,
    };

    // Add to sorted set with timestamp as score
    await this.redis.set(
      `${historyKey}:${Date.now()}`,
      JSON.stringify(entry),
      3600, // Keep for 1 hour
    );
  }

  /**
   * Get capacity history for analytics
   */
  async getCapacityHistory(
    restaurantId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<CapacityHistoryEntry[]> {
    // For recent history, get from Redis
    // For older history, query from database aggregations

    // Get sessions in time range
    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: {
          gte: startTime,
          lte: endTime,
        },
      },
      include: {
        orders: {
          select: {
            receivedAt: true,
            pickedUpAt: true,
            cancelledAt: true,
            status: true,
          },
        },
      },
    });

    // Aggregate order counts by time buckets
    const history: CapacityHistoryEntry[] = [];
    const bucketSize = 15 * 60 * 1000; // 15-minute buckets

    for (const session of sessions) {
      const sessionStart = session.startedAt.getTime();
      const sessionEnd = (session.endedAt || new Date()).getTime();

      for (let time = sessionStart; time <= sessionEnd; time += bucketSize) {
        const bucketEnd = time + bucketSize;

        // Count orders that were active during this bucket
        const activeOrders = session.orders.filter((order) => {
          const received = order.receivedAt.getTime();
          const completed = order.pickedUpAt?.getTime() || order.cancelledAt?.getTime();

          return received <= bucketEnd && (!completed || completed >= time);
        }).length;

        history.push({
          timestamp: new Date(time),
          currentOrders: activeOrders,
          maxOrders: session.maxOrders,
          utilizationPercent: Math.round((activeOrders / session.maxOrders) * 100),
        });
      }
    }

    return history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get peak utilization for a time range
   */
  async getPeakUtilization(
    restaurantId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<{
    peakUtilization: number;
    peakTime: Date;
    averageUtilization: number;
  }> {
    const history = await this.getCapacityHistory(restaurantId, startTime, endTime);

    if (history.length === 0) {
      return {
        peakUtilization: 0,
        peakTime: new Date(),
        averageUtilization: 0,
      };
    }

    let peak = history[0];
    let totalUtilization = 0;

    for (const entry of history) {
      if (entry.utilizationPercent > peak.utilizationPercent) {
        peak = entry;
      }
      totalUtilization += entry.utilizationPercent;
    }

    return {
      peakUtilization: peak.utilizationPercent,
      peakTime: peak.timestamp,
      averageUtilization: Math.round(totalUtilization / history.length),
    };
  }

  // ==================== Cache Management ====================

  /**
   * Invalidate capacity cache
   */
  async invalidateCapacityCache(restaurantId: string): Promise<void> {
    const cacheKey = `${CapacityService.CAPACITY_CACHE_KEY_PREFIX}${restaurantId}`;
    await this.redis.del(cacheKey);
  }

  /**
   * Sync capacity from database (recalculate)
   */
  async syncCapacityFromDatabase(restaurantId: string): Promise<CapacityState> {
    await this.invalidateCapacityCache(restaurantId);
    return this.getCurrentCapacity(restaurantId);
  }
}
