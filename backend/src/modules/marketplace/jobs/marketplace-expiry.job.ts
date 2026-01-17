import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationService } from '@/modules/notification/services/notification.service';
import { TradeOfferStatus } from '../entities/trade-offer.entity';
import { TradeMatchStatus } from '../entities/trade-match.entity';
import { TradeNegotiationStatus } from '../entities/trade-negotiation.entity';
import { NotificationType } from '@restaurant-scheduler/shared';

/**
 * Marketplace Expiry Job
 *
 * BullMQ job for marketplace maintenance:
 * - Expires old offers (configurable TTL)
 * - Expires stale negotiations
 * - Expires pending trade proposals
 * - Sends reminder notifications before expiry
 *
 * Runs every 15 minutes.
 */

const QUEUE_NAME = 'marketplace-expiry';

export interface MarketplaceExpiryJobData {
  /** Optional: process only specific restaurant */
  restaurantId?: string;
  /** Send reminders for offers expiring soon */
  sendReminders?: boolean;
  /** Hours before expiry to send reminder */
  reminderHoursBefore?: number;
}

export interface MarketplaceExpiryJobResult {
  /** Number of offers expired */
  offersExpired: number;
  /** Number of matches expired */
  matchesExpired: number;
  /** Number of negotiations expired */
  negotiationsExpired: number;
  /** Number of reminders sent */
  remindersSent: number;
  /** Any errors encountered */
  errors: string[];
}

