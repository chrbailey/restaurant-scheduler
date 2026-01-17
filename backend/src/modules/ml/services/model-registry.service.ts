import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import {
  MLModel,
  ModelType,
  ModelStatus,
  AccuracyTrend,
  TrainingMetrics,
  LinearModelWeights,
  GradientBoostWeights,
  EnsembleWeights,
  ModelParameters,
  ModelEvaluation,
} from '../entities/ml-model.entity';

/**
 * Model Registry Service
 *
 * Manages ML model persistence, versioning, and lifecycle.
 * Handles model storage, loading, history tracking, and rollbacks.
 */

// ==================== Types ====================

export interface ModelSaveRequest {
  restaurantId: string;
  modelType: ModelType;
  weights: LinearModelWeights | GradientBoostWeights | EnsembleWeights;
  parameters: ModelParameters;
  featureNames: string[];
  metrics: TrainingMetrics;
  dataPointsUsed: number;
  trainingDuration: number;
}

export interface ModelHistory {
  version: number;
  trainedAt: Date;
  status: ModelStatus;
  metrics: Partial<TrainingMetrics>;
  dataPointsUsed: number;
  predictionsCount: number;
}

export interface ActiveModelInfo {
  restaurantId: string;
  restaurantName: string;
  version: number;
  modelType: ModelType;
  trainedAt: Date;
  metrics: Partial<TrainingMetrics>;
  predictionsCount: number;
  accuracyTrend: AccuracyTrend;
  lastPredictionAt: Date | null;
}

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  // In-memory cache for active models (hot path)
  private activeModels: Map<string, MLModel> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Save a trained model
   */
  async saveModel(request: ModelSaveRequest): Promise<MLModel> {
    const { restaurantId, modelType, weights, parameters, featureNames, metrics, dataPointsUsed, trainingDuration } = request;

    // Get next version number
    const latestModel = await this.prisma.mLModel.findFirst({
      where: { restaurantId },
      orderBy: { version: 'desc' },
    });

    const version = (latestModel?.version ?? 0) + 1;

    // Deprecate previous active model
    if (latestModel?.status === ModelStatus.ACTIVE) {
      await this.prisma.mLModel.update({
        where: { id: latestModel.id },
        data: { status: ModelStatus.DEPRECATED },
      });
    }

    // Create new model
    const model = await this.prisma.mLModel.create({
      data: {
        restaurantId,
        version,
        modelType,
        weights: weights as any,
        parameters: parameters as any,
        featureNames,
        mae: metrics.mae,
        rmse: metrics.rmse,
        mape: metrics.mape,
        r2Score: metrics.r2Score,
        trainedAt: new Date(),
        dataPointsUsed,
        trainingDuration,
        status: ModelStatus.ACTIVE,
        predictionsCount: 0,
        accuracyTrend: AccuracyTrend.STABLE,
      },
    });

    // Update caches
    const mlModel = this.toMLModel(model);
    this.activeModels.set(restaurantId, mlModel);
    await this.cacheModel(mlModel);

    this.logger.log(
      `Saved model v${version} for restaurant ${restaurantId}: ` +
      `MAE=${metrics.mae.toFixed(2)}, MAPE=${metrics.mape.toFixed(1)}%`,
    );

    return mlModel;
  }

  /**
   * Load the active model for a restaurant
   */
  async loadModel(restaurantId: string): Promise<MLModel | null> {
    // Check in-memory cache first
    const cached = this.activeModels.get(restaurantId);
    if (cached) {
      return cached;
    }

    // Check Redis cache
    const redisKey = `ml:model:${restaurantId}`;
    const redisCached = await this.redis.getJson<MLModel>(redisKey);
    if (redisCached) {
      const model = {
        ...redisCached,
        trainedAt: new Date(redisCached.trainedAt),
        createdAt: new Date(redisCached.createdAt),
        updatedAt: new Date(redisCached.updatedAt),
        lastPredictionAt: redisCached.lastPredictionAt ? new Date(redisCached.lastPredictionAt) : null,
      };
      this.activeModels.set(restaurantId, model);
      return model;
    }

    // Load from database
    const dbModel = await this.prisma.mLModel.findFirst({
      where: {
        restaurantId,
        status: ModelStatus.ACTIVE,
      },
    });

    if (!dbModel) {
      return null;
    }

    const model = this.toMLModel(dbModel);

    // Update caches
    this.activeModels.set(restaurantId, model);
    await this.cacheModel(model);

    return model;
  }

  /**
   * Get model history for a restaurant
   */
  async getModelHistory(restaurantId: string): Promise<ModelHistory[]> {
    const models = await this.prisma.mLModel.findMany({
      where: { restaurantId },
      orderBy: { version: 'desc' },
      select: {
        version: true,
        trainedAt: true,
        status: true,
        mae: true,
        rmse: true,
        mape: true,
        r2Score: true,
        dataPointsUsed: true,
        predictionsCount: true,
      },
    });

    return models.map(m => ({
      version: m.version,
      trainedAt: m.trainedAt,
      status: m.status as ModelStatus,
      metrics: {
        mae: m.mae ?? undefined,
        rmse: m.rmse ?? undefined,
        mape: m.mape ?? undefined,
        r2Score: m.r2Score ?? undefined,
      },
      dataPointsUsed: m.dataPointsUsed,
      predictionsCount: m.predictionsCount,
    }));
  }

  /**
   * Rollback to a previous model version
   */
  async rollbackModel(restaurantId: string, targetVersion: number): Promise<MLModel> {
    // Find target model
    const targetModel = await this.prisma.mLModel.findUnique({
      where: {
        restaurantId_version: {
          restaurantId,
          version: targetVersion,
        },
      },
    });

    if (!targetModel) {
      throw new Error(`Model version ${targetVersion} not found for restaurant ${restaurantId}`);
    }

    if (targetModel.status === ModelStatus.FAILED) {
      throw new Error(`Cannot rollback to a failed model`);
    }

    // Deprecate current active model
    await this.prisma.mLModel.updateMany({
      where: {
        restaurantId,
        status: ModelStatus.ACTIVE,
      },
      data: { status: ModelStatus.DEPRECATED },
    });

    // Activate target model
    const updated = await this.prisma.mLModel.update({
      where: { id: targetModel.id },
      data: {
        status: ModelStatus.ACTIVE,
        recentMae: null, // Reset recent metrics
        accuracyTrend: AccuracyTrend.STABLE,
      },
    });

    const model = this.toMLModel(updated);

    // Update caches
    this.activeModels.set(restaurantId, model);
    await this.cacheModel(model);

    this.logger.log(`Rolled back to model v${targetVersion} for restaurant ${restaurantId}`);

    return model;
  }

  /**
   * Get all restaurants with active models
   */
  async getActiveModels(): Promise<ActiveModelInfo[]> {
    const models = await this.prisma.mLModel.findMany({
      where: { status: ModelStatus.ACTIVE },
    });

    // Get restaurant names
    const restaurantIds = models.map(m => m.restaurantId);
    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, name: true },
    });

    const restaurantMap = new Map(restaurants.map(r => [r.id, r.name]));

    return models.map(m => ({
      restaurantId: m.restaurantId,
      restaurantName: restaurantMap.get(m.restaurantId) || 'Unknown',
      version: m.version,
      modelType: m.modelType as ModelType,
      trainedAt: m.trainedAt,
      metrics: {
        mae: m.mae ?? undefined,
        rmse: m.rmse ?? undefined,
        mape: m.mape ?? undefined,
        r2Score: m.r2Score ?? undefined,
      },
      predictionsCount: m.predictionsCount,
      accuracyTrend: m.accuracyTrend as AccuracyTrend,
      lastPredictionAt: m.lastPredictionAt,
    }));
  }

  /**
   * Record a prediction (for tracking usage)
   */
  async recordPrediction(restaurantId: string): Promise<void> {
    await this.prisma.mLModel.updateMany({
      where: {
        restaurantId,
        status: ModelStatus.ACTIVE,
      },
      data: {
        predictionsCount: { increment: 1 },
        lastPredictionAt: new Date(),
      },
    });

    // Update in-memory cache
    const cached = this.activeModels.get(restaurantId);
    if (cached) {
      cached.predictionsCount++;
      cached.lastPredictionAt = new Date();
    }
  }

  /**
   * Update model performance metrics
   */
  async updateModelPerformance(
    restaurantId: string,
    recentMae: number,
    trend: AccuracyTrend,
  ): Promise<void> {
    await this.prisma.mLModel.updateMany({
      where: {
        restaurantId,
        status: ModelStatus.ACTIVE,
      },
      data: {
        recentMae,
        accuracyTrend: trend,
      },
    });

    // Update in-memory cache
    const cached = this.activeModels.get(restaurantId);
    if (cached) {
      cached.recentMae = recentMae;
      cached.accuracyTrend = trend;
    }

    // Clear Redis cache to force refresh
    await this.redis.del(`ml:model:${restaurantId}`);
  }

  /**
   * Mark a model as failed
   */
  async markModelFailed(restaurantId: string, version: number, error: string): Promise<void> {
    await this.prisma.mLModel.update({
      where: {
        restaurantId_version: {
          restaurantId,
          version,
        },
      },
      data: {
        status: ModelStatus.FAILED,
        parameters: { error } as any,
      },
    });

    this.logger.error(`Model v${version} for ${restaurantId} marked as failed: ${error}`);
  }

  /**
   * Delete old model versions (keep last N)
   */
  async pruneModelHistory(restaurantId: string, keepVersions: number = 5): Promise<number> {
    // Get all versions except the active one and last N
    const models = await this.prisma.mLModel.findMany({
      where: { restaurantId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, status: true },
    });

    // Keep active model and last N versions
    const toKeep = new Set<string>();
    let kept = 0;

    for (const model of models) {
      if (model.status === ModelStatus.ACTIVE || kept < keepVersions) {
        toKeep.add(model.id);
        kept++;
      }
    }

    const toDelete = models.filter(m => !toKeep.has(m.id)).map(m => m.id);

    if (toDelete.length > 0) {
      await this.prisma.mLModel.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    return toDelete.length;
  }

  /**
   * Check if model needs retraining based on performance
   */
  async checkRetrainingNeeded(restaurantId: string): Promise<{
    needed: boolean;
    reason?: string;
  }> {
    const model = await this.loadModel(restaurantId);

    if (!model) {
      return { needed: true, reason: 'No active model exists' };
    }

    // Check model age (retrain if older than 14 days)
    const modelAge = Date.now() - model.trainedAt.getTime();
    const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 days

    if (modelAge > maxAge) {
      return { needed: true, reason: 'Model is older than 14 days' };
    }

    // Check accuracy trend
    if (model.accuracyTrend === AccuracyTrend.DEGRADING) {
      return { needed: true, reason: 'Model accuracy is degrading' };
    }

    // Check recent MAE vs training MAE
    if (model.recentMae && model.mae) {
      const degradation = (model.recentMae - model.mae) / model.mae;
      if (degradation > 0.2) { // 20% degradation threshold
        return { needed: true, reason: 'Recent MAE 20% higher than training MAE' };
      }
    }

    // Check predictions count (might indicate drift)
    if (model.predictionsCount > 10000) {
      return { needed: true, reason: 'Over 10,000 predictions since last training' };
    }

    return { needed: false };
  }

  /**
   * Get model evaluation report
   */
  async getModelEvaluation(restaurantId: string): Promise<ModelEvaluation | null> {
    const model = await this.loadModel(restaurantId);

    if (!model) {
      return null;
    }

    const { needed, reason } = await this.checkRetrainingNeeded(restaurantId);

    // Get previous model for comparison
    const previousModel = await this.prisma.mLModel.findFirst({
      where: {
        restaurantId,
        version: model.version - 1,
      },
    });

    let improvementOverPrevious: ModelEvaluation['improvementOverPrevious'];

    if (previousModel?.mae && model.mae) {
      improvementOverPrevious = {
        maeDelta: previousModel.mae - model.mae,
        mapeImprovement: previousModel.mape && model.mape
          ? ((previousModel.mape - model.mape) / previousModel.mape) * 100
          : 0,
      };
    }

    return {
      modelId: model.id,
      restaurantId,
      evaluatedAt: new Date(),
      metrics: {
        mae: model.mae || 0,
        rmse: model.rmse || 0,
        mape: model.mape || 0,
        r2Score: model.r2Score || 0,
      },
      needsRetraining: needed,
      retrainingReason: reason,
      improvementOverPrevious,
    };
  }

  /**
   * Clear model caches (for testing or forced refresh)
   */
  async clearCaches(restaurantId?: string): Promise<void> {
    if (restaurantId) {
      this.activeModels.delete(restaurantId);
      await this.redis.del(`ml:model:${restaurantId}`);
    } else {
      this.activeModels.clear();
      // Note: Would need pattern delete for Redis
    }
  }

  // ==================== Private Methods ====================

  /**
   * Convert Prisma model to MLModel type
   */
  private toMLModel(prismaModel: any): MLModel {
    return {
      id: prismaModel.id,
      restaurantId: prismaModel.restaurantId,
      version: prismaModel.version,
      modelType: prismaModel.modelType as ModelType,
      weights: prismaModel.weights,
      parameters: prismaModel.parameters,
      featureNames: prismaModel.featureNames,
      mae: prismaModel.mae,
      rmse: prismaModel.rmse,
      mape: prismaModel.mape,
      r2Score: prismaModel.r2Score,
      trainedAt: prismaModel.trainedAt,
      dataPointsUsed: prismaModel.dataPointsUsed,
      trainingDuration: prismaModel.trainingDuration,
      status: prismaModel.status as ModelStatus,
      predictionsCount: prismaModel.predictionsCount,
      lastPredictionAt: prismaModel.lastPredictionAt,
      recentMae: prismaModel.recentMae,
      accuracyTrend: prismaModel.accuracyTrend as AccuracyTrend,
      createdAt: prismaModel.createdAt,
      updatedAt: prismaModel.updatedAt,
    };
  }

  /**
   * Cache model to Redis
   */
  private async cacheModel(model: MLModel): Promise<void> {
    const redisKey = `ml:model:${model.restaurantId}`;
    await this.redis.setJson(redisKey, model, 3600); // 1 hour cache
  }
}
