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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TransferStatus } from '../entities/instant-pay-transfer.entity';

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
 * Payments WebSocket Gateway
 *
 * Real-time updates for earned wage access / instant pay:
 * - balance:update - Available balance changed
 * - transfer:status - Transfer status changed
 * - transfer:completed - Transfer completed successfully
 * - transfer:failed - Transfer failed
 * - earnings:synced - New earnings added
 */
@WebSocketGateway({
  namespace: '/payments',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class PaymentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PaymentsGateway.name);
  private readonly wsGuard: WsJwtGuard;

  // Track connected clients by worker ID
  private workerClients: Map<string, Set<string>> = new Map();
  // Track client to worker mapping
  private clientWorkers: Map<string, string> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.wsGuard = new WsJwtGuard(jwtService, configService);
  }

  afterInit(server: Server) {
    this.logger.log('Payments WebSocket Gateway initialized');
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
    const workerId = this.clientWorkers.get(client.id);

    if (workerId) {
      const clients = this.workerClients.get(workerId);
      if (clients) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.workerClients.delete(workerId);
        }
      }
      this.clientWorkers.delete(client.id);
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ==================== Client Subscriptions ====================

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workerId: string },
  ) {
    const { workerId } = data;

    if (!workerId) {
      client.emit('error', { message: 'workerId is required' });
      return;
    }

    // Verify user can subscribe to this worker's updates
    const user = (client as any).user;
    if (user.workerProfileId !== workerId && user.role !== 'ADMIN') {
      client.emit('error', { message: 'Not authorized to subscribe to this worker' });
      return;
    }

    // Join worker room
    client.join(`worker:${workerId}`);

    // Track subscription
    this.clientWorkers.set(client.id, workerId);
    if (!this.workerClients.has(workerId)) {
      this.workerClients.set(workerId, new Set());
    }
    this.workerClients.get(workerId)!.add(client.id);

    this.logger.log(
      `Client ${client.id} subscribed to worker ${workerId}`,
    );

    client.emit('subscribed', {
      workerId,
      message: 'Successfully subscribed to payment updates',
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workerId: string },
  ) {
    const { workerId } = data;

    // Leave worker room
    client.leave(`worker:${workerId}`);

    // Remove tracking
    const clients = this.workerClients.get(workerId);
    if (clients) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.workerClients.delete(workerId);
      }
    }
    this.clientWorkers.delete(client.id);

    this.logger.log(
      `Client ${client.id} unsubscribed from worker ${workerId}`,
    );

    client.emit('unsubscribed', {
      workerId,
      message: 'Successfully unsubscribed from payment updates',
    });
  }

  // ==================== Server-side Emitters ====================

  /**
   * Emit balance update event
   */
  emitBalanceUpdate(
    workerId: string,
    balance: {
      totalEarned: number;
      availableForTransfer: number;
      pendingTransfers: number;
      dailyLimitRemaining: number;
      weeklyLimitRemaining: number;
    },
  ) {
    this.server.to(`worker:${workerId}`).emit('balance:update', {
      type: 'balance:update',
      workerId,
      timestamp: new Date(),
      data: balance,
    });

    this.logger.debug(
      `Emitted balance:update for worker ${workerId}: $${balance.availableForTransfer} available`,
    );
  }

  /**
   * Emit transfer status change event
   */
  emitTransferStatus(
    workerId: string,
    transfer: {
      transferId: string;
      amount: number;
      fee: number;
      netAmount: number;
      previousStatus: TransferStatus;
      newStatus: TransferStatus;
      updatedAt: Date;
      failureReason?: string;
    },
  ) {
    this.server.to(`worker:${workerId}`).emit('transfer:status', {
      type: 'transfer:status',
      workerId,
      timestamp: new Date(),
      data: transfer,
    });

    this.logger.debug(
      `Emitted transfer:status for worker ${workerId}: ${transfer.transferId} -> ${transfer.newStatus}`,
    );
  }

  /**
   * Emit transfer completed event
   */
  emitTransferCompleted(
    workerId: string,
    transfer: {
      transferId: string;
      amount: number;
      fee: number;
      netAmount: number;
      completedAt: Date;
    },
  ) {
    this.server.to(`worker:${workerId}`).emit('transfer:completed', {
      type: 'transfer:completed',
      workerId,
      timestamp: new Date(),
      data: transfer,
    });

    this.logger.debug(
      `Emitted transfer:completed for worker ${workerId}: $${transfer.netAmount}`,
    );
  }

  /**
   * Emit transfer failed event
   */
  emitTransferFailed(
    workerId: string,
    transfer: {
      transferId: string;
      amount: number;
      failedAt: Date;
      reason: string;
    },
  ) {
    this.server.to(`worker:${workerId}`).emit('transfer:failed', {
      type: 'transfer:failed',
      workerId,
      timestamp: new Date(),
      data: transfer,
    });

    this.logger.debug(
      `Emitted transfer:failed for worker ${workerId}: ${transfer.reason}`,
    );
  }

  /**
   * Emit earnings synced event
   */
  emitEarningsSynced(
    workerId: string,
    data: {
      shiftsProcessed: number;
      totalEarnings: number;
      newAvailableBalance: number;
    },
  ) {
    this.server.to(`worker:${workerId}`).emit('earnings:synced', {
      type: 'earnings:synced',
      workerId,
      timestamp: new Date(),
      data,
    });

    this.logger.debug(
      `Emitted earnings:synced for worker ${workerId}: ${data.shiftsProcessed} shifts, $${data.totalEarnings}`,
    );
  }

  /**
   * Emit transfer requested event (for immediate feedback)
   */
  emitTransferRequested(
    workerId: string,
    transfer: {
      transferId: string;
      amount: number;
      fee: number;
      netAmount: number;
      requestedAt: Date;
    },
  ) {
    this.server.to(`worker:${workerId}`).emit('transfer:requested', {
      type: 'transfer:requested',
      workerId,
      timestamp: new Date(),
      data: transfer,
    });

    this.logger.debug(
      `Emitted transfer:requested for worker ${workerId}: $${transfer.amount}`,
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Get count of connected clients for a worker
   */
  getConnectedClientCount(workerId: string): number {
    return this.workerClients.get(workerId)?.size || 0;
  }

  /**
   * Check if any clients are connected for a worker
   */
  hasConnectedClients(workerId: string): boolean {
    return this.getConnectedClientCount(workerId) > 0;
  }
}
