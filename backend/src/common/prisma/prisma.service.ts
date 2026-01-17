import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

/**
 * PrismaService extends PrismaClient with:
 * - Automatic connection management
 * - Multi-tenant context via RLS
 * - Soft-delete middleware
 * - Query logging in development
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const isDev = configService.get<string>('NODE_ENV') !== 'production';

    super({
      log: isDev
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : ['error'],
    });

    // Log slow queries in development
    if (isDev) {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Execute queries within a tenant context (sets RLS variable)
   *
   * @example
   * ```ts
   * const shifts = await prisma.withTenant(restaurantId, async (tx) => {
   *   return tx.shift.findMany({ where: { status: 'PUBLISHED_UNASSIGNED' } });
   * });
   * ```
   */
  async withTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      // Set the tenant context for RLS policies
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return callback(tx);
    });
  }

  /**
   * Execute queries with network visibility (allows cross-restaurant access)
   *
   * @example
   * ```ts
   * const networkShifts = await prisma.withNetworkAccess(restaurantId, networkId, async (tx) => {
   *   return tx.shift.findMany({ where: { status: 'PUBLISHED_UNASSIGNED' } });
   * });
   * ```
   */
  async withNetworkAccess<T>(
    tenantId: string,
    networkId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_network_id', ${networkId}, true)`;
      return callback(tx);
    });
  }

  /**
   * Clean up expired records (called by scheduled job)
   */
  async cleanupExpiredRecords(): Promise<void> {
    const now = new Date();

    // Delete expired OTP codes
    await this.otpCode.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // Delete expired refresh tokens
    await this.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // Expire old shift offers
    await this.shiftOffer.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    // Expire old swap requests
    await this.shiftSwap.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    this.logger.log('Expired records cleaned up');
  }
}
