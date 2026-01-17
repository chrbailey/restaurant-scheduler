import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaService } from '@/common/prisma/prisma.service';
import { LaborOptimizerService } from '../services/labor-optimizer.service';
import { ForecastAccuracyService } from '../services/forecast-accuracy.service';
import { WorkerAnalyticsService } from '../services/worker-analytics.service';
import {
  SnapshotMetadata,
  SnapshotStatus,
  calculateCostPerHour,
  calculateLaborPercentOfRevenue,
} from '../entities/analytics-snapshot.entity';

/**
 * Analytics Snapshot Job
 *
 * BullMQ job for daily analytics snapshot capture:
 * - Runs at midnight daily
 * - Captures key metrics for each restaurant
 * - Stores historical data for trend analysis
 * - Identifies at-risk workers
 */

const QUEUE_NAME = 'analytics-snapshot';

export interface SnapshotJobData {
  restaurantId?: string; // If null, process all restaurants
  date?: string; // YYYY-MM-DD format, defaults to yesterday
  forceRecreate?: boolean; // Recreate even if snapshot exists
}

export interface SnapshotJobResult {
  restaurantsProcessed: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  errors: string[];
}

@Injectable()
export class AnalyticsSnapshotJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsSnapshotJob.name);
  private queue: Queue<SnapshotJobData, SnapshotJobResult>;
  private worker: Worker<SnapshotJobData, SnapshotJobResult>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly laborOptimizer: LaborOptimizerService,
    private readonly forecastAccuracy: ForecastAccuracyService,
    private readonly workerAnalytics: WorkerAnalyticsService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('database.redis.url', 'redis://localhost:6379');
    const connection = this.parseRedisUrl(redisUrl);

    // Initialize queue
    this.queue = new Queue<SnapshotJobData, SnapshotJobResult>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: {
          count: 50,
          age: 7 * 24 * 3600, // Keep completed jobs for 7 days
        },
        removeOnFail: {
          count: 50,
          age: 14 * 24 * 3600, // Keep failed jobs for 14 days
        },
      },
    });

    // Initialize worker
    this.worker = new Worker<SnapshotJobData, SnapshotJobResult>(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection,
        concurrency: 1, // Process one at a time
      },
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      this.logger.log(
        `Analytics snapshot job ${job.id} completed: ` +
        `${job.returnvalue?.snapshotsCreated} created, ${job.returnvalue?.snapshotsUpdated} updated`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Analytics snapshot job ${job?.id} failed: ${error.message}`);
    });

    // Schedule daily job at midnight
    await this.scheduleDailySnapshot();

    this.logger.log('Analytics snapshot job initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.logger.log('Analytics snapshot job shutdown');
  }

  /**
   * Schedule the daily snapshot job
   */
  private async scheduleDailySnapshot() {
    // Remove any existing repeatable jobs
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Add daily job at midnight
    await this.queue.add(
      'daily-snapshot',
      {},
      {
        repeat: {
          pattern: '0 0 * * *', // Midnight every day
        },
        jobId: 'daily-snapshot',
      },
    );

    this.logger.log('Scheduled daily analytics snapshot job at midnight');
  }

  /**
   * Process the snapshot job
   */
  private async processJob(job: Job<SnapshotJobData, SnapshotJobResult>): Promise<SnapshotJobResult> {
    this.logger.log(`Processing analytics snapshot job ${job.id}`);

    const { restaurantId, date, forceRecreate = false } = job.data;
    const result: SnapshotJobResult = {
      restaurantsProcessed: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      errors: [],
    };

    try {
      // Determine target date (default to yesterday)
      const targetDate = date
        ? new Date(date)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);
      targetDate.setHours(0, 0, 0, 0);

      const targetDateEnd = new Date(targetDate);
      targetDateEnd.setHours(23, 59, 59, 999);

      // Get restaurants to process
      const restaurants = restaurantId
        ? await this.prisma.restaurant.findMany({ where: { id: restaurantId } })
        : await this.prisma.restaurant.findMany();

      const totalRestaurants = restaurants.length;
      this.logger.log(`Processing ${totalRestaurants} restaurants for ${targetDate.toISOString().split('T')[0]}`);

      for (let i = 0; i < restaurants.length; i++) {
        const restaurant = restaurants[i];

        try {
          // Update job progress
          await job.updateProgress(Math.round((i / totalRestaurants) * 100));

          // Check if snapshot already exists
          const existingSnapshot = await this.prisma.analyticsSnapshot.findFirst({
            where: {
              restaurantId: restaurant.id,
              date: {
                gte: targetDate,
                lt: targetDateEnd,
              },
            },
          });

          if (existingSnapshot && !forceRecreate) {
            // Update existing snapshot if needed
            if (existingSnapshot.status === 'PENDING' || existingSnapshot.status === 'PARTIAL') {
              await this.updateSnapshot(existingSnapshot.id, restaurant, targetDate, targetDateEnd);
              result.snapshotsUpdated++;
            }
          } else {
            // Create new snapshot
            await this.createSnapshot(restaurant, targetDate, targetDateEnd);
            result.snapshotsCreated++;
          }

          result.restaurantsProcessed++;

        } catch (error) {
          this.logger.error(`Failed to process restaurant ${restaurant.id}: ${error.message}`);
          result.errors.push(`Restaurant ${restaurant.name}: ${error.message}`);
        }
      }

      await job.updateProgress(100);

    } catch (error) {
      this.logger.error(`Analytics snapshot job failed: ${error.message}`);
      result.errors.push(`Job error: ${error.message}`);
      throw error;
    }

    return result;
  }

  /**
   * Create a new analytics snapshot
   */
  private async createSnapshot(
    restaurant: any,
    dateStart: Date,
    dateEnd: Date,
  ): Promise<void> {
    const dateRange = { startDate: dateStart, endDate: dateEnd };

    try {
      // Get labor analysis
      const laborAnalysis = await this.laborOptimizer.analyzeLaborCosts(
        restaurant.id,
        dateRange,
      );

      // Get worker stats
      const workers = await this.prisma.workerProfile.findMany({
        where: { restaurantId: restaurant.id, status: 'ACTIVE' },
      });

      const workerCount = workers.length;
      const avgReliability = workers.length > 0
        ? workers.reduce((sum, w) => sum + Number(w.reliabilityScore), 0) / workers.length
        : null;

      // Get shift stats
      const shifts = await this.prisma.shift.findMany({
        where: {
          restaurantId: restaurant.id,
          startTime: { gte: dateStart },
          endTime: { lte: dateEnd },
        },
      });

      const shiftsScheduled = shifts.filter(s => s.status !== 'DRAFT').length;
      const shiftsCompleted = shifts.filter(s => s.status === 'COMPLETED').length;
      const shiftsCancelled = shifts.filter(s => s.status === 'CANCELLED').length;
      const shiftsNoShow = shifts.filter(s => s.status === 'NO_SHOW').length;

      // Get forecast accuracy (if available)
      let forecastAccuracyScore: number | null = null;
      try {
        const accuracy = await this.forecastAccuracy.measureAccuracy(restaurant.id, dateRange);
        forecastAccuracyScore = accuracy.overallAccuracy;
      } catch (error) {
        this.logger.debug(`No forecast accuracy data for ${restaurant.id}`);
      }

      // Calculate coverage score
      const coverageScore = shiftsScheduled > 0
        ? Math.round((shiftsCompleted / shiftsScheduled) * 100)
        : null;

      // Build position breakdown
      const laborByPosition: SnapshotMetadata['laborByPosition'] = {};
      for (const pos of laborAnalysis.positionBreakdown) {
        laborByPosition[pos.position] = {
          hours: pos.laborHours,
          cost: pos.laborCost,
          workerCount: pos.workerCount,
        };
      }

      // Get top performers
      const topPerformers = workers
        .sort((a, b) => Number(b.reliabilityScore) - Number(a.reliabilityScore))
        .slice(0, 5)
        .map(w => ({
          workerId: w.userId,
          name: w.id, // Would need user relation to get name
          metric: 'Reliability',
          value: Number(w.reliabilityScore),
        }));

      // Identify at-risk workers
      const atRiskWorkers: SnapshotMetadata['atRiskWorkers'] = [];
      for (const worker of workers.slice(0, 10)) {
        try {
          const churnRisk = await this.workerAnalytics.predictChurnRisk(worker.id);
          if (churnRisk.riskLevel === 'HIGH' || churnRisk.riskLevel === 'CRITICAL') {
            atRiskWorkers.push({
              workerId: worker.userId,
              name: worker.id,
              churnRiskScore: churnRisk.riskScore,
            });
          }
        } catch (error) {
          // Skip if churn prediction fails
        }
      }

      // Build metadata
      const metadata: SnapshotMetadata = {
        shiftsScheduled,
        shiftsCompleted,
        shiftsCancelled,
        shiftsNoShow,
        laborByPosition,
        overtimeHours: laborAnalysis.summary.totalOvertimeHours,
        overtimeCost: laborAnalysis.summary.totalOvertimeCost,
        topPerformers,
        atRiskWorkers,
        notes: '',
        flags: [],
      };

      // Add flags for notable conditions
      if (laborAnalysis.summary.totalOvertimeHours > laborAnalysis.summary.totalLaborHours * 0.1) {
        metadata.flags?.push('HIGH_OVERTIME');
      }
      if (forecastAccuracyScore && forecastAccuracyScore < 60) {
        metadata.flags?.push('LOW_FORECAST_ACCURACY');
      }
      if (shiftsNoShow > 0) {
        metadata.flags?.push('HAD_NO_SHOWS');
      }
      if (atRiskWorkers.length > 0) {
        metadata.flags?.push('HAS_AT_RISK_WORKERS');
      }

      // Create snapshot
      await this.prisma.analyticsSnapshot.create({
        data: {
          restaurantId: restaurant.id,
          date: dateStart,
          laborCost: laborAnalysis.summary.totalLaborCost,
          laborHours: laborAnalysis.summary.totalLaborHours,
          revenue: null, // Would need POS integration
          forecastAccuracy: forecastAccuracyScore,
          coverageScore,
          workerCount,
          avgReliability,
          metadata: metadata as any,
          status: 'COMPLETE',
        },
      });

      this.logger.debug(`Created snapshot for ${restaurant.name} on ${dateStart.toISOString().split('T')[0]}`);

    } catch (error) {
      // Create partial snapshot with error
      await this.prisma.analyticsSnapshot.create({
        data: {
          restaurantId: restaurant.id,
          date: dateStart,
          laborCost: 0,
          laborHours: 0,
          revenue: null,
          forecastAccuracy: null,
          coverageScore: null,
          workerCount: 0,
          avgReliability: null,
          metadata: {
            notes: `Error creating snapshot: ${error.message}`,
            flags: ['ERROR'],
          } as any,
          status: 'ERROR',
        },
      });

      throw error;
    }
  }

  /**
   * Update an existing snapshot
   */
  private async updateSnapshot(
    snapshotId: string,
    restaurant: any,
    dateStart: Date,
    dateEnd: Date,
  ): Promise<void> {
    // Re-run the snapshot creation logic and update
    const dateRange = { startDate: dateStart, endDate: dateEnd };

    try {
      const laborAnalysis = await this.laborOptimizer.analyzeLaborCosts(
        restaurant.id,
        dateRange,
      );

      const workers = await this.prisma.workerProfile.findMany({
        where: { restaurantId: restaurant.id, status: 'ACTIVE' },
      });

      const workerCount = workers.length;
      const avgReliability = workers.length > 0
        ? workers.reduce((sum, w) => sum + Number(w.reliabilityScore), 0) / workers.length
        : null;

      let forecastAccuracyScore: number | null = null;
      try {
        const accuracy = await this.forecastAccuracy.measureAccuracy(restaurant.id, dateRange);
        forecastAccuracyScore = accuracy.overallAccuracy;
      } catch (error) {
        // Ignore
      }

      await this.prisma.analyticsSnapshot.update({
        where: { id: snapshotId },
        data: {
          laborCost: laborAnalysis.summary.totalLaborCost,
          laborHours: laborAnalysis.summary.totalLaborHours,
          forecastAccuracy: forecastAccuracyScore,
          workerCount,
          avgReliability,
          status: 'COMPLETE',
          updatedAt: new Date(),
        },
      });

      this.logger.debug(`Updated snapshot ${snapshotId}`);

    } catch (error) {
      await this.prisma.analyticsSnapshot.update({
        where: { id: snapshotId },
        data: {
          status: 'ERROR',
          metadata: {
            notes: `Error updating snapshot: ${error.message}`,
            flags: ['ERROR'],
          } as any,
        },
      });

      throw error;
    }
  }

  /**
   * Manually trigger snapshot for a restaurant
   */
  async triggerSnapshot(
    restaurantId: string,
    options?: Partial<SnapshotJobData>,
  ): Promise<string> {
    const job = await this.queue.add(
      'manual-snapshot',
      {
        restaurantId,
        date: options?.date,
        forceRecreate: options?.forceRecreate ?? false,
      },
      {
        priority: 1,
      },
    );

    this.logger.log(`Triggered manual snapshot job ${job.id} for restaurant ${restaurantId}`);
    return job.id!;
  }

  /**
   * Trigger snapshot for all restaurants
   */
  async triggerAllSnapshots(options?: Partial<SnapshotJobData>): Promise<string> {
    const job = await this.queue.add(
      'manual-all-snapshot',
      {
        date: options?.date,
        forceRecreate: options?.forceRecreate ?? false,
      },
      {
        priority: 1,
      },
    );

    this.logger.log(`Triggered manual snapshot job ${job.id} for all restaurants`);
    return job.id!;
  }

  /**
   * Backfill snapshots for a date range
   */
  async backfillSnapshots(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string[]> {
    const jobIds: string[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const job = await this.queue.add(
        'backfill-snapshot',
        {
          restaurantId,
          date: currentDate.toISOString().split('T')[0],
          forceRecreate: true,
        },
        {
          priority: 2, // Lower priority than manual triggers
        },
      );

      jobIds.push(job.id!);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.logger.log(
      `Scheduled ${jobIds.length} backfill jobs for restaurant ${restaurantId} ` +
      `from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    );

    return jobIds;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    result?: SnapshotJobResult;
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
