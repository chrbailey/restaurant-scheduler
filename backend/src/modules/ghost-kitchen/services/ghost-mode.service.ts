import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { AggregatorClientService } from './aggregator-client.service';
import { NotificationService } from '@/modules/notification/services/notification.service';
import {
  GhostModeConfig,
  GhostModeStatus,
  SessionStatus,
  SessionEndReason,
  DEFAULT_GHOST_MODE_CONFIG,
  DeliveryPlatform,
} from '../entities/ghost-kitchen-session.entity';
import { GhostKitchenGateway } from '../gateways/ghost-kitchen.gateway';

/**
 * Ghost Mode Service
 *
 * Core service for controlling ghost kitchen mode:
 * - Enable/disable ghost mode
 * - Pause/resume operations
 * - Track real-time status and capacity
 * - Auto-disable based on rules
 */
@Injectable()
export class GhostModeService {
  private readonly logger = new Logger(GhostModeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly aggregator: AggregatorClientService,
    private readonly notificationService: NotificationService,
    private readonly gateway: GhostKitchenGateway,
  ) {}

  /**
   * Enable ghost mode for a restaurant
   */
  async enableGhostMode(
    restaurantId: string,
    userId: string,
    config?: Partial<GhostModeConfig>,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    if (!restaurant.ghostKitchenEnabled) {
      throw new BadRequestException(
        'Ghost kitchen is not enabled for this restaurant',
      );
    }

    // Check for active session
    const activeSession = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
    });

    if (activeSession) {
      throw new BadRequestException(
        'Ghost mode is already active. Disable it first or resume if paused.',
      );
    }

    // Build configuration
    const sessionConfig: GhostModeConfig = {
      ...DEFAULT_GHOST_MODE_CONFIG,
      maxOrders: config?.maxOrders || restaurant.maxConcurrentOrders,
      platforms:
        (config?.platforms as DeliveryPlatform[]) ||
        (restaurant.enabledPlatforms as DeliveryPlatform[]) ||
        DEFAULT_GHOST_MODE_CONFIG.platforms,
      endTime: config?.endTime,
      autoAccept: config?.autoAccept ?? DEFAULT_GHOST_MODE_CONFIG.autoAccept,
      minPrepTime:
        config?.minPrepTime ?? DEFAULT_GHOST_MODE_CONFIG.minPrepTime,
      supplyPackagingCost:
        config?.supplyPackagingCost ??
        DEFAULT_GHOST_MODE_CONFIG.supplyPackagingCost,
    };

    // Create session
    const session = await this.prisma.ghostKitchenSession.create({
      data: {
        restaurantId,
        platforms: sessionConfig.platforms,
        maxOrders: sessionConfig.maxOrders,
        status: SessionStatus.ACTIVE,
        config: sessionConfig as any,
        scheduledEndAt: sessionConfig.endTime,
        startedByUserId: userId,
        platformBreakdown: {},
      },
    });

    // Update KitchenHub: accepting_orders=true
    await this.aggregator.setAcceptingOrders(
      restaurantId,
      true,
      sessionConfig.platforms,
    );

    // Cache active status in Redis for fast lookups
    await this.redis.setJson(`ghost:${restaurantId}`, {
      sessionId: session.id,
      status: SessionStatus.ACTIVE,
      maxOrders: sessionConfig.maxOrders,
      currentOrders: 0,
      config: sessionConfig,
    });

    // Notify delivery-certified staff of available shifts
    await this.notifyDeliveryCertifiedStaff(restaurantId, session.id);

    // Emit real-time event
    this.gateway.emitSessionStarted(restaurantId, {
      sessionId: session.id,
      startedAt: session.startedAt,
      config: sessionConfig,
    });

    this.logger.log(`Ghost mode enabled for restaurant ${restaurantId}`);

    return {
      sessionId: session.id,
      startedAt: session.startedAt,
      config: sessionConfig,
      status: SessionStatus.ACTIVE,
    };
  }

  /**
   * Disable ghost mode for a restaurant
   */
  async disableGhostMode(
    restaurantId: string,
    userId: string,
    reason: SessionEndReason = SessionEndReason.MANUAL,
  ) {
    const session = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
    });

    if (!session) {
      throw new BadRequestException('Ghost mode is not currently active');
    }

    const endedAt = new Date();

    // Calculate final average prep time
    const avgPrepTime =
      session.totalOrders > 0
        ? Math.round(session.totalPrepTime / session.totalOrders)
        : null;

    // Update session
    const updatedSession = await this.prisma.ghostKitchenSession.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.ENDED,
        endedAt,
        endedByUserId: userId,
        endReason: reason,
        avgPrepTime,
      },
      include: {
        orders: true,
      },
    });

    // Update KitchenHub: accepting_orders=false
    await this.aggregator.setAcceptingOrders(
      restaurantId,
      false,
      session.platforms,
    );

    // Clear cache
    await this.redis.del(`ghost:${restaurantId}`);

    // Emit real-time event
    this.gateway.emitSessionEnded(restaurantId, {
      sessionId: session.id,
      endedAt,
      reason,
      stats: {
        totalOrders: updatedSession.totalOrders,
        totalRevenue: Number(updatedSession.totalRevenue),
        avgPrepTime,
      },
    });

    this.logger.log(
      `Ghost mode disabled for restaurant ${restaurantId}, reason: ${reason}`,
    );

    return this.getGhostModeStatus(restaurantId);
  }

  /**
   * Pause ghost mode temporarily
   */
  async pauseGhostMode(
    restaurantId: string,
    userId: string,
    options?: {
      duration?: number; // Minutes until auto-resume
      reason?: string;
    },
  ) {
    const session = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        status: SessionStatus.ACTIVE,
      },
    });

    if (!session) {
      throw new BadRequestException('Ghost mode is not currently active');
    }

    const pausedAt = new Date();
    const pauseEndTime = options?.duration
      ? new Date(pausedAt.getTime() + options.duration * 60 * 1000)
      : null;

    // Update session
    await this.prisma.ghostKitchenSession.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.PAUSED,
        pausedAt,
        pauseReason: options?.reason || 'Manual pause',
        pauseEndTime,
      },
    });

    // Update KitchenHub to stop accepting orders
    await this.aggregator.setAcceptingOrders(
      restaurantId,
      false,
      session.platforms,
    );

    // Update cache
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);
    if (cached) {
      cached.status = SessionStatus.PAUSED;
      cached.pausedAt = pausedAt;
      cached.pauseEndTime = pauseEndTime;
      await this.redis.setJson(`ghost:${restaurantId}`, cached);
    }

    // Emit real-time event
    this.gateway.emitSessionPaused(restaurantId, {
      sessionId: session.id,
      pausedAt,
      pauseEndTime,
      reason: options?.reason,
    });

    this.logger.log(`Ghost mode paused for restaurant ${restaurantId}`);

    return this.getGhostModeStatus(restaurantId);
  }

  /**
   * Resume ghost mode from pause
   */
  async resumeGhostMode(restaurantId: string, userId: string) {
    const session = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        status: SessionStatus.PAUSED,
      },
    });

    if (!session) {
      throw new BadRequestException('Ghost mode is not currently paused');
    }

    // Update session
    await this.prisma.ghostKitchenSession.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.ACTIVE,
        pausedAt: null,
        pauseReason: null,
        pauseEndTime: null,
      },
    });

    // Update KitchenHub to resume accepting orders
    await this.aggregator.setAcceptingOrders(
      restaurantId,
      true,
      session.platforms,
    );

    // Update cache
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);
    if (cached) {
      cached.status = SessionStatus.ACTIVE;
      cached.pausedAt = null;
      cached.pauseEndTime = null;
      await this.redis.setJson(`ghost:${restaurantId}`, cached);
    }

    // Emit real-time event
    this.gateway.emitSessionResumed(restaurantId, {
      sessionId: session.id,
      resumedAt: new Date(),
    });

    this.logger.log(`Ghost mode resumed for restaurant ${restaurantId}`);

    return this.getGhostModeStatus(restaurantId);
  }

  /**
   * Get current ghost mode status
   */
  async getGhostModeStatus(restaurantId: string): Promise<GhostModeStatus> {
    // Try cache first
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);

    if (cached && cached.status !== SessionStatus.ENDED) {
      const session = await this.prisma.ghostKitchenSession.findUnique({
        where: { id: cached.sessionId },
      });

      if (session && session.status !== SessionStatus.ENDED) {
        return {
          enabled: true,
          status: session.status as SessionStatus,
          sessionId: session.id,
          startedAt: session.startedAt,
          scheduledEndAt: session.scheduledEndAt,
          pausedAt: session.pausedAt,
          pauseEndTime: session.pauseEndTime,
          currentOrders: cached.currentOrders || 0,
          maxOrders: cached.maxOrders,
          utilizationPercent: Math.round(
            ((cached.currentOrders || 0) / cached.maxOrders) * 100,
          ),
          platforms: session.platforms as DeliveryPlatform[],
          config: session.config as unknown as GhostModeConfig,
        };
      }
    }

    // No active session
    return {
      enabled: false,
      status: null,
      sessionId: null,
      startedAt: null,
      scheduledEndAt: null,
      pausedAt: null,
      pauseEndTime: null,
      currentOrders: 0,
      maxOrders: 0,
      utilizationPercent: 0,
      platforms: [],
      config: null,
    };
  }

  /**
   * Auto-disable ghost mode based on capacity or time rules
   */
  async autoDisable(
    restaurantId: string,
    reason: SessionEndReason,
  ): Promise<void> {
    this.logger.log(
      `Auto-disabling ghost mode for restaurant ${restaurantId}, reason: ${reason}`,
    );

    await this.disableGhostMode(restaurantId, 'SYSTEM', reason);
  }

  /**
   * Check and handle scheduled end time
   */
  async checkScheduledEnd(restaurantId: string): Promise<boolean> {
    const status = await this.getGhostModeStatus(restaurantId);

    if (
      status.enabled &&
      status.scheduledEndAt &&
      new Date() >= status.scheduledEndAt
    ) {
      await this.autoDisable(restaurantId, SessionEndReason.SCHEDULED);
      return true;
    }

    return false;
  }

  /**
   * Check and handle auto-resume from pause
   */
  async checkAutoResume(restaurantId: string): Promise<boolean> {
    const status = await this.getGhostModeStatus(restaurantId);

    if (
      status.enabled &&
      status.status === SessionStatus.PAUSED &&
      status.pauseEndTime &&
      new Date() >= status.pauseEndTime
    ) {
      await this.resumeGhostMode(restaurantId, 'SYSTEM');
      return true;
    }

    return false;
  }

  /**
   * Update current order count (called when orders are received/completed)
   */
  async updateCurrentOrderCount(
    restaurantId: string,
    delta: number,
  ): Promise<void> {
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);

    if (!cached || cached.status !== SessionStatus.ACTIVE) {
      return;
    }

    cached.currentOrders = Math.max(0, (cached.currentOrders || 0) + delta);
    await this.redis.setJson(`ghost:${restaurantId}`, cached);

    // Update peak concurrent orders if applicable
    if (delta > 0) {
      const session = await this.prisma.ghostKitchenSession.findUnique({
        where: { id: cached.sessionId },
      });

      if (session && cached.currentOrders > session.peakConcurrentOrders) {
        await this.prisma.ghostKitchenSession.update({
          where: { id: cached.sessionId },
          data: {
            peakConcurrentOrders: cached.currentOrders,
            peakUtilization: Math.round(
              (cached.currentOrders / cached.maxOrders) * 100,
            ),
          },
        });
      }

      // Check auto-disable threshold
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
      });

      if (restaurant) {
        const utilization = (cached.currentOrders / cached.maxOrders) * 100;
        if (utilization >= restaurant.autoDisableThreshold) {
          await this.autoDisable(restaurantId, SessionEndReason.CAPACITY);
        }
      }
    }

    // Emit capacity update
    this.gateway.emitCapacityUpdate(restaurantId, {
      currentOrders: cached.currentOrders,
      maxOrders: cached.maxOrders,
      utilizationPercent: Math.round(
        (cached.currentOrders / cached.maxOrders) * 100,
      ),
    });
  }

  /**
   * Notify delivery-certified staff of available ghost kitchen shifts
   */
  private async notifyDeliveryCertifiedStaff(
    restaurantId: string,
    sessionId: string,
  ): Promise<void> {
    try {
      // Find workers with DELIVERY certification at this restaurant
      const certifiedWorkers = await this.prisma.workerProfile.findMany({
        where: {
          restaurantId,
          status: 'ACTIVE',
          certifications: {
            some: {
              type: 'DELIVERY',
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        },
        select: {
          userId: true,
          user: {
            select: {
              firstName: true,
            },
          },
        },
      });

      // Send notifications
      for (const worker of certifiedWorkers) {
        await this.notificationService.send(
          worker.userId,
          'GHOST_KITCHEN_STARTED' as any,
          {
            restaurantId,
            sessionId,
            workerName: worker.user.firstName,
          },
        );
      }

      this.logger.log(
        `Notified ${certifiedWorkers.length} delivery-certified workers`,
      );
    } catch (error) {
      this.logger.error('Failed to notify workers: ' + error.message);
    }
  }
}
