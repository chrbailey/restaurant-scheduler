import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Aggregator Client Service
 *
 * Interface to KitchenHub or similar order aggregator.
 * Handles communication with delivery platforms (DoorDash, UberEats, Grubhub).
 */
@Injectable()
export class AggregatorClientService {
  private readonly logger = new Logger(AggregatorClientService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('KITCHENHUB_API_KEY');
    this.baseUrl = this.configService.get<string>(
      'KITCHENHUB_BASE_URL',
      'https://api.trykitchenhub.com/v1',
    );
  }

  /**
   * Set whether restaurant is accepting orders
   */
  async setAcceptingOrders(
    restaurantId: string,
    accepting: boolean,
    platforms: string[],
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('KitchenHub API key not configured, skipping aggregator update');
      return;
    }

    try {
      // TODO: Implement actual API call
      this.logger.log(
        `[Mock] Setting accepting_orders=${accepting} for ${restaurantId} on ${platforms.join(', ')}`,
      );

      // Example API call:
      // await fetch(`${this.baseUrl}/restaurants/${restaurantId}/availability`, {
      //   method: 'PUT',
      //   headers: {
      //     'Authorization': `Bearer ${this.apiKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     accepting_orders: accepting,
      //     platforms,
      //   }),
      // });
    } catch (error) {
      this.logger.error(`Failed to update aggregator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update order status on aggregator
   */
  async updateOrderStatus(
    externalOrderId: string,
    platform: string,
    status: string,
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('KitchenHub API key not configured, skipping status update');
      return;
    }

    try {
      // Map internal status to aggregator status
      const aggregatorStatus = this.mapStatus(status);

      this.logger.log(
        `[Mock] Updating order ${externalOrderId} on ${platform} to ${aggregatorStatus}`,
      );

      // Example API call:
      // await fetch(`${this.baseUrl}/orders/${externalOrderId}/status`, {
      //   method: 'PUT',
      //   headers: {
      //     'Authorization': `Bearer ${this.apiKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     status: aggregatorStatus,
      //     platform,
      //   }),
      // });
    } catch (error) {
      this.logger.error(`Failed to update order status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Estimate prep time for aggregator
   */
  async updateEstimatedPrepTime(
    externalOrderId: string,
    minutes: number,
  ): Promise<void> {
    if (!this.apiKey) {
      return;
    }

    this.logger.log(
      `[Mock] Setting estimated prep time for ${externalOrderId}: ${minutes} min`,
    );
  }

  private mapStatus(internalStatus: string): string {
    const statusMap: Record<string, string> = {
      RECEIVED: 'confirmed',
      PREPARING: 'preparing',
      READY: 'ready_for_pickup',
      PICKED_UP: 'picked_up',
      CANCELLED: 'cancelled',
    };

    return statusMap[internalStatus] || 'unknown';
  }
}
