import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  UnauthorizedException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import * as crypto from 'crypto';
import { Public } from '@/common/decorators/public.decorator';
import { OrderService } from '../services/order.service';
import {
  OrderCreatedWebhookDto,
  OrderCancelledWebhookDto,
  DriverAssignedWebhookDto,
  DriverArrivedWebhookDto,
} from '../dto/kitchenhub.dto';
import { DeliveryPlatform } from '../config/kitchenhub.config';

/**
 * KitchenHub Webhook Controller
 *
 * Handles incoming webhook events from KitchenHub:
 * - New orders
 * - Order cancellations
 * - Driver assignments
 * - Driver arrivals
 *
 * All webhooks are verified using HMAC signatures.
 */
@ApiTags('webhooks')
@Controller('webhooks/kitchenhub')
export class KitchenHubWebhookController {
  private readonly logger = new Logger(KitchenHubWebhookController.name);
  private readonly webhookSecret: string | undefined;
  private readonly signatureHeader: string;
  private readonly timestampHeader: string;
  private readonly toleranceSeconds: number;

  // Track processed event IDs to prevent duplicates
  private processedEvents = new Map<string, number>();
  private readonly eventTtlMs = 300000; // 5 minutes

  constructor(
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>('kitchenhub.webhook.secret');
    this.signatureHeader = this.configService.get<string>(
      'kitchenhub.webhook.signatureHeader',
      'x-kitchenhub-signature',
    );
    this.timestampHeader = this.configService.get<string>(
      'kitchenhub.webhook.timestampHeader',
      'x-kitchenhub-timestamp',
    );
    this.toleranceSeconds = this.configService.get<number>(
      'kitchenhub.webhook.toleranceSeconds',
      300,
    );

    // Cleanup processed events periodically
    setInterval(() => this.cleanupProcessedEvents(), 60000);
  }

  // ==================== Order Created Webhook ====================

