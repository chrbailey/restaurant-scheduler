import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/redis/redis.service';
import {
  KitchenHubOrderDto,
  KitchenHubMenuItemDto,
  DeliveryPartnerDto,
  OrderStatus,
  OrderHistoryQueryDto,
} from '../dto/kitchenhub.dto';
import { DeliveryPlatform } from '../config/kitchenhub.config';

/**
 * KitchenHub API Response wrapper
 */
interface KitchenHubResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Token response from authentication
 */
interface AuthTokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * KitchenHub API Client
 *
 * Provides methods to interact with the KitchenHub order aggregator API.
 * Handles authentication, order management, menu sync, and platform status.
 */
@Injectable()
export class KitchenHubClient {
  private readonly logger = new Logger(KitchenHubClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly timeout: number;

  private static readonly TOKEN_CACHE_KEY = 'kitchenhub:auth:token';
  private static readonly TOKEN_REFRESH_BUFFER_SECONDS = 300; // Refresh 5 min before expiry

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.baseUrl = this.configService.get<string>('kitchenhub.api.baseUrl', 'https://api.trykitchenhub.com/v1');
    this.apiKey = this.configService.get<string>('kitchenhub.api.apiKey');
    this.apiSecret = this.configService.get<string>('kitchenhub.api.apiSecret');
    this.timeout = this.configService.get<number>('kitchenhub.api.timeout', 30000);
  }

  // ==================== Authentication ====================

