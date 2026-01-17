import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaService } from '@/common/prisma/prisma.service';
import { DemandForecasterService } from '../services/demand-forecaster.service';
import { OpportunityDetectorService } from '../services/opportunity-detector.service';
import { StaffingRecommenderService } from '../services/staffing-recommender.service';

/**
 * Forecast Job
 *
 * BullMQ job for daily forecast generation:
 * - Runs at 6 AM daily
 * - Generates forecasts for next 7 days
 * - Detects opportunities and creates alerts
 * - Updates historical accuracy metrics
 */

const QUEUE_NAME = 'ghost-kitchen-forecast';

export interface ForecastJobData {
  restaurantId?: string; // If null, process all restaurants
  daysToForecast?: number;
  generateOpportunities?: boolean;
}

export interface ForecastJobResult {
  restaurantsProcessed: number;
  forecastsGenerated: number;
  opportunitiesDetected: number;
  errors: string[];
}

@Injectable()
export class ForecastJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ForecastJob.name);
  private queue: Queue<ForecastJobData, ForecastJobResult>;
  private worker: Worker<ForecastJobData, ForecastJobResult>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly forecaster: DemandForecasterService,
    private readonly opportunityDetector: OpportunityDetectorService,
    private readonly staffingRecommender: StaffingRecommenderService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('database.redis.url', 'redis://localhost:6379');
    const connection = this.parseRedisUrl(redisUrl);

    // Initialize queue
    this.queue = new Queue<ForecastJobData, ForecastJobResult>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
          age: 24 * 3600, // Keep completed jobs for 24 hours
        },
        removeOnFail: {
          count: 50,
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    // Initialize worker
    this.worker = new Worker<ForecastJobData, ForecastJobResult>(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection,
        concurrency: 1, // Process one at a time to avoid overloading
      },
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      this.logger.log(
        `Forecast job ${job.id} completed: ${job.returnvalue?.restaurantsProcessed} restaurants, ` +
        `${job.returnvalue?.forecastsGenerated} forecasts, ${job.returnvalue?.opportunitiesDetected} opportunities`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Forecast job ${job?.id} failed: ${error.message}`);
    });

    // Schedule daily job at 6 AM
    await this.scheduleDailyForecast();

    this.logger.log('Forecast job initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.logger.log('Forecast job shutdown');
  }

  /**
   * Schedule the daily forecast job
   */
  private async scheduleDailyForecast() {
    // Remove any existing repeatable jobs
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Add daily job at 6 AM
    await this.queue.add(
      'daily-forecast',
      {
        daysToForecast: 7,
        generateOpportunities: true,
      },
      {
        repeat: {
          pattern: '0 6 * * *', // 6 AM every day
        },
        jobId: 'daily-forecast',
      },
    );

    this.logger.log('Scheduled daily forecast job at 6 AM');
  }

  /**
   * Process the forecast job
   */
  private async processJob(job: Job<ForecastJobData, ForecastJobResult>): Promise<ForecastJobResult> {
    this.logger.log(`Processing forecast job ${job.id}`);

    const { restaurantId, daysToForecast = 7, generateOpportunities = true } = job.data;
    const result: ForecastJobResult = {
      restaurantsProcessed: 0,
      forecastsGenerated: 0,
      opportunitiesDetected: 0,
      errors: [],
    };

    try {
      // Get restaurants to process
      const restaurants = restaurantId
        ? await this.prisma.restaurant.findMany({ where: { id: restaurantId, ghostKitchenEnabled: true } })
        : await this.prisma.restaurant.findMany({ where: { ghostKitchenEnabled: true } });

      const totalRestaurants = restaurants.length;
      this.logger.log(`Processing ${totalRestaurants} restaurants`);

      for (let i = 0; i < restaurants.length; i++) {
        const restaurant = restaurants[i];

        try {
          // Update job progress
          await job.updateProgress(Math.round((i / totalRestaurants) * 100));

          // Generate forecasts for each day
          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + daysToForecast);

          for (let d = 0; d < daysToForecast; d++) {
            const forecastDate = new Date();
            forecastDate.setDate(forecastDate.getDate() + d);

            try {
              await this.forecaster.forecastDemand(restaurant.id, forecastDate);
              result.forecastsGenerated++;
            } catch (error) {
              this.logger.error(
                `Failed to generate forecast for ${restaurant.id} on ${forecastDate.toISOString()}: ${error.message}`,
              );
              result.errors.push(`Forecast error for ${restaurant.name}: ${error.message}`);
            }
          }

          // Detect opportunities
          if (generateOpportunities) {
            try {
              const opportunities = await this.opportunityDetector.detectOpportunities(
                restaurant.id,
                startDate,
                endDate,
              );

              // Create alerts for high-scoring opportunities
              for (const opportunity of opportunities) {
                if (opportunity.score >= 60) { // Only alert for good opportunities
                  await this.opportunityDetector.createOpportunityAlert(
                    restaurant.id,
                    opportunity,
                  );
                  result.opportunitiesDetected++;
                }
              }
            } catch (error) {
              this.logger.error(
                `Failed to detect opportunities for ${restaurant.id}: ${error.message}`,
              );
              result.errors.push(`Opportunity error for ${restaurant.name}: ${error.message}`);
            }
          }

          // Mark expired opportunities
          await this.opportunityDetector.markExpiredOpportunities();

          result.restaurantsProcessed++;

        } catch (error) {
          this.logger.error(`Failed to process restaurant ${restaurant.id}: ${error.message}`);
          result.errors.push(`Restaurant ${restaurant.name}: ${error.message}`);
        }
      }

      // Update historical accuracy metrics
      await this.updateAccuracyMetrics();

      await job.updateProgress(100);

    } catch (error) {
      this.logger.error(`Forecast job failed: ${error.message}`);
      result.errors.push(`Job error: ${error.message}`);
      throw error;
    }

    return result;
  }

  /**
   * Update accuracy metrics based on historical data
   */
  private async updateAccuracyMetrics(): Promise<void> {
    try {
      const restaurants = await this.prisma.restaurant.findMany({
        where: { ghostKitchenEnabled: true },
        select: { id: true, name: true },
      });

      for (const restaurant of restaurants) {
        const metrics = await this.forecaster.getAccuracyMetrics(restaurant.id, 30);

        if (metrics.sampleCount > 0) {
          this.logger.debug(
            `Accuracy metrics for ${restaurant.name}: ` +
            `DineIn MAPE=${metrics.dineInMAPE.toFixed(1)}%, ` +
            `Delivery MAPE=${metrics.deliveryMAPE.toFixed(1)}%, ` +
            `Samples=${metrics.sampleCount}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update accuracy metrics: ${error.message}`);
    }
  }

  /**
   * Manually trigger forecast for a restaurant
   */
  async triggerForecast(
    restaurantId: string,
    options?: Partial<ForecastJobData>,
  ): Promise<string> {
    const job = await this.queue.add(
      'manual-forecast',
      {
        restaurantId,
        daysToForecast: options?.daysToForecast ?? 7,
        generateOpportunities: options?.generateOpportunities ?? true,
      },
      {
        priority: 1, // Higher priority for manual triggers
      },
    );

    this.logger.log(`Triggered manual forecast job ${job.id} for restaurant ${restaurantId}`);
    return job.id!;
  }

  /**
   * Trigger forecast for all restaurants
   */
  async triggerAllForecasts(options?: Partial<ForecastJobData>): Promise<string> {
    const job = await this.queue.add(
      'manual-all-forecast',
      {
        daysToForecast: options?.daysToForecast ?? 7,
        generateOpportunities: options?.generateOpportunities ?? true,
      },
      {
        priority: 1,
      },
    );

    this.logger.log(`Triggered manual forecast job ${job.id} for all restaurants`);
    return job.id!;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    result?: ForecastJobResult;
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
