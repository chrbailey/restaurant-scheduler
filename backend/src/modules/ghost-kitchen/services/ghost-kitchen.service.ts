import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { AggregatorClientService } from './aggregator-client.service';

/**
 * Ghost Kitchen Service
 *
 * Manages ghost kitchen mode operations:
 * - Enable/disable delivery mode
 * - Track order capacity
 * - Session management
 */
@Injectable()
export class GhostKitchenService {
  private readonly logger = new Logger(GhostKitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly aggregator: AggregatorClientService,
  ) {}

  /**
   * Enable ghost mode for a restaurant
   */
  async enableGhostMode(
    restaurantId: string,
    userId: string,
    options?: {
      endTime?: Date;
      platforms?: string[];
      maxOrders?: number;
    },
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new BadRequestException('Restaurant not found');
    }

    if (!restaurant.ghostKitchenEnabled) {
      throw new BadRequestException('Ghost kitchen is not enabled for this restaurant');
    }

    // Check for active session
    const activeSession = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        endedAt: null,
      },
    });

    if (activeSession) {
      throw new BadRequestException('Ghost mode is already active');
    }

    const platforms = options?.platforms || restaurant.enabledPlatforms;
    const maxOrders = options?.maxOrders || restaurant.maxConcurrentOrders;

    // Create session
    const session = await this.prisma.ghostKitchenSession.create({
      data: {
        restaurantId,
        platforms,
        maxOrders,
        scheduledEndAt: options?.endTime,
        startedByUserId: userId,
      },
    });

    // Notify aggregator
    await this.aggregator.setAcceptingOrders(restaurantId, true, platforms);

    // Cache active status
    await this.redis.setJson(`ghost:${restaurantId}`, {
      sessionId: session.id,
      active: true,
      maxOrders,
      currentOrders: 0,
    });

    this.logger.log(`Ghost mode enabled for restaurant ${restaurantId}`);

    return session;
  }

  /**
   * Disable ghost mode
   */
  async disableGhostMode(
    restaurantId: string,
    userId: string,
    reason?: string,
  ) {
    const session = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        endedAt: null,
      },
    });

    if (!session) {
      throw new BadRequestException('Ghost mode is not active');
    }

    // Update session
    await this.prisma.ghostKitchenSession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(),
        endedByUserId: userId,
        endReason: reason || 'MANUAL',
      },
    });

    // Notify aggregator
    await this.aggregator.setAcceptingOrders(restaurantId, false, session.platforms);

    // Clear cache
    await this.redis.del(`ghost:${restaurantId}`);

    this.logger.log(`Ghost mode disabled for restaurant ${restaurantId}`);

    return this.getStatus(restaurantId);
  }

  /**
   * Get current ghost mode status
   */
  async getStatus(restaurantId: string) {
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);

    if (cached?.active) {
      const session = await this.prisma.ghostKitchenSession.findUnique({
        where: { id: cached.sessionId },
      });

      return {
        enabled: true,
        sessionId: session?.id,
        startedAt: session?.startedAt,
        scheduledEndAt: session?.scheduledEndAt,
        currentOrders: cached.currentOrders,
        maxOrders: cached.maxOrders,
        utilizationPercent: Math.round((cached.currentOrders / cached.maxOrders) * 100),
        platforms: session?.platforms || [],
      };
    }

    return {
      enabled: false,
      currentOrders: 0,
      maxOrders: 0,
      utilizationPercent: 0,
      platforms: [],
    };
  }

  /**
   * Handle incoming order webhook from aggregator
   */
  async handleIncomingOrder(
    restaurantId: string,
    order: {
      externalOrderId: string;
      platform: string;
      totalAmount: number;
      itemCount: number;
    },
  ) {
    const status = await this.getStatus(restaurantId);

    if (!status.enabled) {
      this.logger.warn(`Order received while ghost mode disabled: ${order.externalOrderId}`);
      return { accepted: false, reason: 'Ghost mode not active' };
    }

    // Check capacity
    if (status.currentOrders >= status.maxOrders) {
      this.logger.warn(`Order rejected due to capacity: ${order.externalOrderId}`);
      return { accepted: false, reason: 'At capacity' };
    }

    // Get active session
    const session = await this.prisma.ghostKitchenSession.findFirst({
      where: { restaurantId, endedAt: null },
    });

    if (!session) {
      return { accepted: false, reason: 'No active session' };
    }

    // Create order record
    const dbOrder = await this.prisma.ghostKitchenOrder.create({
      data: {
        sessionId: session.id,
        externalOrderId: order.externalOrderId,
        platform: order.platform,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        status: 'RECEIVED',
        receivedAt: new Date(),
      },
    });

    // Update session stats
    await this.prisma.ghostKitchenSession.update({
      where: { id: session.id },
      data: {
        totalOrders: { increment: 1 },
        totalRevenue: { increment: order.totalAmount },
      },
    });

    // Update cache
    const cached = await this.redis.getJson<any>(`ghost:${restaurantId}`);
    if (cached) {
      cached.currentOrders += 1;
      await this.redis.setJson(`ghost:${restaurantId}`, cached);

      // Check auto-disable threshold
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
      });

      const utilization = (cached.currentOrders / cached.maxOrders) * 100;
      if (restaurant && utilization >= restaurant.autoDisableThreshold) {
        await this.disableGhostMode(restaurantId, 'SYSTEM', 'AUTO_CAPACITY');
      }
    }

    this.logger.log(`Order accepted: ${order.externalOrderId}`);

    return { accepted: true, orderId: dbOrder.id };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED',
    cancelReason?: string,
  ) {
    const updateData: any = { status };

    switch (status) {
      case 'PREPARING':
        updateData.prepStartedAt = new Date();
        break;
      case 'READY':
        updateData.readyAt = new Date();
        break;
      case 'PICKED_UP':
        updateData.pickedUpAt = new Date();
        break;
      case 'CANCELLED':
        updateData.cancelledAt = new Date();
        updateData.cancelReason = cancelReason;
        break;
    }

    const order = await this.prisma.ghostKitchenOrder.update({
      where: { id: orderId },
      data: updateData,
      include: {
        session: {
          select: { restaurantId: true },
        },
      },
    });

    // If completed or cancelled, decrement current orders
    if (status === 'PICKED_UP' || status === 'CANCELLED') {
      const cached = await this.redis.getJson<any>(`ghost:${order.session.restaurantId}`);
      if (cached) {
        cached.currentOrders = Math.max(0, cached.currentOrders - 1);
        await this.redis.setJson(`ghost:${order.session.restaurantId}`, cached);
      }
    }

    // Notify aggregator
    await this.aggregator.updateOrderStatus(
      order.externalOrderId,
      order.platform,
      status,
    );

    return order;
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId: string) {
    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
      include: {
        orders: true,
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    const completedOrders = session.orders.filter((o) => o.status === 'PICKED_UP');
    const prepTimes = completedOrders
      .filter((o) => o.prepStartedAt && o.readyAt)
      .map((o) => (o.readyAt!.getTime() - o.prepStartedAt!.getTime()) / 1000);

    return {
      sessionId: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      duration: session.endedAt
        ? (session.endedAt.getTime() - session.startedAt.getTime()) / 1000 / 60
        : null,
      totalOrders: session.totalOrders,
      totalRevenue: Number(session.totalRevenue),
      completedOrders: completedOrders.length,
      cancelledOrders: session.orders.filter((o) => o.status === 'CANCELLED').length,
      averagePrepTime: prepTimes.length
        ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length
        : null,
      peakUtilization: session.peakUtilization,
      byPlatform: this.aggregateByPlatform(session.orders),
    };
  }

  private aggregateByPlatform(orders: any[]) {
    const byPlatform: Record<string, { orders: number; revenue: number }> = {};

    for (const order of orders) {
      if (!byPlatform[order.platform]) {
        byPlatform[order.platform] = { orders: 0, revenue: 0 };
      }
      byPlatform[order.platform].orders += 1;
      byPlatform[order.platform].revenue += Number(order.totalAmount);
    }

    return Object.entries(byPlatform).map(([platform, stats]) => ({
      platform,
      ...stats,
    }));
  }
}