  /**
   * Authenticate with KitchenHub API and get/refresh access token
   */
  async authenticate(): Promise<string> {
    // Check for cached token
    const cachedToken = await this.redis.get(KitchenHubClient.TOKEN_CACHE_KEY);
    if (cachedToken) {
      return cachedToken;
    }

    if (!this.apiKey || !this.apiSecret) {
      throw new HttpException(
        'KitchenHub API credentials not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const response = await this.makeRequest<AuthTokenResponse>(
        'POST',
        '/auth/token',
        {
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
        },
        false, // Don't require auth for auth endpoint
      );

      if (!response.data) {
        throw new Error('No token received from authentication');
      }

      // Cache the token with buffer for refresh
      const ttl = response.data.expiresIn - KitchenHubClient.TOKEN_REFRESH_BUFFER_SECONDS;
      await this.redis.set(KitchenHubClient.TOKEN_CACHE_KEY, response.data.accessToken, ttl);

      this.logger.log('Successfully authenticated with KitchenHub API');
      return response.data.accessToken;
    } catch (error) {
      this.logger.error(`KitchenHub authentication failed: ${error.message}`);
      throw new HttpException(
        'Failed to authenticate with KitchenHub',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ==================== Order Acceptance ====================

  /**
   * Set whether restaurant is accepting orders
   */
  async setAcceptingOrders(
    restaurantId: string,
    accepting: boolean,
    platforms?: DeliveryPlatform[],
  ): Promise<void> {
    await this.makeAuthenticatedRequest(
      'PUT',
      `/restaurants/${restaurantId}/availability`,
      {
        acceptingOrders: accepting,
        platforms: platforms || Object.values(DeliveryPlatform),
      },
    );

    this.logger.log(
      `Set accepting_orders=${accepting} for restaurant ${restaurantId}`,
    );
  }

  // ==================== Active Orders ====================

  /**
   * Fetch current active orders for a restaurant
   */
  async getActiveOrders(restaurantId: string): Promise<KitchenHubOrderDto[]> {
    // Check cache first
    const cacheKey = `kitchenhub:orders:active:${restaurantId}`;
    const cached = await this.redis.getJson<KitchenHubOrderDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.makeAuthenticatedRequest<KitchenHubOrderDto[]>(
      'GET',
      `/restaurants/${restaurantId}/orders/active`,
    );

    const orders = response.data || [];

    // Cache for short duration
    const ttl = this.configService.get<number>('kitchenhub.cache.ordersTtlSeconds', 60);
    await this.redis.setJson(cacheKey, orders, ttl);

    return orders;
  }

  // ==================== Order Status ====================

  /**
   * Update order status on KitchenHub/delivery platform
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    prepTimeMinutes?: number,
  ): Promise<void> {
    const payload: Record<string, any> = {
      status: this.mapStatusToApi(status),
    };

    if (prepTimeMinutes !== undefined) {
      payload.estimatedPrepTimeMinutes = prepTimeMinutes;
    }

    await this.makeAuthenticatedRequest(
      'PUT',
      `/orders/${orderId}/status`,
      payload,
    );

    this.logger.log(`Updated order ${orderId} status to ${status}`);
  }

  /**
   * Accept an order
   */
  async acceptOrder(orderId: string, prepTimeMinutes: number): Promise<void> {
    await this.makeAuthenticatedRequest(
      'POST',
      `/orders/${orderId}/accept`,
      { estimatedPrepTimeMinutes: prepTimeMinutes },
    );
    this.logger.log(`Accepted order ${orderId} with prep time ${prepTimeMinutes} min`);
  }

  /**
   * Reject an order
   */
  async rejectOrder(orderId: string, reasonCode: string, details?: string): Promise<void> {
    await this.makeAuthenticatedRequest(
      'POST',
      `/orders/${orderId}/reject`,
      {
        reasonCode,
        details,
      },
    );
    this.logger.log(`Rejected order ${orderId}: ${reasonCode}`);
  }

  // ==================== Menu Management ====================

  /**
   * Fetch synced menu items for a restaurant
   */
  async getMenuItems(restaurantId: string): Promise<KitchenHubMenuItemDto[]> {
    // Check cache first
    const cacheKey = `kitchenhub:menu:${restaurantId}`;
    const cached = await this.redis.getJson<KitchenHubMenuItemDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.makeAuthenticatedRequest<KitchenHubMenuItemDto[]>(
      'GET',
      `/restaurants/${restaurantId}/menu`,
    );

    const items = response.data || [];

    // Cache menu items
    const ttl = this.configService.get<number>('kitchenhub.cache.menuTtlSeconds', 300);
    await this.redis.setJson(cacheKey, items, ttl);

    return items;
  }

  /**
   * Update menu item availability (86 items)
   */
  async updateMenuAvailability(
    restaurantId: string,
    itemId: string,
    available: boolean,
    platforms?: DeliveryPlatform[],
    durationMinutes?: number,
  ): Promise<void> {
    await this.makeAuthenticatedRequest(
      'PUT',
      `/restaurants/${restaurantId}/menu/${itemId}/availability`,
      {
        available,
        platforms: platforms || Object.values(DeliveryPlatform),
        durationMinutes,
      },
    );

    // Invalidate menu cache
    await this.redis.del(`kitchenhub:menu:${restaurantId}`);

    this.logger.log(
      `Updated menu item ${itemId} availability=${available} for restaurant ${restaurantId}`,
    );
  }

  /**
   * Bulk update menu availability
   */
  async bulkUpdateMenuAvailability(
    restaurantId: string,
    items: Array<{ itemId: string; available: boolean }>,
  ): Promise<void> {
    await this.makeAuthenticatedRequest(
      'PUT',
      `/restaurants/${restaurantId}/menu/bulk-availability`,
      { items },
    );

    // Invalidate menu cache
    await this.redis.del(`kitchenhub:menu:${restaurantId}`);

    this.logger.log(`Bulk updated ${items.length} menu items for restaurant ${restaurantId}`);
  }

  // ==================== Delivery Partners ====================

  /**
   * Get connected delivery platforms for a restaurant
   */
  async getDeliveryPartners(restaurantId: string): Promise<DeliveryPartnerDto[]> {
    const response = await this.makeAuthenticatedRequest<DeliveryPartnerDto[]>(
      'GET',
      `/restaurants/${restaurantId}/partners`,
    );

    return response.data || [];
  }

  /**
   * Connect a new delivery platform
   */
  async connectPlatform(
    restaurantId: string,
    platform: DeliveryPlatform,
    credentials: Record<string, string>,
  ): Promise<void> {
    await this.makeAuthenticatedRequest(
      'POST',
      `/restaurants/${restaurantId}/partners/${platform}/connect`,
      credentials,
    );

    this.logger.log(`Connected ${platform} for restaurant ${restaurantId}`);
  }

  /**
   * Disconnect a delivery platform
   */
  async disconnectPlatform(
    restaurantId: string,
    platform: DeliveryPlatform,
  ): Promise<void> {
    await this.makeAuthenticatedRequest(
      'DELETE',
      `/restaurants/${restaurantId}/partners/${platform}`,
    );

    this.logger.log(`Disconnected ${platform} for restaurant ${restaurantId}`);
  }

  // ==================== Order History ====================

  /**
   * Get historical orders for analytics
   */
  async getOrderHistory(
    restaurantId: string,
    query: OrderHistoryQueryDto,
  ): Promise<{
    orders: KitchenHubOrderDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const params = new URLSearchParams({
      startDate: query.startDate,
      endDate: query.endDate,
      page: String(query.page || 1),
      limit: String(query.limit || 50),
    });

    if (query.platform) {
      params.append('platform', query.platform);
    }
    if (query.status) {
      params.append('status', query.status);
    }

    const response = await this.makeAuthenticatedRequest<{
      orders: KitchenHubOrderDto[];
      total: number;
      page: number;
      limit: number;
    }>('GET', `/restaurants/${restaurantId}/orders/history?${params.toString()}`);

    return response.data || { orders: [], total: 0, page: 1, limit: 50 };
  }

  // ==================== Private Helpers ====================

  /**
   * Make an authenticated request
   */
  private async makeAuthenticatedRequest<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<KitchenHubResponse<T>> {
    const token = await this.authenticate();
    return this.makeRequest<T>(method, path, body, true, token);
  }

  /**
   * Make an HTTP request to KitchenHub API
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    body?: any,
    requireAuth: boolean = true,
    token?: string,
  ): Promise<KitchenHubResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (requireAuth && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(
          `KitchenHub API error: ${response.status} - ${JSON.stringify(data)}`,
        );

        throw new HttpException(
          data.error?.message || 'KitchenHub API error',
          response.status,
        );
      }

      return {
        success: true,
        data: data.data || data,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new HttpException(
          'KitchenHub API request timeout',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`KitchenHub API request failed: ${error.message}`);
      throw new HttpException(
        'Failed to communicate with KitchenHub',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Map internal status to KitchenHub API status
   */
  private mapStatusToApi(status: OrderStatus): string {
    const statusMap: Record<OrderStatus, string> = {
      [OrderStatus.RECEIVED]: 'received',
      [OrderStatus.ACCEPTED]: 'confirmed',
      [OrderStatus.PREPARING]: 'preparing',
      [OrderStatus.READY]: 'ready_for_pickup',
      [OrderStatus.PICKED_UP]: 'picked_up',
      [OrderStatus.COMPLETED]: 'completed',
      [OrderStatus.CANCELLED]: 'cancelled',
      [OrderStatus.REJECTED]: 'rejected',
    };

    return statusMap[status] || 'unknown';
  }

  /**
   * Clear authentication token (for testing or forced re-auth)
   */
  async clearAuthToken(): Promise<void> {
    await this.redis.del(KitchenHubClient.TOKEN_CACHE_KEY);
    this.logger.log('Cleared KitchenHub auth token');
  }

  /**
   * Health check for KitchenHub connection
   */
  async healthCheck(): Promise<{ connected: boolean; latencyMs: number }> {
    const start = Date.now();

    try {
      await this.authenticate();
      return {
        connected: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
      };
    }
  }
}
