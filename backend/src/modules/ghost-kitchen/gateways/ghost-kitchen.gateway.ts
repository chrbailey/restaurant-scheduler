import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  SessionStats,
  GhostModeConfig,
  SessionEndReason,
} from '../entities/ghost-kitchen-session.entity';

/**
 * WebSocket authentication guard for gateway
 */
class WsJwtGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateToken(client: Socket): Promise<any> {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('auth.jwtSecret'),
      });
      return payload;
    } catch {
      return null;
    }
  }
}

/**
 * Ghost Kitchen WebSocket Gateway
 *
 * Real-time updates for ghost kitchen operations:
 * - order:new - New order received from platform
 * - order:status - Order status changed
 * - capacity:update - Capacity utilization changed
 * - session:stats - Live session statistics
 * - session:started - Ghost mode enabled
 * - session:paused - Ghost mode paused
 * - session:resumed - Ghost mode resumed
 * - session:ended - Ghost mode disabled
 */
@WebSocketGateway({
  namespace: '/ghost-kitchen',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class GhostKitchenGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GhostKitchenGateway.name);
  private readonly wsGuard: WsJwtGuard;

  // Track connected clients by restaurant
  private restaurantClients: Map<string, Set<string>> = new Map();
  // Track client restaurant subscriptions
  private clientRestaurants: Map<string, string> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.wsGuard = new WsJwtGuard(jwtService, configService);
  }

  afterInit(server: Server) {
    this.logger.log('Ghost Kitchen WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    const user = await this.wsGuard.validateToken(client);

    if (!user) {
      this.logger.warn(`Unauthorized WebSocket connection attempt: ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
      return;
    }

    // Store user info on socket
    (client as any).user = user;

    this.logger.log(
      `Client connected: ${client.id} (user: ${user.sub})`,
    );
  }

  handleDisconnect(client: Socket) {
    const restaurantId = this.clientRestaurants.get(client.id);

    if (restaurantId) {
      const clients = this.restaurantClients.get(restaurantId);
      if (clients) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.restaurantClients.delete(restaurantId);
        }
      }
      this.clientRestaurants.delete(client.id);
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ==================== Client Subscriptions ====================

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    const { restaurantId } = data;

    if (!restaurantId) {
      client.emit('error', { message: 'restaurantId is required' });
      return;
    }

    // Join restaurant room
    client.join(`restaurant:${restaurantId}`);

    // Track subscription
    this.clientRestaurants.set(client.id, restaurantId);
    if (!this.restaurantClients.has(restaurantId)) {
      this.restaurantClients.set(restaurantId, new Set());
    }
    this.restaurantClients.get(restaurantId)!.add(client.id);

    this.logger.log(
      `Client ${client.id} subscribed to restaurant ${restaurantId}`,
    );

    client.emit('subscribed', {
      restaurantId,
      message: 'Successfully subscribed to ghost kitchen updates',
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    const { restaurantId } = data;

    // Leave restaurant room
    client.leave(`restaurant:${restaurantId}`);

    // Remove tracking
    const clients = this.restaurantClients.get(restaurantId);
    if (clients) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.restaurantClients.delete(restaurantId);
      }
    }
    this.clientRestaurants.delete(client.id);

    this.logger.log(
      `Client ${client.id} unsubscribed from restaurant ${restaurantId}`,
    );

    client.emit('unsubscribed', {
      restaurantId,
      message: 'Successfully unsubscribed from ghost kitchen updates',
    });
  }

  // ==================== Server-side Emitters ====================

  /**
   * Emit new order received event
   */
  emitNewOrder(
    restaurantId: string,
    order: {
      orderId: string;
      externalOrderId: string;
      platform: string;
      totalAmount: number;
      itemCount: number;
      customerName?: string;
      receivedAt: Date;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('order:new', {
      type: 'order:new',
      restaurantId,
      timestamp: new Date(),
      data: order,
    });

    this.logger.debug(
      `Emitted order:new for restaurant ${restaurantId}: ${order.externalOrderId}`,
    );
  }

  /**
   * Emit order status change event
   */
  emitOrderStatus(
    restaurantId: string,
    order: {
      orderId: string;
      externalOrderId: string;
      platform: string;
      previousStatus: string;
      newStatus: string;
      updatedAt: Date;
      prepTime?: number;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('order:status', {
      type: 'order:status',
      restaurantId,
      timestamp: new Date(),
      data: order,
    });

    this.logger.debug(
      `Emitted order:status for restaurant ${restaurantId}: ${order.externalOrderId} -> ${order.newStatus}`,
    );
  }

  /**
   * Emit capacity update event
   */
  emitCapacityUpdate(
    restaurantId: string,
    capacity: {
      currentOrders: number;
      maxOrders: number;
      utilizationPercent: number;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('capacity:update', {
      type: 'capacity:update',
      restaurantId,
      timestamp: new Date(),
      data: capacity,
    });

    this.logger.debug(
      `Emitted capacity:update for restaurant ${restaurantId}: ${capacity.utilizationPercent}%`,
    );
  }

  /**
   * Emit session statistics update
   */
  emitSessionStats(
    restaurantId: string,
    data: {
      sessionId: string;
      stats: SessionStats;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('session:stats', {
      type: 'session:stats',
      restaurantId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted session:stats for restaurant ${restaurantId}: session ${data.sessionId}`,
    );
  }

  /**
   * Emit session started event
   */
  emitSessionStarted(
    restaurantId: string,
    data: {
      sessionId: string;
      startedAt: Date;
      config: GhostModeConfig;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('session:started', {
      type: 'session:started',
      restaurantId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted session:started for restaurant ${restaurantId}: session ${data.sessionId}`,
    );
  }

  /**
   * Emit session paused event
   */
  emitSessionPaused(
    restaurantId: string,
    data: {
      sessionId: string;
      pausedAt: Date;
      pauseEndTime?: Date | null;
      reason?: string;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('session:paused', {
      type: 'session:paused',
      restaurantId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted session:paused for restaurant ${restaurantId}: session ${data.sessionId}`,
    );
  }

  /**
   * Emit session resumed event
   */
  emitSessionResumed(
    restaurantId: string,
    data: {
      sessionId: string;
      resumedAt: Date;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('session:resumed', {
      type: 'session:resumed',
      restaurantId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted session:resumed for restaurant ${restaurantId}: session ${data.sessionId}`,
    );
  }

  /**
   * Emit session ended event
   */
  emitSessionEnded(
    restaurantId: string,
    data: {
      sessionId: string;
      endedAt: Date;
      reason: SessionEndReason;
      stats: {
        totalOrders: number;
        totalRevenue: number;
        avgPrepTime: number | null;
      };
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('session:ended', {
      type: 'session:ended',
      restaurantId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted session:ended for restaurant ${restaurantId}: session ${data.sessionId}`,
    );
  }

  /**
   * Emit driver update event
   */
  emitDriverUpdate(
    restaurantId: string,
    data: {
      orderId: string;
      externalOrderId: string;
      driverName?: string;
      driverPhone?: string;
      driverVehicle?: string;
      driverEta?: Date;
      driverArrivedAt?: Date;
      status: 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'DEPARTED';
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('driver:update', {
      type: 'driver:update',
      restaurantId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted driver:update for restaurant ${restaurantId}: order ${data.externalOrderId}`,
    );
  }

  /**
   * Emit alert event (for important notifications)
   */
  emitAlert(
    restaurantId: string,
    alert: {
      type: 'CAPACITY_WARNING' | 'CAPACITY_CRITICAL' | 'AUTO_DISABLE' | 'ERROR';
      title: string;
      message: string;
      severity: 'info' | 'warning' | 'error';
      metadata?: Record<string, any>;
    },
  ) {
    this.server.to(`restaurant:${restaurantId}`).emit('alert', {
      type: 'alert',
      restaurantId,
      timestamp: new Date(),
      data: alert,
    });

    this.logger.debug(
      `Emitted alert for restaurant ${restaurantId}: ${alert.type}`,
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Get count of connected clients for a restaurant
   */
  getConnectedClientCount(restaurantId: string): number {
    return this.restaurantClients.get(restaurantId)?.size || 0;
  }

  /**
   * Check if any clients are connected for a restaurant
   */
  hasConnectedClients(restaurantId: string): boolean {
    return this.getConnectedClientCount(restaurantId) > 0;
  }
}
