import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { KitchenHubClient } from '../clients/kitchenhub.client';
import { CapacityService } from './capacity.service';
import {
  KitchenHubOrderDto,
  OrderStatus,
  OrderMetricsDto,
} from '../dto/kitchenhub.dto';
import {
  GhostOrderStatus,
  OrderCancellationReason,
  isValidStatusTransition,
  calculatePrepTime,
  isOrderActive,
} from '../entities/ghost-order.entity';
import { DeliveryPlatform } from '../config/kitchenhub.config';

/**
 * Auto-accept decision result
 */
interface AutoAcceptResult {
  shouldAutoAccept: boolean;
  reason: string;
  suggestedPrepTime?: number;
}

/**
 * Order processing result
 */
interface OrderProcessingResult {
  accepted: boolean;
  orderId?: string;
  reason?: string;
  prepTimeMinutes?: number;
}

/**
 * Order Service
 *
 * Manages ghost kitchen order lifecycle:
 * - Process incoming orders from webhooks
 * - Update order statuses
 * - Track order metrics
 * - Handle auto-accept logic
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly autoAcceptEnabled: boolean;
  private readonly autoAcceptMaxTotal: number;
  private readonly autoAcceptMaxItems: number;

  private static readonly ACTIVE_ORDERS_CACHE_PREFIX = 'ghost:orders:active:';
  private static readonly ACTIVE_ORDERS_CACHE_TTL = 30; // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly kitchenHubClient: KitchenHubClient,
    private readonly capacityService: CapacityService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.autoAcceptEnabled = this.configService.get<boolean>(
      'kitchenhub.orders.autoAcceptEnabled',
      false,
    );
    this.autoAcceptMaxTotal = this.configService.get<number>(
      'kitchenhub.orders.autoAcceptMaxTotal',
      100,
    );
    this.autoAcceptMaxItems = this.configService.get<number>(
      'kitchenhub.orders.autoAcceptMaxItems',
      10,
    );
  }

  // ==================== Incoming Order Processing ====================

  /**
   * Process incoming order from webhook
   */
  async processIncomingOrder(
    orderData: KitchenHubOrderDto,
  ): Promise<OrderProcessingResult> {
    const { restaurantId, externalOrderId, platform } = orderData;

    this.logger.log(
      `Processing incoming order ${externalOrderId} from ${platform} for restaurant ${restaurantId}`,
    );

    // Check for duplicate order
    const existing = await this.prisma.ghostKitchenOrder.findFirst({
      where: {
        externalOrderId,
        platform,
      },
    });

    if (existing) {
      this.logger.warn(`Duplicate order received: ${externalOrderId}`);
      return {
        accepted: false,
        reason: 'Duplicate order',
        orderId: existing.id,
      };
    }

    // Check capacity
    const capacityCheck = await this.capacityService.canAcceptOrder(
      restaurantId,
      orderData.items.length,
    );

    if (!capacityCheck.canAccept) {
      this.logger.warn(
        `Order rejected due to capacity: ${externalOrderId} - ${capacityCheck.reason}`,
      );

      // Notify KitchenHub of rejection
      await this.kitchenHubClient.rejectOrder(
        externalOrderId,
        'CAPACITY_EXCEEDED',
        capacityCheck.reason,
      );

      return {
        accepted: false,
        reason: capacityCheck.reason,
      };
    }

    // Get active session
    const activeSession = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        endedAt: null,
      },
    });

    if (!activeSession) {
      this.logger.warn(`No active session for restaurant ${restaurantId}`);
      return {
        accepted: false,
        reason: 'No active ghost kitchen session',
      };
    }

    // Check auto-accept
    const autoAcceptResult = await this.evaluateAutoAccept(orderData, restaurantId);

    // Create order record
    const order = await this.prisma.ghostKitchenOrder.create({
      data: {
        sessionId: activeSession.id,
        externalOrderId: orderData.externalOrderId,
        platform: orderData.platform,
        status: autoAcceptResult.shouldAutoAccept
          ? GhostOrderStatus.ACCEPTED
          : GhostOrderStatus.RECEIVED,
        totalAmount: orderData.total,
        itemCount: orderData.items.length,
        receivedAt: new Date(orderData.receivedAt),
        // Store additional data in metadata if your schema supports it
      },
    });

    // Update capacity
    await this.capacityService.incrementOrderCount(restaurantId);

    // Update session stats
    await this.prisma.ghostKitchenSession.update({
      where: { id: activeSession.id },
      data: {
        totalOrders: { increment: 1 },
        totalRevenue: { increment: orderData.total },
      },
    });

    // Invalidate active orders cache
    await this.invalidateActiveOrdersCache(restaurantId);

    // Handle auto-accept flow
    if (autoAcceptResult.shouldAutoAccept) {
      await this.kitchenHubClient.acceptOrder(
        externalOrderId,
        autoAcceptResult.suggestedPrepTime || 20,
      );

      // Update order with accepted timestamp
      await this.prisma.ghostKitchenOrder.update({
        where: { id: order.id },
        data: { status: GhostOrderStatus.ACCEPTED },
      });

      this.logger.log(
        `Auto-accepted order ${externalOrderId} with prep time ${autoAcceptResult.suggestedPrepTime} min`,
      );
    }

    // Emit event for notifications
    this.eventEmitter.emit('order.received', {
      orderId: order.id,
      externalOrderId,
      restaurantId,
      platform,
      total: orderData.total,
      itemCount: orderData.items.length,
      autoAccepted: autoAcceptResult.shouldAutoAccept,
    });

    return {
      accepted: true,
      orderId: order.id,
      prepTimeMinutes: autoAcceptResult.suggestedPrepTime,
    };
  }

  // ==================== Order Status Updates ====================

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    newStatus: GhostOrderStatus,
    prepTimeMinutes?: number,
  ): Promise<any> {
    const order = await this.prisma.ghostKitchenOrder.findUnique({
      where: { id: orderId },
      include: {
        session: {
          select: { restaurantId: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const currentStatus = order.status as GhostOrderStatus;

    // Validate transition
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }

    // Build update data
    const updateData: any = { status: newStatus };

    switch (newStatus) {
      case GhostOrderStatus.ACCEPTED:
        updateData.status = GhostOrderStatus.ACCEPTED;
        break;
      case GhostOrderStatus.PREPARING:
        updateData.prepStartedAt = new Date();
        break;
      case GhostOrderStatus.READY:
        updateData.readyAt = new Date();
        break;
      case GhostOrderStatus.PICKED_UP:
        updateData.pickedUpAt = new Date();
        break;
    }

    // Update order
    const updatedOrder = await this.prisma.ghostKitchenOrder.update({
      where: { id: orderId },
      data: updateData,
    });

    // Notify KitchenHub
    await this.kitchenHubClient.updateOrderStatus(
      order.externalOrderId,
      newStatus as unknown as OrderStatus,
      prepTimeMinutes,
    );

    // Handle capacity updates for terminal states
    if (newStatus === GhostOrderStatus.PICKED_UP || newStatus === GhostOrderStatus.CANCELLED) {
      await this.capacityService.decrementOrderCount(order.session.restaurantId);
    }

    // Calculate and store actual prep time if ready
    if (newStatus === GhostOrderStatus.READY && order.prepStartedAt) {
      const actualPrepTime = Math.round(
        (new Date().getTime() - order.prepStartedAt.getTime()) / 1000,
      );

      await this.prisma.ghostKitchenOrder.update({
        where: { id: orderId },
        data: { /* Store in metadata or dedicated field if available */ },
      });
    }

    // Invalidate cache
    await this.invalidateActiveOrdersCache(order.session.restaurantId);

    // Emit event
    this.eventEmitter.emit('order.status-changed', {
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      restaurantId: order.session.restaurantId,
      previousStatus: currentStatus,
      newStatus,
    });

    this.logger.log(`Updated order ${orderId} status to ${newStatus}`);

    return updatedOrder;
  }

  /**
   * Reject an order
   */
  async rejectOrder(
    orderId: string,
    reason: OrderCancellationReason,
    details?: string,
  ): Promise<void> {
    const order = await this.prisma.ghostKitchenOrder.findUnique({
      where: { id: orderId },
      include: {
        session: {
          select: { restaurantId: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status !== GhostOrderStatus.RECEIVED) {
      throw new BadRequestException('Can only reject orders in RECEIVED status');
    }

    // Update order
    await this.prisma.ghostKitchenOrder.update({
      where: { id: orderId },
      data: {
        status: GhostOrderStatus.REJECTED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    // Notify KitchenHub
    await this.kitchenHubClient.rejectOrder(order.externalOrderId, reason, details);

    // Update capacity
    await this.capacityService.decrementOrderCount(order.session.restaurantId);

    // Invalidate cache
    await this.invalidateActiveOrdersCache(order.session.restaurantId);

    // Emit event
    this.eventEmitter.emit('order.rejected', {
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      restaurantId: order.session.restaurantId,
      reason,
      details,
    });

    this.logger.log(`Rejected order ${orderId}: ${reason}`);
  }

  /**
   * Handle external cancellation (from customer/platform)
   */
  async handleExternalCancellation(
    externalOrderId: string,
    platform: DeliveryPlatform,
    reason: string,
    initiatedBy?: string,
  ): Promise<void> {
    const order = await this.prisma.ghostKitchenOrder.findFirst({
      where: {
        externalOrderId,
        platform,
      },
      include: {
        session: {
          select: { restaurantId: true },
        },
      },
    });

    if (!order) {
      this.logger.warn(`Cancellation received for unknown order: ${externalOrderId}`);
      return;
    }

    if (!isOrderActive(order.status as GhostOrderStatus)) {
      this.logger.warn(`Cancellation received for non-active order: ${externalOrderId}`);
      return;
    }

    // Update order
    await this.prisma.ghostKitchenOrder.update({
      where: { id: order.id },
      data: {
        status: GhostOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    // Update capacity
    await this.capacityService.decrementOrderCount(order.session.restaurantId);

    // Invalidate cache
    await this.invalidateActiveOrdersCache(order.session.restaurantId);

    // Emit event
    this.eventEmitter.emit('order.cancelled', {
      orderId: order.id,
      externalOrderId,
      restaurantId: order.session.restaurantId,
      reason,
      initiatedBy,
    });

    this.logger.log(`Order ${externalOrderId} cancelled: ${reason}`);
  }

  // ==================== Active Orders ====================

  /**
   * Get active orders for a restaurant
   */
  async getActiveOrders(restaurantId: string): Promise<any[]> {
    // Check cache
    const cacheKey = `${OrderService.ACTIVE_ORDERS_CACHE_PREFIX}${restaurantId}`;
    const cached = await this.redis.getJson<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get from database
    const activeSession = await this.prisma.ghostKitchenSession.findFirst({
      where: {
        restaurantId,
        endedAt: null,
      },
    });

    if (!activeSession) {
      return [];
    }

    const orders = await this.prisma.ghostKitchenOrder.findMany({
      where: {
        sessionId: activeSession.id,
        status: {
          in: [
            GhostOrderStatus.RECEIVED,
            GhostOrderStatus.ACCEPTED,
            GhostOrderStatus.PREPARING,
            GhostOrderStatus.READY,
          ],
        },
      },
      orderBy: { receivedAt: 'asc' },
    });

    // Cache results
    await this.redis.setJson(cacheKey, orders, OrderService.ACTIVE_ORDERS_CACHE_TTL);

    return orders;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<any> {
    const order = await this.prisma.ghostKitchenOrder.findUnique({
      where: { id: orderId },
      include: {
        session: {
          select: {
            restaurantId: true,
            startedAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return order;
  }

  /**
   * Get order by external ID
   */
  async getOrderByExternalId(
    externalOrderId: string,
    platform: DeliveryPlatform,
  ): Promise<any> {
    const order = await this.prisma.ghostKitchenOrder.findFirst({
      where: {
        externalOrderId,
        platform,
      },
      include: {
        session: {
          select: {
            restaurantId: true,
            startedAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${externalOrderId} not found`);
    }

    return order;
  }

  // ==================== Order Metrics ====================

  /**
   * Get order metrics for a restaurant
   */
  async getOrderMetrics(
    restaurantId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<OrderMetricsDto> {
    // Get sessions in time range
    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: { gte: startTime },
        OR: [
          { endedAt: { lte: endTime } },
          { endedAt: null },
        ],
      },
      include: {
        orders: true,
      },
    });

    const allOrders = sessions.flatMap((s) => s.orders);

    // Calculate metrics
    const completedOrders = allOrders.filter(
      (o) => o.status === GhostOrderStatus.PICKED_UP || o.status === GhostOrderStatus.COMPLETED,
    );

    const cancelledOrders = allOrders.filter(
      (o) => o.status === GhostOrderStatus.CANCELLED || o.status === GhostOrderStatus.REJECTED,
    );

    const totalRevenue = allOrders.reduce(
      (sum, o) => sum + Number(o.totalAmount),
      0,
    );

    // Calculate average prep time
    const ordersWithPrepTime = completedOrders.filter(
      (o) => o.prepStartedAt && o.readyAt,
    );
    const avgPrepTimeSeconds =
      ordersWithPrepTime.length > 0
        ? ordersWithPrepTime.reduce((sum, o) => {
            return sum + (o.readyAt!.getTime() - o.prepStartedAt!.getTime()) / 1000;
          }, 0) / ordersWithPrepTime.length
        : 0;

    // Aggregate by platform
    const byPlatform: Record<string, { orders: number; revenue: number }> = {};
    for (const order of allOrders) {
      if (!byPlatform[order.platform]) {
        byPlatform[order.platform] = { orders: 0, revenue: 0 };
      }
      byPlatform[order.platform].orders += 1;
      byPlatform[order.platform].revenue += Number(order.totalAmount);
    }

    // Aggregate by hour
    const byHour: Record<string, number> = {};
    for (const order of allOrders) {
      const hour = order.receivedAt.getHours().toString().padStart(2, '0');
      byHour[hour] = (byHour[hour] || 0) + 1;
    }

    return {
      totalOrders: allOrders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      totalRevenue,
      averageOrderValue:
        allOrders.length > 0 ? totalRevenue / allOrders.length : 0,
      averagePrepTimeSeconds: Math.round(avgPrepTimeSeconds),
      byPlatform,
      byHour,
    };
  }

  // ==================== Auto-Accept Logic ====================

  /**
   * Evaluate whether to auto-accept an order
   */
  private async evaluateAutoAccept(
    order: KitchenHubOrderDto,
    restaurantId: string,
  ): Promise<AutoAcceptResult> {
    if (!this.autoAcceptEnabled) {
      return {
        shouldAutoAccept: false,
        reason: 'Auto-accept disabled',
      };
    }

    // Check restaurant settings
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    // Check platform-specific settings
    const platformSettings = this.configService.get<any>(
      `kitchenhub.platforms.${order.platform.toLowerCase()}`,
    );

    if (!platformSettings?.autoAccept) {
      return {
        shouldAutoAccept: false,
        reason: `Auto-accept disabled for ${order.platform}`,
      };
    }

    // Check order total
    if (order.total > this.autoAcceptMaxTotal) {
      return {
        shouldAutoAccept: false,
        reason: `Order total ${order.total} exceeds auto-accept max ${this.autoAcceptMaxTotal}`,
      };
    }

    // Check item count
    if (order.items.length > this.autoAcceptMaxItems) {
      return {
        shouldAutoAccept: false,
        reason: `Item count ${order.items.length} exceeds auto-accept max ${this.autoAcceptMaxItems}`,
      };
    }

    // Check capacity
    const utilization = await this.capacityService.getCapacityUtilization(restaurantId);
    if (utilization.status === 'WARNING' || utilization.status === 'CRITICAL') {
      return {
        shouldAutoAccept: false,
        reason: `Capacity at ${utilization.utilizationPercent}%`,
      };
    }

    // Calculate suggested prep time based on item count and complexity
    const basePrepTime = platformSettings.defaultPrepTimeMinutes || 20;
    const itemAdjustment = Math.ceil(order.items.length / 3) * 5; // +5 min per 3 items
    const suggestedPrepTime = Math.min(basePrepTime + itemAdjustment, 60);

    return {
      shouldAutoAccept: true,
      reason: 'Order meets auto-accept criteria',
      suggestedPrepTime,
    };
  }

  // ==================== Driver Updates ====================

  /**
   * Update driver information for an order
   */
  async updateDriverInfo(
    externalOrderId: string,
    platform: DeliveryPlatform,
    driverInfo: {
      name: string;
      phone?: string;
      vehicle?: string;
      licensePlate?: string;
      estimatedArrival?: string;
    },
  ): Promise<void> {
    const order = await this.prisma.ghostKitchenOrder.findFirst({
      where: {
        externalOrderId,
        platform,
      },
      include: {
        session: {
          select: { restaurantId: true },
        },
      },
    });

    if (!order) {
      this.logger.warn(`Driver update for unknown order: ${externalOrderId}`);
      return;
    }

    // Emit event for kitchen display
    this.eventEmitter.emit('order.driver-assigned', {
      orderId: order.id,
      externalOrderId,
      restaurantId: order.session.restaurantId,
      driver: driverInfo,
    });

    this.logger.log(`Driver assigned to order ${externalOrderId}: ${driverInfo.name}`);
  }

  /**
   * Handle driver arrival
   */
  async handleDriverArrival(
    externalOrderId: string,
    platform: DeliveryPlatform,
    arrivedAt: Date,
  ): Promise<void> {
    const order = await this.prisma.ghostKitchenOrder.findFirst({
      where: {
        externalOrderId,
        platform,
      },
      include: {
        session: {
          select: { restaurantId: true },
        },
      },
    });

    if (!order) {
      this.logger.warn(`Driver arrival for unknown order: ${externalOrderId}`);
      return;
    }

    // Emit event for kitchen notification
    this.eventEmitter.emit('order.driver-arrived', {
      orderId: order.id,
      externalOrderId,
      restaurantId: order.session.restaurantId,
      arrivedAt,
      orderStatus: order.status,
    });

    this.logger.log(`Driver arrived for order ${externalOrderId}`);
  }

  // ==================== Cache Management ====================

  /**
   * Invalidate active orders cache
   */
  private async invalidateActiveOrdersCache(restaurantId: string): Promise<void> {
    const cacheKey = `${OrderService.ACTIVE_ORDERS_CACHE_PREFIX}${restaurantId}`;
    await this.redis.del(cacheKey);
  }
}