  /**
   * Handle new order webhook from KitchenHub
   */
  @Public()
  @Post('order-created')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive new order notification' })
  @ApiHeader({ name: 'x-kitchenhub-signature', description: 'HMAC signature' })
  @ApiHeader({ name: 'x-kitchenhub-timestamp', description: 'Request timestamp' })
  async handleOrderCreated(
    @Body() body: OrderCreatedWebhookDto,
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean; orderId?: string; message?: string }> {
    // Verify signature
    await this.verifyWebhookSignature(headers, req.rawBody);

    // Check for duplicate
    if (this.isDuplicateEvent(body.eventId)) {
      this.logger.debug(`Duplicate event ignored: ${body.eventId}`);
      return { received: true, message: 'Duplicate event' };
    }

    this.logger.log(
      `Order created webhook: ${body.order.externalOrderId} from ${body.order.platform}`,
    );

    try {
      const result = await this.orderService.processIncomingOrder(body.order);

      this.markEventProcessed(body.eventId);

      if (result.accepted) {
        return {
          received: true,
          orderId: result.orderId,
          message: 'Order accepted',
        };
      } else {
        return {
          received: true,
          message: result.reason || 'Order rejected',
        };
      }
    } catch (error) {
      this.logger.error(`Failed to process order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to process order');
    }
  }

  // ==================== Order Cancelled Webhook ====================

  /**
   * Handle order cancellation webhook
   */
  @Public()
  @Post('order-cancelled')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive order cancellation notification' })
  @ApiHeader({ name: 'x-kitchenhub-signature', description: 'HMAC signature' })
  @ApiHeader({ name: 'x-kitchenhub-timestamp', description: 'Request timestamp' })
  async handleOrderCancelled(
    @Body() body: OrderCancelledWebhookDto,
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    // Verify signature
    await this.verifyWebhookSignature(headers, req.rawBody);

    // Check for duplicate
    if (this.isDuplicateEvent(body.eventId)) {
      this.logger.debug(`Duplicate event ignored: ${body.eventId}`);
      return { received: true };
    }

    this.logger.log(
      `Order cancelled webhook: ${body.externalOrderId} - ${body.reason}`,
    );

    try {
      await this.orderService.handleExternalCancellation(
        body.externalOrderId,
        body.platform,
        body.reason,
        body.initiatedBy,
      );

      this.markEventProcessed(body.eventId);

      return { received: true };
    } catch (error) {
      this.logger.error(
        `Failed to process cancellation: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to process cancellation');
    }
  }

  // ==================== Driver Assigned Webhook ====================

  /**
   * Handle driver assigned webhook
   */
  @Public()
  @Post('driver-assigned')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive driver assignment notification' })
  @ApiHeader({ name: 'x-kitchenhub-signature', description: 'HMAC signature' })
  @ApiHeader({ name: 'x-kitchenhub-timestamp', description: 'Request timestamp' })
  async handleDriverAssigned(
    @Body() body: DriverAssignedWebhookDto,
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    // Verify signature
    await this.verifyWebhookSignature(headers, req.rawBody);

    // Check for duplicate
    if (this.isDuplicateEvent(body.eventId)) {
      this.logger.debug(`Duplicate event ignored: ${body.eventId}`);
      return { received: true };
    }

    this.logger.log(
      `Driver assigned webhook: ${body.externalOrderId} - ${body.driver.name}`,
    );

    try {
      await this.orderService.updateDriverInfo(
        body.externalOrderId,
        body.platform,
        {
          name: body.driver.name,
          phone: body.driver.phone,
          vehicle: body.driver.vehicle,
          licensePlate: body.driver.licensePlate,
          estimatedArrival: body.driver.estimatedArrival,
        },
      );

      this.markEventProcessed(body.eventId);

      return { received: true };
    } catch (error) {
      this.logger.error(
        `Failed to process driver assignment: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to process driver assignment');
    }
  }

  // ==================== Driver Arrived Webhook ====================

  /**
   * Handle driver arrived webhook
   */
  @Public()
  @Post('driver-arrived')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive driver arrival notification' })
  @ApiHeader({ name: 'x-kitchenhub-signature', description: 'HMAC signature' })
  @ApiHeader({ name: 'x-kitchenhub-timestamp', description: 'Request timestamp' })
  async handleDriverArrived(
    @Body() body: DriverArrivedWebhookDto,
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    // Verify signature
    await this.verifyWebhookSignature(headers, req.rawBody);

    // Check for duplicate
    if (this.isDuplicateEvent(body.eventId)) {
      this.logger.debug(`Duplicate event ignored: ${body.eventId}`);
      return { received: true };
    }

    this.logger.log(`Driver arrived webhook: ${body.externalOrderId}`);

    try {
      await this.orderService.handleDriverArrival(
        body.externalOrderId,
        body.platform,
        new Date(body.arrivedAt),
      );

      this.markEventProcessed(body.eventId);

      return { received: true };
    } catch (error) {
      this.logger.error(
        `Failed to process driver arrival: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to process driver arrival');
    }
  }

  // ==================== Signature Verification ====================

  /**
   * Verify webhook signature
   */
  private async verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: Buffer | undefined,
  ): Promise<void> {
    // Skip verification in development if secret not configured
    if (!this.webhookSecret) {
      this.logger.warn('Webhook signature verification skipped - no secret configured');
      return;
    }

    const signature = headers[this.signatureHeader];
    const timestamp = headers[this.timestampHeader];

    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!timestamp) {
      throw new UnauthorizedException('Missing webhook timestamp');
    }

    // Check timestamp to prevent replay attacks
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (isNaN(timestampNum)) {
      throw new UnauthorizedException('Invalid timestamp format');
    }

    if (Math.abs(now - timestampNum) > this.toleranceSeconds) {
      throw new UnauthorizedException('Webhook timestamp out of tolerance');
    }

    // Compute expected signature
    const payload = rawBody ? rawBody.toString() : '';
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = this.computeSignature(signedPayload);

    // Compare signatures (timing-safe)
    if (!this.secureCompare(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Compute HMAC signature
   */
  private computeSignature(payload: string): string {
    const hmac = crypto.createHmac('sha256', this.webhookSecret!);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Timing-safe string comparison
   */
  private secureCompare(a: string, b: string): boolean {
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }

  // ==================== Deduplication ====================

  /**
   * Check if event has already been processed
   */
  private isDuplicateEvent(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Mark event as processed
   */
  private markEventProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
  }

  /**
   * Cleanup old processed events
   */
  private cleanupProcessedEvents(): void {
    const cutoff = Date.now() - this.eventTtlMs;
    let cleaned = 0;

    for (const [eventId, timestamp] of this.processedEvents.entries()) {
      if (timestamp < cutoff) {
        this.processedEvents.delete(eventId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} processed event IDs`);
    }
  }
}