@Injectable()
export class MarketplaceExpiryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceExpiryJob.name);
  private queue: Queue<MarketplaceExpiryJobData, MarketplaceExpiryJobResult>;
  private worker: Worker<MarketplaceExpiryJobData, MarketplaceExpiryJobResult>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('database.redis.url', 'redis://localhost:6379');
    const connection = this.parseRedisUrl(redisUrl);

    // Initialize queue
    this.queue = new Queue<MarketplaceExpiryJobData, MarketplaceExpiryJobResult>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
          age: 24 * 3600,
        },
        removeOnFail: {
          count: 50,
          age: 7 * 24 * 3600,
        },
      },
    });

    // Initialize worker
    this.worker = new Worker<MarketplaceExpiryJobData, MarketplaceExpiryJobResult>(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection,
        concurrency: 1,
      },
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      this.logger.log(
        `Marketplace expiry job ${job.id} completed: ` +
        `${job.returnvalue?.offersExpired} offers, ` +
        `${job.returnvalue?.matchesExpired} matches, ` +
        `${job.returnvalue?.negotiationsExpired} negotiations expired, ` +
        `${job.returnvalue?.remindersSent} reminders sent`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Marketplace expiry job ${job?.id} failed: ${error.message}`);
    });

    // Schedule recurring job
    await this.scheduleRecurringJob();

    this.logger.log('Marketplace expiry job initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.logger.log('Marketplace expiry job shutdown');
  }

  /**
   * Schedule the recurring expiry check job
   */
  private async scheduleRecurringJob() {
    // Remove any existing repeatable jobs
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Add job that runs every 15 minutes
    await this.queue.add(
      'recurring-expiry',
      {
        sendReminders: true,
        reminderHoursBefore: 2,
      },
      {
        repeat: {
          pattern: '*/15 * * * *', // Every 15 minutes
        },
        jobId: 'recurring-expiry',
      },
    );

    this.logger.log('Scheduled marketplace expiry job to run every 15 minutes');
  }

  /**
   * Process the expiry job
   */
  private async processJob(
    job: Job<MarketplaceExpiryJobData, MarketplaceExpiryJobResult>,
  ): Promise<MarketplaceExpiryJobResult> {
    this.logger.log(`Processing marketplace expiry job ${job.id}`);

    const { restaurantId, sendReminders = true, reminderHoursBefore = 2 } = job.data;
    const result: MarketplaceExpiryJobResult = {
      offersExpired: 0,
      matchesExpired: 0,
      negotiationsExpired: 0,
      remindersSent: 0,
      errors: [],
    };

    const now = new Date();

    try {
      // 1. Expire old trade offers
      const expiredOffers = await this.expireOffers(now, restaurantId);
      result.offersExpired = expiredOffers.count;
      result.errors.push(...expiredOffers.errors);

      await job.updateProgress(25);

      // 2. Expire old trade matches
      const expiredMatches = await this.expireMatches(now);
      result.matchesExpired = expiredMatches.count;
      result.errors.push(...expiredMatches.errors);

      await job.updateProgress(50);

      // 3. Expire stale negotiations
      const expiredNegotiations = await this.expireNegotiations(now);
      result.negotiationsExpired = expiredNegotiations.count;
      result.errors.push(...expiredNegotiations.errors);

      await job.updateProgress(75);

      // 4. Send reminders for items expiring soon
      if (sendReminders) {
        const reminders = await this.sendExpiryReminders(now, reminderHoursBefore);
        result.remindersSent = reminders.count;
        result.errors.push(...reminders.errors);
      }

      await job.updateProgress(100);

    } catch (error) {
      this.logger.error(`Marketplace expiry job failed: ${error.message}`);
      result.errors.push(`Job error: ${error.message}`);
      throw error;
    }

    return result;
  }

  /**
   * Expire old trade offers
   */
  private async expireOffers(now: Date, restaurantId?: string): Promise<{
    count: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const where: any = {
        status: TradeOfferStatus.OPEN,
        expiresAt: { lte: now },
      };

      if (restaurantId) {
        where.restaurantId = restaurantId;
      }

      // Get offers to expire (for notifications)
      const offersToExpire = await this.prisma.tradeOffer.findMany({
        where,
        include: {
          worker: {
            include: { user: { select: { id: true } } },
          },
        },
      });

      // Expire the offers
      const result = await this.prisma.tradeOffer.updateMany({
        where,
        data: {
          status: TradeOfferStatus.EXPIRED,
        },
      });

      // Notify owners
      for (const offer of offersToExpire) {
        try {
          await this.notificationService.send(
            offer.worker.user.id,
            NotificationType.SHIFT_REMINDER,
            {
              shiftId: offer.shiftId,
              message: 'Your trade offer has expired',
            },
          );
        } catch (error) {
          errors.push(`Failed to notify offer ${offer.id}: ${error.message}`);
        }
      }

      this.logger.log(`Expired ${result.count} trade offers`);

      return { count: result.count, errors };
    } catch (error) {
      this.logger.error(`Failed to expire offers: ${error.message}`);
      return { count: 0, errors: [`Expire offers error: ${error.message}`] };
    }
  }

  /**
   * Expire old trade matches
   */
  private async expireMatches(now: Date): Promise<{
    count: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Get matches to expire (for notifications)
      const matchesToExpire = await this.prisma.tradeMatch.findMany({
        where: {
          status: TradeMatchStatus.PROPOSED,
          expiresAt: { lte: now },
        },
        include: {
          offer: true,
          offerer: {
            include: { user: { select: { id: true } } },
          },
          acceptor: {
            include: { user: { select: { id: true } } },
          },
        },
      });

      // Expire the matches
      const result = await this.prisma.tradeMatch.updateMany({
        where: {
          status: TradeMatchStatus.PROPOSED,
          expiresAt: { lte: now },
        },
        data: {
          status: TradeMatchStatus.EXPIRED,
        },
      });

      // Re-open the associated offers and notify
      for (const match of matchesToExpire) {
        try {
          // Re-open the offer
          await this.prisma.tradeOffer.update({
            where: { id: match.offerId },
            data: { status: TradeOfferStatus.OPEN },
          });

          // Notify both parties
          await Promise.all([
            this.notificationService.send(
              match.offerer.user.id,
              NotificationType.SWAP_EXPIRED,
              { swapId: match.id },
            ),
            this.notificationService.send(
              match.acceptor.user.id,
              NotificationType.SWAP_EXPIRED,
              { swapId: match.id },
            ),
          ]);
        } catch (error) {
          errors.push(`Failed to process expired match ${match.id}: ${error.message}`);
        }
      }

      this.logger.log(`Expired ${result.count} trade matches`);

      return { count: result.count, errors };
    } catch (error) {
      this.logger.error(`Failed to expire matches: ${error.message}`);
      return { count: 0, errors: [`Expire matches error: ${error.message}`] };
    }
  }

  /**
   * Expire stale negotiations
   */
  private async expireNegotiations(now: Date): Promise<{
    count: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Get negotiations to expire
      const negotiationsToExpire = await this.prisma.tradeNegotiation.findMany({
        where: {
          status: TradeNegotiationStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        include: {
          participant1: {
            include: { user: { select: { id: true } } },
          },
          participant2: {
            include: { user: { select: { id: true } } },
          },
        },
      });

      // Expire the negotiations
      const result = await this.prisma.tradeNegotiation.updateMany({
        where: {
          status: TradeNegotiationStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        data: {
          status: TradeNegotiationStatus.EXPIRED,
        },
      });

      // Notify participants
      for (const neg of negotiationsToExpire) {
        try {
          await Promise.all([
            this.notificationService.send(
              neg.participant1.user.id,
              NotificationType.SWAP_EXPIRED,
              { swapId: neg.id },
            ),
            this.notificationService.send(
              neg.participant2.user.id,
              NotificationType.SWAP_EXPIRED,
              { swapId: neg.id },
            ),
          ]);
        } catch (error) {
          errors.push(`Failed to notify negotiation ${neg.id}: ${error.message}`);
        }
      }

      this.logger.log(`Expired ${result.count} negotiations`);

      return { count: result.count, errors };
    } catch (error) {
      this.logger.error(`Failed to expire negotiations: ${error.message}`);
      return { count: 0, errors: [`Expire negotiations error: ${error.message}`] };
    }
  }

  /**
   * Send reminders for items expiring soon
   */
  private async sendExpiryReminders(
    now: Date,
    hoursBefore: number,
  ): Promise<{
    count: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let count = 0;

    const expiryWindow = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
    const reminderKey = `reminder:${now.toISOString().split('T')[0]}:${now.getHours()}`;

    try {
      // Remind about expiring offers
      const expiringOffers = await this.prisma.tradeOffer.findMany({
        where: {
          status: TradeOfferStatus.OPEN,
          expiresAt: {
            gt: now,
            lte: expiryWindow,
          },
        },
        include: {
          worker: {
            include: { user: { select: { id: true } } },
          },
          shift: true,
        },
      });

      for (const offer of expiringOffers) {
        try {
          // Check if we already sent a reminder for this offer in this time window
          const sentKey = `${reminderKey}:offer:${offer.id}`;
          // In production, check Redis to avoid duplicate reminders

          await this.notificationService.send(
            offer.worker.user.id,
            NotificationType.SHIFT_REMINDER,
            {
              shiftId: offer.shiftId,
              message: `Your trade offer expires in ${hoursBefore} hours`,
            },
          );
          count++;
        } catch (error) {
          errors.push(`Failed to send reminder for offer ${offer.id}: ${error.message}`);
        }
      }

      // Remind about expiring negotiations (where it's their turn to respond)
      const expiringNegotiations = await this.prisma.tradeNegotiation.findMany({
        where: {
          status: TradeNegotiationStatus.ACTIVE,
          pendingResponseFrom: { not: null },
          expiresAt: {
            gt: now,
            lte: expiryWindow,
          },
        },
        include: {
          participant1: {
            include: { user: { select: { id: true } } },
          },
          participant2: {
            include: { user: { select: { id: true } } },
          },
        },
      });

      for (const neg of expiringNegotiations) {
        try {
          // Notify the person who needs to respond
          const pendingUser = neg.pendingResponseFrom === neg.participant1Id
            ? neg.participant1.user.id
            : neg.participant2.user.id;

          await this.notificationService.send(
            pendingUser,
            NotificationType.SHIFT_REMINDER,
            {
              shiftId: neg.id,
              message: `A trade negotiation needs your response - expires in ${hoursBefore} hours`,
            },
          );
          count++;
        } catch (error) {
          errors.push(`Failed to send reminder for negotiation ${neg.id}: ${error.message}`);
        }
      }

      this.logger.log(`Sent ${count} expiry reminders`);

      return { count, errors };
    } catch (error) {
      this.logger.error(`Failed to send reminders: ${error.message}`);
      return { count: 0, errors: [`Reminder error: ${error.message}`] };
    }
  }

  /**
   * Manually trigger expiry check
   */
  async triggerExpiryCheck(options?: MarketplaceExpiryJobData): Promise<string> {
    const job = await this.queue.add(
      'manual-expiry',
      {
        sendReminders: options?.sendReminders ?? true,
        reminderHoursBefore: options?.reminderHoursBefore ?? 2,
        restaurantId: options?.restaurantId,
      },
      {
        priority: 1,
      },
    );

    this.logger.log(`Triggered manual expiry check job ${job.id}`);
    return job.id!;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    result?: MarketplaceExpiryJobResult;
    failedReason?: string;
  } | null> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      id: job.id!,
      state,
      progress: job.progress as number || 0,
      result: state === 'completed' ? job.returnvalue : undefined,
      failedReason: state === 'failed' ? job.failedReason : undefined,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Parse Redis URL to connection object
   */
  private parseRedisUrl(url: string): { host: string; port: number; password?: string } {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || 6379,
        password: parsed.password || undefined,
      };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }
}
