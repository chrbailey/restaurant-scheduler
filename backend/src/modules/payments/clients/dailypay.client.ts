import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/redis/redis.service';
import { TransferStatus } from '../config/dailypay.config';

/**
 * DailyPay API Response wrapper
 */
interface DailyPayResponse<T> {
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
 * Employee enrollment data
 */
interface EmployeeEnrollmentData {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  ssn?: string;
  bankAccount?: {
    routingNumber: string;
    accountNumber: string;
    accountType: 'checking' | 'savings';
  };
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

/**
 * Enrolled employee response
 */
interface EnrolledEmployee {
  dailypayEmployeeId: string;
  employeeId: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'UNENROLLED';
  enrolledAt: string;
  bankAccountVerified: boolean;
}

/**
 * Earned balance response
 */
interface EarnedBalanceResponse {
  totalEarned: number;
  availableForTransfer: number;
  pendingTransfers: number;
  lastUpdated: string;
}

/**
 * Transfer request data
 */
interface TransferRequestData {
  amount: number;
  method?: 'INSTANT' | 'NEXT_DAY';
  idempotencyKey?: string;
}

/**
 * Transfer response
 */
interface TransferResponse {
  transferId: string;
  externalTransferId: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: TransferStatus;
  requestedAt: string;
  estimatedArrival?: string;
}

/**
 * Transfer history item
 */
interface TransferHistoryItem {
  transferId: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: TransferStatus;
  requestedAt: string;
  processedAt?: string;
  failureReason?: string;
}

/**
 * Shift earnings data for sync
 */
interface ShiftEarningsData {
  shiftId: string;
  hoursWorked: number;
  hourlyRate: number;
  grossEarnings: number;
  earnedAt: string;
}

/**
 * DailyPay API Client
 *
 * Provides methods to interact with the DailyPay earned wage access API.
 * Handles authentication, employee enrollment, balance queries, and transfers.
 */
@Injectable()
export class DailyPayClient {
  private readonly logger = new Logger(DailyPayClient.name);
  private readonly baseUrl: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly timeout: number;

  private static readonly TOKEN_CACHE_KEY = 'dailypay:auth:token';
  private static readonly TOKEN_REFRESH_BUFFER_SECONDS = 300; // Refresh 5 min before expiry

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.baseUrl = this.configService.get<string>('dailypay.api.baseUrl', 'https://api.dailypay.com/v2');
    this.clientId = this.configService.get<string>('dailypay.api.clientId');
    this.clientSecret = this.configService.get<string>('dailypay.api.clientSecret');
    this.timeout = this.configService.get<number>('dailypay.api.timeout', 30000);
  }

  // ==================== Authentication ====================

