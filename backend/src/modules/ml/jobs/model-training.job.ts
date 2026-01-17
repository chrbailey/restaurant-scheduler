import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MLForecasterService } from '../services/ml-forecaster.service';
import { ModelRegistryService } from '../services/model-registry.service';
import { EventAggregatorService } from '../services/event-aggregator.service';
import { FeatureEngineeringService } from '../services/feature-engineering.service';
import { ModelType, AccuracyTrend } from '../entities/ml-model.entity';

/**
 * Model Training Job
 *
 * BullMQ job for ML model training:
 * - Weekly scheduled retraining
 * - Triggered when accuracy drops below threshold
 * - Parallel training for multiple restaurants
 * - Feature snapshot collection
 */

const QUEUE_NAME = 'ml-model-training';

// ==================== Job Types ====================

export enum TrainingJobType {
  TRAIN_MODEL = 'train-model',
  RETRAIN_IF_NEEDED = 'retrain-if-needed',
  TRAIN_ALL = 'train-all',
  COLLECT_FEATURES = 'collect-features',
  CLEANUP_EVENTS = 'cleanup-events',
  EVALUATE_MODELS = 'evaluate-models',
}

export interface TrainingJobData {
  type: TrainingJobType;
  restaurantId?: string;
  modelType?: ModelType;
  forceRetrain?: boolean;
  daysToCollect?: number;
}

export interface TrainingJobResult {
  type: TrainingJobType;
  success: boolean;
  restaurantsProcessed?: number;
  modelsCreated?: number;
  featureSnapshots?: number;
  eventsCleanedUp?: number;
  errors: string[];
  details?: Record<string, any>;
}

