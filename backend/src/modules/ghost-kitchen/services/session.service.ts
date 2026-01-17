import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import {
  SessionStatus,
  SessionEndReason,
  SessionStats,
  GhostModeConfig,
  PlatformBreakdown,
  DateRangeFilter,
  DeliveryPlatform,
} from '../entities/ghost-kitchen-session.entity';
import { GhostKitchenGateway } from '../gateways/ghost-kitchen.gateway';

/**
 * Session Service
 *
 * Manages ghost kitchen session lifecycle and statistics:
 * - Create and end sessions
 * - Track real-time statistics
 * - Retrieve session history
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: GhostKitchenGateway,
  ) {}

  /**
   * Create a new ghost kitchen session
   */
  async createSession(
    restaurantId: string,
    userId: string,
    config: GhostModeConfig,
  ) {
    // Check for existing active session
    const existingSession = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
    });

    if (existingSession) {
      throw new BadRequestException(
        'An active session already exists for this restaurant',
      );
    }

    // Create session
    const session = await this.prisma.ghostKitchenSession.create({
      data: {
        restaurantId,
        platforms: config.platforms,
        maxOrders: config.maxOrders,
        status: SessionStatus.ACTIVE,
        config: config as any,
        scheduledEndAt: config.endTime,
        startedByUserId: userId,
        platformBreakdown: this.initializePlatformBreakdown(config.platforms),
      },
    });

    this.logger.log(`Session ${session.id} created for restaurant ${restaurantId}`);

    return session;
  }

  /**
   * End a ghost kitchen session
   */
  async endSession(
    sessionId: string,
    userId: string,
    reason: SessionEndReason = SessionEndReason.MANUAL,
  ) {
    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
      include: {
        orders: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status === SessionStatus.ENDED) {
      throw new BadRequestException('Session is already ended');
    }

    const endedAt = new Date();

    // Calculate final statistics
    const completedOrders = session.orders.filter(
      (o) => o.status === 'PICKED_UP',
    );
    const avgPrepTime =
      completedOrders.length > 0
        ? Math.round(session.totalPrepTime / completedOrders.length)
        : null;

    // Update session
    const updatedSession = await this.prisma.ghostKitchenSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ENDED,
        endedAt,
        endedByUserId: userId,
        endReason: reason,
        avgPrepTime,
      },
    });

    this.logger.log(`Session ${sessionId} ended, reason: ${reason}`);

    return updatedSession;
  }

  /**
   * Get the active session for a restaurant
   */
  async getActiveSession(restaurantId: string) {
    const session = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Get current orders from cache
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);

    return {
      ...session,
      currentOrders: cached?.currentOrders || 0,
    };
  }

  /**
   * Get session history for a restaurant
   */
  async getSessionHistory(
    restaurantId: string,
    dateRange?: DateRangeFilter,
    options?: {
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = {
      restaurantId,
      status: SessionStatus.ENDED,
    };

    if (dateRange) {
      where.startedAt = {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      };
    }

    const [sessions, total] = await Promise.all([
      this.prisma.ghostKitchenSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
        include: {
          _count: {
            select: {
              orders: true,
            },
          },
        },
      }),
      this.prisma.ghostKitchenSession.count({ where }),
    ]);

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        duration: session.endedAt
          ? Math.round(
              (session.endedAt.getTime() - session.startedAt.getTime()) /
                1000 /
                60,
            )
          : null,
        totalOrders: session.totalOrders,
        totalRevenue: Number(session.totalRevenue),
        avgPrepTime: session.avgPrepTime,
        peakUtilization: session.peakUtilization,
        endReason: session.endReason,
        platforms: session.platforms,
      })),
      total,
      limit: options?.limit || 20,
      offset: options?.offset || 0,
    };
  }

  /**
   * Get detailed session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<SessionStats> {
    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
      include: {
        orders: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const completedOrders = session.orders.filter(
      (o) => o.status === 'PICKED_UP',
    );
    const cancelledOrders = session.orders.filter(
      (o) => o.status === 'CANCELLED',
    );

    // Calculate prep times for completed orders
    const prepTimes = completedOrders
      .filter((o) => o.prepStartedAt && o.readyAt)
      .map(
        (o) => (o.readyAt!.getTime() - o.prepStartedAt!.getTime()) / 1000,
      );

    const avgPrepTime =
      prepTimes.length > 0
        ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length
        : null;

    // Build platform breakdown
    const platformBreakdown = this.calculatePlatformBreakdown(session.orders);

    return {
      totalOrders: session.totalOrders,
      totalRevenue: Number(session.totalRevenue),
      totalPrepTime: session.totalPrepTime,
      avgPrepTime,
      peakConcurrentOrders: session.peakConcurrentOrders,
      peakUtilization: session.peakUtilization,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      platformBreakdown,
    };
  }

  /**
   * Update session stats in real-time
   */
  async updateSessionStats(
    sessionId: string,
    updates: {
      orderCompleted?: {
        prepTime: number; // seconds
        platform: string;
        revenue: number;
      };
      orderReceived?: {
        platform: string;
        revenue: number;
      };
      orderCancelled?: {
        platform: string;
        revenue: number;
      };
    },
  ): Promise<void> {
    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status === SessionStatus.ENDED) {
      return;
    }

    const updateData: any = {};
    const currentBreakdown = (session.platformBreakdown as any) || {};

    if (updates.orderReceived) {
      updateData.totalOrders = { increment: 1 };
      updateData.totalRevenue = { increment: updates.orderReceived.revenue };

      // Update platform breakdown
      const platform = updates.orderReceived.platform;
      if (!currentBreakdown[platform]) {
        currentBreakdown[platform] = { orders: 0, revenue: 0, prepTimes: [] };
      }
      currentBreakdown[platform].orders += 1;
      currentBreakdown[platform].revenue += updates.orderReceived.revenue;
    }

    if (updates.orderCompleted) {
      updateData.totalPrepTime = { increment: updates.orderCompleted.prepTime };

      // Update platform breakdown with prep time
      const platform = updates.orderCompleted.platform;
      if (currentBreakdown[platform]) {
        if (!currentBreakdown[platform].prepTimes) {
          currentBreakdown[platform].prepTimes = [];
        }
        currentBreakdown[platform].prepTimes.push(
          updates.orderCompleted.prepTime,
        );
      }
    }

    if (updates.orderCancelled) {
      // We keep the order count but could track cancellations separately
      const platform = updates.orderCancelled.platform;
      if (currentBreakdown[platform]) {
        currentBreakdown[platform].cancellations =
          (currentBreakdown[platform].cancellations || 0) + 1;
      }
    }

    updateData.platformBreakdown = currentBreakdown;

    await this.prisma.ghostKitchenSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // Emit real-time stats update
    const stats = await this.getSessionMetrics(sessionId);
    this.gateway.emitSessionStats(session.restaurantId, {
      sessionId,
      stats,
    });
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string) {
    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
      include: {
        orders: {
          orderBy: { receivedAt: 'desc' },
          take: 50,
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            timezone: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // If active, get current orders from cache
    let currentOrders = 0;
    if (session.status !== SessionStatus.ENDED) {
      const cached = await this.redis.getJson<any>(
        `ghost:${session.restaurantId}`,
      );
      currentOrders = cached?.currentOrders || 0;
    }

    return {
      ...session,
      currentOrders,
      config: session.config as unknown as GhostModeConfig,
      platformBreakdown: this.calculatePlatformBreakdown(session.orders),
    };
  }

  /**
   * Initialize platform breakdown structure
   */
  private initializePlatformBreakdown(
    platforms: DeliveryPlatform[],
  ): Record<string, any> {
    const breakdown: Record<string, any> = {};

    for (const platform of platforms) {
      breakdown[platform] = {
        orders: 0,
        revenue: 0,
        prepTimes: [],
        cancellations: 0,
      };
    }

    return breakdown;
  }

  /**
   * Calculate platform breakdown from orders
   */
  private calculatePlatformBreakdown(orders: any[]): PlatformBreakdown[] {
    const byPlatform: Record<string, PlatformBreakdown> = {};

    for (const order of orders) {
      const platform = order.platform as DeliveryPlatform;

      if (!byPlatform[platform]) {
        byPlatform[platform] = {
          platform,
          orders: 0,
          revenue: 0,
          fees: 0,
        };
      }

      byPlatform[platform].orders += 1;
      byPlatform[platform].revenue += Number(order.totalAmount);

      // Calculate prep time if completed
      if (
        order.status === 'PICKED_UP' &&
        order.prepStartedAt &&
        order.readyAt
      ) {
        const prepTime =
          (order.readyAt.getTime() - order.prepStartedAt.getTime()) / 1000;
        if (!byPlatform[platform].averagePrepTime) {
          byPlatform[platform].averagePrepTime = prepTime;
        } else {
          // Running average
          byPlatform[platform].averagePrepTime =
            (byPlatform[platform].averagePrepTime! + prepTime) / 2;
        }
      }
    }

    return Object.values(byPlatform);
  }
}
