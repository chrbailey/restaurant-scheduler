import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis Service for caching, pub/sub, and session management
 *
 * Used for:
 * - OTP rate limiting and storage
 * - Session caching
 * - Real-time shift updates via pub/sub
 * - Notification deduplication
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis;
  private prefix: string;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('database.redis.url', 'redis://localhost:6379');
    this.prefix = this.configService.get<string>('database.redis.prefix', 'rs:');

    this.client = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async onModuleInit() {
    this.client.on('connect', () => this.logger.log('Redis client connected'));
    this.client.on('error', (err) => this.logger.error('Redis client error', err));

    this.subscriber.on('connect', () => this.logger.log('Redis subscriber connected'));
    this.subscriber.on('error', (err) => this.logger.error('Redis subscriber error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
    this.logger.log('Redis connections closed');
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  // ==================== Basic Operations ====================

  async get(key: string): Promise<string | null> {
    return this.client.get(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(this.key(key), ttlSeconds, value);
    } else {
      await this.client.set(this.key(key), value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.key(key));
    return result === 1;
  }

  // ==================== JSON Operations ====================

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // ==================== Rate Limiting ====================

  /**
   * Check and increment rate limit counter
   *
   * @returns true if within limit, false if exceeded
   */
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const fullKey = this.key(`ratelimit:${key}`);

    const multi = this.client.multi();
    multi.incr(fullKey);
    multi.expire(fullKey, windowSeconds);

    const results = await multi.exec();
    const count = results?.[0]?.[1] as number;

    return count <= limit;
  }

  /**
   * Get remaining rate limit
   */
  async getRateLimitRemaining(key: string, limit: number): Promise<number> {
    const fullKey = this.key(`ratelimit:${key}`);
    const count = await this.client.get(fullKey);
    return Math.max(0, limit - (parseInt(count || '0', 10)));
  }

  // ==================== OTP Management ====================

  async storeOtp(phone: string, code: string, ttlSeconds: number): Promise<void> {
    await this.setJson(`otp:${phone}`, { code, attempts: 0 }, ttlSeconds);
  }

  async getOtp(phone: string): Promise<{ code: string; attempts: number } | null> {
    return this.getJson(`otp:${phone}`);
  }

  async incrementOtpAttempts(phone: string): Promise<number> {
    const data = await this.getOtp(phone);
    if (!data) return 0;

    data.attempts += 1;
    const ttl = await this.client.ttl(this.key(`otp:${phone}`));
    await this.setJson(`otp:${phone}`, data, ttl > 0 ? ttl : 300);

    return data.attempts;
  }

  async deleteOtp(phone: string): Promise<void> {
    await this.del(`otp:${phone}`);
  }

  // ==================== Session Management ====================

  async cacheUserSession(userId: string, sessionData: object, ttlSeconds = 3600): Promise<void> {
    await this.setJson(`session:${userId}`, sessionData, ttlSeconds);
  }

  async getUserSession<T>(userId: string): Promise<T | null> {
    return this.getJson(`session:${userId}`);
  }

  async invalidateUserSession(userId: string): Promise<void> {
    await this.del(`session:${userId}`);
  }

  // ==================== Pub/Sub ====================

  async publish(channel: string, message: object): Promise<void> {
    await this.client.publish(this.key(channel), JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (message: object) => void): Promise<void> {
    const fullChannel = this.key(channel);

    this.subscriber.subscribe(fullChannel);
    this.subscriber.on('message', (ch, msg) => {
      if (ch === fullChannel) {
        callback(JSON.parse(msg));
      }
    });
  }

  // ==================== Shift Pool Caching ====================

  /**
   * Cache available shifts for quick lookup
   */
  async cacheAvailableShifts(restaurantId: string, shifts: object[]): Promise<void> {
    await this.setJson(`shifts:available:${restaurantId}`, shifts, 60); // 1 min cache
  }

  async getCachedAvailableShifts(restaurantId: string): Promise<object[] | null> {
    return this.getJson(`shifts:available:${restaurantId}`);
  }

  async invalidateShiftCache(restaurantId: string): Promise<void> {
    await this.del(`shifts:available:${restaurantId}`);
  }

  // ==================== Notification Deduplication ====================

  /**
   * Check if notification was recently sent (prevent duplicates)
   */
  async wasNotificationSent(userId: string, notificationType: string, entityId: string): Promise<boolean> {
    const key = `notif:sent:${userId}:${notificationType}:${entityId}`;
    return this.exists(key);
  }

  /**
   * Mark notification as sent
   */
  async markNotificationSent(userId: string, notificationType: string, entityId: string, ttlSeconds = 300): Promise<void> {
    const key = `notif:sent:${userId}:${notificationType}:${entityId}`;
    await this.set(key, '1', ttlSeconds);
  }
}