@Injectable()
export class ModelTrainingJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModelTrainingJob.name);
  private queue: Queue<TrainingJobData, TrainingJobResult>;
  private worker: Worker<TrainingJobData, TrainingJobResult>;

  // Training concurrency (limit to prevent overloading)
  private readonly TRAINING_CONCURRENCY = 2;

  // Accuracy threshold for retraining trigger
  private readonly MAPE_THRESHOLD = 25; // Retrain if MAPE > 25%

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mlForecaster: MLForecasterService,
    private readonly modelRegistry: ModelRegistryService,
    private readonly eventAggregator: EventAggregatorService,
    private readonly featureEngineering: FeatureEngineeringService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('database.redis.url', 'redis://localhost:6379');
    const connection = this.parseRedisUrl(redisUrl);

    // Initialize queue
    this.queue = new Queue<TrainingJobData, TrainingJobResult>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30 seconds initial delay
        },
        removeOnComplete: {
          count: 50,
          age: 7 * 24 * 3600, // Keep completed jobs for 7 days
        },
        removeOnFail: {
          count: 50,
          age: 30 * 24 * 3600, // Keep failed jobs for 30 days
        },
      },
    });

    // Initialize worker
    this.worker = new Worker<TrainingJobData, TrainingJobResult>(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection,
        concurrency: this.TRAINING_CONCURRENCY,
      },
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      this.logger.log(
        `Training job ${job.id} (${job.data.type}) completed: ` +
        `${job.returnvalue?.modelsCreated || 0} models created`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Training job ${job?.id} failed: ${error.message}`);
    });

    this.worker.on('progress', (job, progress) => {
      this.logger.debug(`Training job ${job.id} progress: ${progress}%`);
    });

    // Schedule recurring jobs
    await this.scheduleRecurringJobs();

    this.logger.log('Model training job initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.logger.log('Model training job shutdown');
  }

  /**
   * Schedule recurring training jobs
   */
  private async scheduleRecurringJobs() {
    // Remove existing repeatable jobs
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Weekly model retraining (Sunday at 2 AM)
    await this.queue.add(
      'weekly-retrain',
      {
        type: TrainingJobType.TRAIN_ALL,
        forceRetrain: false,
      },
      {
        repeat: {
          pattern: '0 2 * * 0', // Sunday at 2 AM
        },
        jobId: 'weekly-retrain',
      },
    );

    // Daily feature collection (every day at 4 AM)
    await this.queue.add(
      'daily-features',
      {
        type: TrainingJobType.COLLECT_FEATURES,
        daysToCollect: 1,
      },
      {
        repeat: {
          pattern: '0 4 * * *', // Every day at 4 AM
        },
        jobId: 'daily-features',
      },
    );

    // Daily model evaluation (every day at 5 AM)
    await this.queue.add(
      'daily-evaluate',
      {
        type: TrainingJobType.EVALUATE_MODELS,
      },
      {
        repeat: {
          pattern: '0 5 * * *', // Every day at 5 AM
        },
        jobId: 'daily-evaluate',
      },
    );

    // Weekly event cleanup (Saturday at 3 AM)
    await this.queue.add(
      'weekly-cleanup',
      {
        type: TrainingJobType.CLEANUP_EVENTS,
      },
      {
        repeat: {
          pattern: '0 3 * * 6', // Saturday at 3 AM
        },
        jobId: 'weekly-cleanup',
      },
    );

    this.logger.log('Scheduled recurring training jobs');
  }

  /**
   * Process a training job
   */
  private async processJob(job: Job<TrainingJobData, TrainingJobResult>): Promise<TrainingJobResult> {
    this.logger.log(`Processing training job ${job.id}: ${job.data.type}`);

    const result: TrainingJobResult = {
      type: job.data.type,
      success: true,
      errors: [],
    };

    try {
      switch (job.data.type) {
        case TrainingJobType.TRAIN_MODEL:
          await this.handleTrainModel(job, result);
          break;

        case TrainingJobType.RETRAIN_IF_NEEDED:
          await this.handleRetrainIfNeeded(job, result);
          break;

        case TrainingJobType.TRAIN_ALL:
          await this.handleTrainAll(job, result);
          break;

        case TrainingJobType.COLLECT_FEATURES:
          await this.handleCollectFeatures(job, result);
          break;

        case TrainingJobType.CLEANUP_EVENTS:
          await this.handleCleanupEvents(job, result);
          break;

        case TrainingJobType.EVALUATE_MODELS:
          await this.handleEvaluateModels(job, result);
          break;

        default:
          throw new Error(`Unknown job type: ${job.data.type}`);
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Handle single model training
   */
  private async handleTrainModel(
    job: Job<TrainingJobData, TrainingJobResult>,
    result: TrainingJobResult,
  ): Promise<void> {
    const { restaurantId, modelType, forceRetrain } = job.data;

    if (!restaurantId) {
      throw new Error('restaurantId is required for TRAIN_MODEL');
    }

    const trainingResult = await this.mlForecaster.trainModel({
      restaurantId,
      modelType,
      forceRetrain,
    });

    result.modelsCreated = trainingResult.success ? 1 : 0;
    result.details = {
      restaurantId,
      version: trainingResult.version,
      metrics: trainingResult.metrics,
      dataPointsUsed: trainingResult.dataPointsUsed,
      trainingDuration: trainingResult.trainingDuration,
    };

    if (!trainingResult.success) {
      result.errors.push(trainingResult.error || 'Training failed');
    }
  }

  /**
   * Handle conditional retraining
   */
  private async handleRetrainIfNeeded(
    job: Job<TrainingJobData, TrainingJobResult>,
    result: TrainingJobResult,
  ): Promise<void> {
    const { restaurantId } = job.data;

    if (!restaurantId) {
      throw new Error('restaurantId is required for RETRAIN_IF_NEEDED');
    }

    const trainingResult = await this.mlForecaster.retrainIfNeeded(restaurantId);

    if (trainingResult) {
      result.modelsCreated = trainingResult.success ? 1 : 0;
      result.details = {
        restaurantId,
        retrainTriggered: true,
        version: trainingResult.version,
        metrics: trainingResult.metrics,
      };

      if (!trainingResult.success) {
        result.errors.push(trainingResult.error || 'Retraining failed');
      }
    } else {
      result.modelsCreated = 0;
      result.details = {
        restaurantId,
        retrainTriggered: false,
      };
    }
  }

  /**
   * Handle training all restaurant models
   */
  private async handleTrainAll(
    job: Job<TrainingJobData, TrainingJobResult>,
    result: TrainingJobResult,
  ): Promise<void> {
    const { forceRetrain, modelType } = job.data;

    // Get all ghost kitchen enabled restaurants
    const restaurants = await this.prisma.restaurant.findMany({
      where: { ghostKitchenEnabled: true },
      select: { id: true, name: true },
    });

    result.restaurantsProcessed = 0;
    result.modelsCreated = 0;
    result.details = { results: [] };

    const total = restaurants.length;

    for (let i = 0; i < restaurants.length; i++) {
      const restaurant = restaurants[i];

      try {
        await job.updateProgress(Math.round((i / total) * 100));

        let trainingResult;

        if (forceRetrain) {
          trainingResult = await this.mlForecaster.trainModel({
            restaurantId: restaurant.id,
            modelType,
            forceRetrain: true,
          });
        } else {
          trainingResult = await this.mlForecaster.retrainIfNeeded(restaurant.id);
        }

        result.restaurantsProcessed!++;

        if (trainingResult?.success) {
          result.modelsCreated!++;
          (result.details!.results as any[]).push({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            success: true,
            version: trainingResult.version,
          });
        } else if (trainingResult) {
          result.errors.push(`${restaurant.name}: ${trainingResult.error}`);
          (result.details!.results as any[]).push({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            success: false,
            error: trainingResult.error,
          });
        }
      } catch (error) {
        result.errors.push(`${restaurant.name}: ${error.message}`);
      }
    }

    await job.updateProgress(100);
  }

  /**
   * Handle feature collection for training data
   */
  private async handleCollectFeatures(
    job: Job<TrainingJobData, TrainingJobResult>,
    result: TrainingJobResult,
  ): Promise<void> {
    const daysToCollect = job.data.daysToCollect || 1;

    // Get all restaurants
    const restaurants = await this.prisma.restaurant.findMany({
      where: { ghostKitchenEnabled: true },
      select: { id: true, lat: true, lng: true },
    });

    result.featureSnapshots = 0;
    result.restaurantsProcessed = 0;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const restaurant of restaurants) {
      try {
        // Collect features for the past N days
        for (let d = 0; d < daysToCollect; d++) {
          const date = new Date(yesterday);
          date.setDate(date.getDate() - d);

          const features = await this.featureEngineering.extractFeatures(
            restaurant.id,
            date,
          );

          for (const fv of features) {
            if (fv.metadata.rawSnapshot) {
              await this.featureEngineering.storeFeatureSnapshot(fv.metadata.rawSnapshot);
              result.featureSnapshots!++;
            }
          }
        }

        result.restaurantsProcessed!++;
      } catch (error) {
        result.errors.push(`Feature collection for ${restaurant.id}: ${error.message}`);
      }
    }

    this.logger.log(
      `Collected ${result.featureSnapshots} feature snapshots for ${result.restaurantsProcessed} restaurants`,
    );
  }

  /**
   * Handle expired event cleanup
   */
  private async handleCleanupEvents(
    job: Job<TrainingJobData, TrainingJobResult>,
    result: TrainingJobResult,
  ): Promise<void> {
    const cleaned = await this.eventAggregator.cleanupExpiredEvents();
    result.eventsCleanedUp = cleaned;

    // Also prune old model versions
    const restaurants = await this.prisma.restaurant.findMany({
      where: { ghostKitchenEnabled: true },
      select: { id: true },
    });

    let modelsPruned = 0;
    for (const restaurant of restaurants) {
      try {
        const pruned = await this.modelRegistry.pruneModelHistory(restaurant.id, 5);
        modelsPruned += pruned;
      } catch (error) {
        result.errors.push(`Model pruning for ${restaurant.id}: ${error.message}`);
      }
    }

    result.details = {
      eventsCleanedUp: cleaned,
      modelVersionsPruned: modelsPruned,
    };

    this.logger.log(`Cleaned up ${cleaned} events and ${modelsPruned} model versions`);
  }

  /**
   * Handle model evaluation and accuracy monitoring
   */
  private async handleEvaluateModels(
    job: Job<TrainingJobData, TrainingJobResult>,
    result: TrainingJobResult,
  ): Promise<void> {
    const activeModels = await this.modelRegistry.getActiveModels();

    result.restaurantsProcessed = 0;
    result.details = { evaluations: [] };

    const retrainCandidates: string[] = [];

    for (const modelInfo of activeModels) {
      try {
        const evaluation = await this.mlForecaster.evaluateModel(modelInfo.restaurantId);

        if (evaluation) {
          (result.details!.evaluations as any[]).push({
            restaurantId: modelInfo.restaurantId,
            restaurantName: modelInfo.restaurantName,
            version: modelInfo.version,
            metrics: evaluation.metrics,
            needsRetraining: evaluation.needsRetraining,
            reason: evaluation.retrainingReason,
          });

          if (evaluation.needsRetraining) {
            retrainCandidates.push(modelInfo.restaurantId);
          }
        }

        result.restaurantsProcessed!++;
      } catch (error) {
        result.errors.push(`Evaluation for ${modelInfo.restaurantId}: ${error.message}`);
      }
    }

    // Queue retraining for candidates
    for (const restaurantId of retrainCandidates) {
      await this.queueTraining(restaurantId);
    }

    result.details!.retrainCandidates = retrainCandidates.length;

    this.logger.log(
      `Evaluated ${result.restaurantsProcessed} models, ${retrainCandidates.length} need retraining`,
    );
  }

  // ==================== Public Methods ====================

  /**
   * Queue a training job for a restaurant
   */
  async queueTraining(
    restaurantId: string,
    options?: {
      modelType?: ModelType;
      forceRetrain?: boolean;
      priority?: number;
    },
  ): Promise<string> {
    const job = await this.queue.add(
      `train-${restaurantId}`,
      {
        type: TrainingJobType.TRAIN_MODEL,
        restaurantId,
        modelType: options?.modelType,
        forceRetrain: options?.forceRetrain ?? false,
      },
      {
        priority: options?.priority ?? 10,
      },
    );

    this.logger.log(`Queued training job ${job.id} for restaurant ${restaurantId}`);
    return job.id!;
  }

  /**
   * Queue retraining check for a restaurant
   */
  async queueRetrainCheck(restaurantId: string): Promise<string> {
    const job = await this.queue.add(
      `retrain-check-${restaurantId}`,
      {
        type: TrainingJobType.RETRAIN_IF_NEEDED,
        restaurantId,
      },
      {
        priority: 5,
      },
    );

    return job.id!;
  }

  /**
   * Queue training for all restaurants
   */
  async queueTrainAll(forceRetrain: boolean = false): Promise<string> {
    const job = await this.queue.add(
      'train-all-manual',
      {
        type: TrainingJobType.TRAIN_ALL,
        forceRetrain,
      },
      {
        priority: 1,
      },
    );

    this.logger.log(`Queued train-all job ${job.id}`);
    return job.id!;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    result?: TrainingJobResult;
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
   * Get recent training jobs
   */
  async getRecentJobs(limit: number = 20): Promise<Array<{
    id: string;
    type: TrainingJobType;
    state: string;
    timestamp: Date;
    duration?: number;
    result?: Partial<TrainingJobResult>;
  }>> {
    const [completed, failed] = await Promise.all([
      this.queue.getCompleted(0, limit),
      this.queue.getFailed(0, limit),
    ]);

    const allJobs = [...completed, ...failed]
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, limit);

    return allJobs.map(job => ({
      id: job.id!,
      type: job.data.type,
      state: job.finishedOn ? 'completed' : 'failed',
      timestamp: new Date(job.timestamp ?? Date.now()),
      duration: job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : undefined,
      result: job.returnvalue ? {
        success: job.returnvalue.success,
        modelsCreated: job.returnvalue.modelsCreated,
        restaurantsProcessed: job.returnvalue.restaurantsProcessed,
        errors: job.returnvalue.errors?.slice(0, 3), // Limit error messages
      } : undefined,
    }));
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