  /**
   * Authenticate with DailyPay API and get/refresh access token
   */
  async authenticate(): Promise<string> {
    // Check for cached token
    const cachedToken = await this.redis.get(DailyPayClient.TOKEN_CACHE_KEY);
    if (cachedToken) {
      return cachedToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new HttpException(
        'DailyPay API credentials not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const response = await this.makeRequest<AuthTokenResponse>(
        'POST',
        '/auth/token',
        {
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          grantType: 'client_credentials',
        },
        false, // Don't require auth for auth endpoint
      );

      if (!response.data) {
        throw new Error('No token received from authentication');
      }

      // Cache the token with buffer for refresh
      const ttl = response.data.expiresIn - DailyPayClient.TOKEN_REFRESH_BUFFER_SECONDS;
      await this.redis.set(DailyPayClient.TOKEN_CACHE_KEY, response.data.accessToken, ttl);

      this.logger.log('Successfully authenticated with DailyPay API');
      return response.data.accessToken;
    } catch (error) {
      this.logger.error(`DailyPay authentication failed: ${error.message}`);
      throw new HttpException(
        'Failed to authenticate with DailyPay',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ==================== Employee Enrollment ====================

  /**
   * Enroll an employee for instant pay access
   */
  async enrollEmployee(
    workerId: string,
    employeeData: EmployeeEnrollmentData,
  ): Promise<EnrolledEmployee> {
    const response = await this.makeAuthenticatedRequest<EnrolledEmployee>(
      'POST',
      '/employees',
      {
        externalEmployeeId: workerId,
        ...employeeData,
      },
    );

    if (!response.data) {
      throw new HttpException(
        'Failed to enroll employee',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`Enrolled employee ${workerId} with DailyPay`);
    return response.data;
  }

  /**
   * Get enrolled employee details
   */
  async getEmployee(workerId: string): Promise<EnrolledEmployee | null> {
    try {
      const response = await this.makeAuthenticatedRequest<EnrolledEmployee>(
        'GET',
        `/employees/${workerId}`,
      );
      return response.data || null;
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Unenroll an employee from the program
   */
  async unenrollEmployee(workerId: string): Promise<void> {
    await this.makeAuthenticatedRequest(
      'DELETE',
      `/employees/${workerId}`,
    );

    // Clear any cached balance
    await this.redis.del(`dailypay:balance:${workerId}`);

    this.logger.log(`Unenrolled employee ${workerId} from DailyPay`);
  }

  // ==================== Balance & Earnings ====================

  /**
   * Get current earned balance for a worker
   */
  async getEarnedBalance(workerId: string): Promise<EarnedBalanceResponse> {
    // Check cache first
    const cacheKey = `dailypay:balance:${workerId}`;
    const cached = await this.redis.getJson<EarnedBalanceResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.makeAuthenticatedRequest<EarnedBalanceResponse>(
      'GET',
      `/employees/${workerId}/balance`,
    );

    if (!response.data) {
      throw new HttpException(
        'Failed to get earned balance',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Cache the balance
    const ttl = this.configService.get<number>('dailypay.cache.balanceTtlSeconds', 60);
    await this.redis.setJson(cacheKey, response.data, ttl);

    return response.data;
  }

  /**
   * Sync earnings from completed shifts
   */
  async syncEarnings(workerId: string, shifts: ShiftEarningsData[]): Promise<void> {
    if (shifts.length === 0) {
      return;
    }

    await this.makeAuthenticatedRequest(
      'POST',
      `/employees/${workerId}/earnings`,
      {
        earnings: shifts.map((shift) => ({
          externalShiftId: shift.shiftId,
          hoursWorked: shift.hoursWorked,
          hourlyRate: shift.hourlyRate,
          grossAmount: shift.grossEarnings,
          earnedDate: shift.earnedAt,
        })),
      },
    );

    // Invalidate balance cache
    await this.redis.del(`dailypay:balance:${workerId}`);

    this.logger.log(`Synced ${shifts.length} shifts for employee ${workerId}`);
  }

  // ==================== Transfers ====================

  /**
   * Request an instant pay transfer
   */
  async requestTransfer(
    workerId: string,
    data: TransferRequestData,
  ): Promise<TransferResponse> {
    const response = await this.makeAuthenticatedRequest<TransferResponse>(
      'POST',
      `/employees/${workerId}/transfers`,
      {
        amount: data.amount,
        method: data.method || 'INSTANT',
        idempotencyKey: data.idempotencyKey,
      },
    );

    if (!response.data) {
      throw new HttpException(
        'Failed to request transfer',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Invalidate balance cache
    await this.redis.del(`dailypay:balance:${workerId}`);

    this.logger.log(
      `Transfer requested for employee ${workerId}: $${data.amount}`,
    );

    return response.data;
  }

  /**
   * Get transfer status
   */
  async getTransferStatus(transferId: string): Promise<TransferResponse> {
    const response = await this.makeAuthenticatedRequest<TransferResponse>(
      'GET',
      `/transfers/${transferId}`,
    );

    if (!response.data) {
      throw new HttpException(
        'Transfer not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return response.data;
  }

  /**
   * Get transfer history for a worker
   */
  async getTransferHistory(
    workerId: string,
    dateRange: { startDate: string; endDate: string },
    options?: { page?: number; limit?: number },
  ): Promise<{
    transfers: TransferHistoryItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const params = new URLSearchParams({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      page: String(options?.page || 1),
      limit: String(options?.limit || 50),
    });

    const response = await this.makeAuthenticatedRequest<{
      transfers: TransferHistoryItem[];
      total: number;
      page: number;
      limit: number;
    }>('GET', `/employees/${workerId}/transfers?${params.toString()}`);

    return response.data || { transfers: [], total: 0, page: 1, limit: 50 };
  }

  /**
   * Cancel a pending transfer
   */
  async cancelTransfer(transferId: string): Promise<void> {
    await this.makeAuthenticatedRequest(
      'POST',
      `/transfers/${transferId}/cancel`,
    );

    this.logger.log(`Cancelled transfer ${transferId}`);
  }

  // ==================== Private Helpers ====================

  /**
   * Make an authenticated request
   */
  private async makeAuthenticatedRequest<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<DailyPayResponse<T>> {
    const token = await this.authenticate();
    return this.makeRequest<T>(method, path, body, true, token);
  }

  /**
   * Make an HTTP request to DailyPay API
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    body?: any,
    requireAuth: boolean = true,
    token?: string,
  ): Promise<DailyPayResponse<T>> {
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
          `DailyPay API error: ${response.status} - ${JSON.stringify(data)}`,
        );

        throw new HttpException(
          data.error?.message || 'DailyPay API error',
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
          'DailyPay API request timeout',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`DailyPay API request failed: ${error.message}`);
      throw new HttpException(
        'Failed to communicate with DailyPay',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Clear authentication token (for testing or forced re-auth)
   */
  async clearAuthToken(): Promise<void> {
    await this.redis.del(DailyPayClient.TOKEN_CACHE_KEY);
    this.logger.log('Cleared DailyPay auth token');
  }

  /**
   * Health check for DailyPay connection
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
