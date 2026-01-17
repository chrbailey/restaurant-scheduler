import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { FeatureEngineeringService } from './feature-engineering.service';
import { ModelRegistryService } from './model-registry.service';
import {
  MLModel,
  ModelType,
  ModelStatus,
  AccuracyTrend,
  TrainingMetrics,
  TrainingRequest,
  TrainingResult,
  PredictionResult,
  FeatureVector,
  LinearModelWeights,
  GradientBoostWeights,
  GradientBoostTree,
  EnsembleWeights,
  ModelParameters,
  ModelEvaluation,
} from '../entities/ml-model.entity';

/**
 * ML Forecaster Service
 *
 * Enhanced ML-based demand forecasting using:
 * - Linear Regression (interpretable baseline)
 * - Gradient Boosting (tree-based, handles non-linearity)
 * - Ensemble (combines both for robustness)
 *
 * All models implemented in pure JavaScript/TypeScript for Node.js.
 */

// ==================== Constants ====================

const MIN_TRAINING_DAYS = 30;
const DEFAULT_LEARNING_RATE = 0.01;
const DEFAULT_MAX_ITERATIONS = 1000;
const DEFAULT_CONVERGENCE_THRESHOLD = 1e-6;
const DEFAULT_REGULARIZATION = 0.01;

// Gradient Boost defaults
const DEFAULT_NUM_TREES = 50;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MIN_SAMPLES_LEAF = 5;
const DEFAULT_SUBSAMPLE_RATIO = 0.8;

// Accuracy thresholds
const MAPE_THRESHOLD_GOOD = 15; // < 15% is good
const MAPE_THRESHOLD_ACCEPTABLE = 25; // < 25% is acceptable
const MAE_DEGRADATION_THRESHOLD = 0.2; // 20% increase triggers retraining

@Injectable()
export class MLForecasterService {
  private readonly logger = new Logger(MLForecasterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly featureEngineering: FeatureEngineeringService,
    private readonly modelRegistry: ModelRegistryService,
  ) {}

  /**
   * Train a new model for a restaurant
   */
  async trainModel(request: TrainingRequest): Promise<TrainingResult> {
    const { restaurantId, modelType = ModelType.ENSEMBLE, parameters = {}, minDataPoints = MIN_TRAINING_DAYS * 24, forceRetrain = false } = request;

    const startTime = Date.now();

    try {
      this.logger.log(`Starting model training for restaurant ${restaurantId}`);

      // Check if retraining is needed (unless forced)
      if (!forceRetrain) {
        const { needed, reason } = await this.modelRegistry.checkRetrainingNeeded(restaurantId);
        if (!needed) {
          this.logger.log(`Retraining not needed for ${restaurantId}`);
          return {
            success: false,
            trainingDuration: 0,
            dataPointsUsed: 0,
            error: 'Retraining not needed',
          };
        }
        this.logger.log(`Retraining reason: ${reason}`);
      }

      // Get training data
      const trainingData = await this.getTrainingData(restaurantId, minDataPoints);

      if (trainingData.length < minDataPoints) {
        return {
          success: false,
          trainingDuration: Date.now() - startTime,
          dataPointsUsed: trainingData.length,
          error: `Insufficient training data: ${trainingData.length} points (need ${minDataPoints})`,
        };
      }

      // Prepare features and targets
      const { X, yDineIn, yDelivery, featureNames } = this.prepareTrainingData(trainingData);

      // Train model based on type
      let weights: LinearModelWeights | GradientBoostWeights | EnsembleWeights;
      let metrics: TrainingMetrics;

      const modelParams: ModelParameters = {
        learningRate: parameters.learningRate ?? DEFAULT_LEARNING_RATE,
        maxIterations: parameters.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        convergenceThreshold: parameters.convergenceThreshold ?? DEFAULT_CONVERGENCE_THRESHOLD,
        regularization: parameters.regularization ?? DEFAULT_REGULARIZATION,
        numTrees: parameters.numTrees ?? DEFAULT_NUM_TREES,
        maxDepth: parameters.maxDepth ?? DEFAULT_MAX_DEPTH,
        minSamplesLeaf: parameters.minSamplesLeaf ?? DEFAULT_MIN_SAMPLES_LEAF,
        subsampleRatio: parameters.subsampleRatio ?? DEFAULT_SUBSAMPLE_RATIO,
        validationSplit: parameters.validationSplit ?? 0.2,
      };

      switch (modelType) {
        case ModelType.LINEAR:
          const linearResult = this.trainLinearModel(X, yDineIn, yDelivery, modelParams);
          weights = linearResult.weights;
          metrics = linearResult.metrics;
          break;

        case ModelType.GRADIENT_BOOST:
          const gbResult = this.trainGradientBoostModel(X, yDineIn, yDelivery, modelParams);
          weights = gbResult.weights;
          metrics = gbResult.metrics;
          break;

        case ModelType.ENSEMBLE:
        default:
          const ensembleResult = this.trainEnsembleModel(X, yDineIn, yDelivery, modelParams);
          weights = ensembleResult.weights;
          metrics = ensembleResult.metrics;
          break;
      }

      const trainingDuration = Date.now() - startTime;

      // Save model
      const model = await this.modelRegistry.saveModel({
        restaurantId,
        modelType,
        weights,
        parameters: modelParams,
        featureNames,
        metrics,
        dataPointsUsed: trainingData.length,
        trainingDuration,
      });

      this.logger.log(
        `Model training completed for ${restaurantId}: ` +
        `v${model.version}, MAE=${metrics.mae.toFixed(2)}, MAPE=${metrics.mape.toFixed(1)}%, ` +
        `duration=${trainingDuration}ms`,
      );

      return {
        success: true,
        modelId: model.id,
        version: model.version,
        metrics,
        trainingDuration,
        dataPointsUsed: trainingData.length,
      };

    } catch (error) {
      this.logger.error(`Model training failed for ${restaurantId}: ${error.message}`);
      return {
        success: false,
        trainingDuration: Date.now() - startTime,
        dataPointsUsed: 0,
        error: error.message,
      };
    }
  }

  /**
   * Generate prediction using trained model
   */
  async predict(
    restaurantId: string,
    date: Date,
    hourSlot?: number,
  ): Promise<PredictionResult[]> {
    const model = await this.modelRegistry.loadModel(restaurantId);

    if (!model) {
      throw new Error(`No active model for restaurant ${restaurantId}`);
    }

    // Extract features
    const featureVectors = await this.featureEngineering.extractFeatures(
      restaurantId,
      date,
      hourSlot,
    );

    const results: PredictionResult[] = [];

    for (const fv of featureVectors) {
      // Normalize features
      const normalized = this.featureEngineering.normalizeFeatures(fv);

      // Make prediction
      const { dineIn, delivery, confidence, contributions } = this.predictWithModel(
        model,
        normalized.features,
        normalized.featureNames,
      );

      results.push({
        restaurantId,
        date: fv.metadata.date,
        hourSlot: fv.metadata.hourSlot,
        predictedDineIn: Math.max(0, Math.round(dineIn)),
        predictedDelivery: Math.max(0, Math.round(delivery)),
        confidence,
        modelVersion: model.version,
        modelType: model.modelType,
        featureContributions: contributions,
        predictionInterval: this.calculatePredictionInterval(
          dineIn,
          delivery,
          model.mae || 5,
          0.95,
        ),
      });
    }

    // Record prediction
    await this.modelRegistry.recordPrediction(restaurantId);

    return results;
  }

  /**
   * Get feature importance for a model
   */
  async getFeatureImportance(restaurantId: string): Promise<Record<string, number>> {
    const model = await this.modelRegistry.loadModel(restaurantId);

    if (!model) {
      throw new Error(`No active model for restaurant ${restaurantId}`);
    }

    const importance: Record<string, number> = {};

    switch (model.modelType) {
      case ModelType.LINEAR:
        const linearWeights = model.weights as LinearModelWeights;
        // Absolute coefficient values as importance
        for (const [name, coef] of Object.entries(linearWeights.coefficients)) {
          importance[name] = Math.abs(coef);
        }
        break;

      case ModelType.GRADIENT_BOOST:
        const gbWeights = model.weights as GradientBoostWeights;
        // Count feature usage in trees
        const featureCounts = this.countFeatureUsage(gbWeights.trees, model.featureNames.length);
        for (let i = 0; i < model.featureNames.length; i++) {
          importance[model.featureNames[i]] = featureCounts[i] / gbWeights.trees.length;
        }
        break;

      case ModelType.ENSEMBLE:
        const ensembleWeights = model.weights as EnsembleWeights;
        // Combine importance from both models
        for (const [name, coef] of Object.entries(ensembleWeights.linear.coefficients)) {
          importance[name] = Math.abs(coef) * ensembleWeights.linearWeight;
        }
        const gbCounts = this.countFeatureUsage(
          ensembleWeights.gradientBoost.trees,
          model.featureNames.length,
        );
        for (let i = 0; i < model.featureNames.length; i++) {
          const gbImportance = gbCounts[i] / ensembleWeights.gradientBoost.trees.length;
          importance[model.featureNames[i]] =
            (importance[model.featureNames[i]] || 0) + gbImportance * ensembleWeights.gradientBoostWeight;
        }
        break;
    }

    // Normalize to sum to 1
    const total = Object.values(importance).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const key of Object.keys(importance)) {
        importance[key] /= total;
      }
    }

    // Sort by importance
    const sorted = Object.entries(importance)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});

    return sorted;
  }

  /**
   * Evaluate model performance
   */
  async evaluateModel(restaurantId: string): Promise<ModelEvaluation | null> {
    return this.modelRegistry.getModelEvaluation(restaurantId);
  }

  /**
   * Check if model needs retraining and retrain if necessary
   */
  async retrainIfNeeded(restaurantId: string): Promise<TrainingResult | null> {
    const { needed, reason } = await this.modelRegistry.checkRetrainingNeeded(restaurantId);

    if (!needed) {
      return null;
    }

    this.logger.log(`Retraining model for ${restaurantId}: ${reason}`);

    return this.trainModel({
      restaurantId,
      forceRetrain: true,
    });
  }

  /**
   * Update model performance metrics based on actual results
   */
  async updatePerformanceMetrics(
    restaurantId: string,
    recentPredictions: Array<{ predicted: number; actual: number }>,
  ): Promise<void> {
    if (recentPredictions.length === 0) return;

    // Calculate recent MAE
    const errors = recentPredictions.map(p => Math.abs(p.predicted - p.actual));
    const recentMae = errors.reduce((a, b) => a + b, 0) / errors.length;

    // Determine trend
    const model = await this.modelRegistry.loadModel(restaurantId);
    if (!model) return;

    let trend = AccuracyTrend.STABLE;

    if (model.mae) {
      const degradation = (recentMae - model.mae) / model.mae;

      if (degradation > MAE_DEGRADATION_THRESHOLD) {
        trend = AccuracyTrend.DEGRADING;
      } else if (degradation < -0.1) {
        trend = AccuracyTrend.IMPROVING;
      }
    }

    await this.modelRegistry.updateModelPerformance(restaurantId, recentMae, trend);
  }

  // ==================== Training Methods ====================

  /**
   * Train linear regression model using gradient descent
   */
  private trainLinearModel(
    X: number[][],
    yDineIn: number[],
    yDelivery: number[],
    params: ModelParameters,
  ): { weights: LinearModelWeights; metrics: TrainingMetrics } {
    const n = X.length;
    const numFeatures = X[0].length;

    // Initialize weights
    let interceptDineIn = 0;
    let interceptDelivery = 0;
    const coefficientsDineIn = new Array(numFeatures).fill(0);
    const coefficientsDelivery = new Array(numFeatures).fill(0);

    const lr = params.learningRate || DEFAULT_LEARNING_RATE;
    const maxIter = params.maxIterations || DEFAULT_MAX_ITERATIONS;
    const lambda = params.regularization || DEFAULT_REGULARIZATION;

    // Gradient descent
    for (let iter = 0; iter < maxIter; iter++) {
      let gradInterceptDineIn = 0;
      let gradInterceptDelivery = 0;
      const gradCoefDineIn = new Array(numFeatures).fill(0);
      const gradCoefDelivery = new Array(numFeatures).fill(0);

      for (let i = 0; i < n; i++) {
        const predDineIn = interceptDineIn + this.dotProduct(X[i], coefficientsDineIn);
        const predDelivery = interceptDelivery + this.dotProduct(X[i], coefficientsDelivery);

        const errorDineIn = predDineIn - yDineIn[i];
        const errorDelivery = predDelivery - yDelivery[i];

        gradInterceptDineIn += errorDineIn;
        gradInterceptDelivery += errorDelivery;

        for (let j = 0; j < numFeatures; j++) {
          gradCoefDineIn[j] += errorDineIn * X[i][j];
          gradCoefDelivery[j] += errorDelivery * X[i][j];
        }
      }

      // Update weights with L2 regularization
      interceptDineIn -= lr * gradInterceptDineIn / n;
      interceptDelivery -= lr * gradInterceptDelivery / n;

      for (let j = 0; j < numFeatures; j++) {
        coefficientsDineIn[j] -= lr * (gradCoefDineIn[j] / n + lambda * coefficientsDineIn[j]);
        coefficientsDelivery[j] -= lr * (gradCoefDelivery[j] / n + lambda * coefficientsDelivery[j]);
      }
    }

    // Average the coefficients for combined prediction
    const coefficients: Record<string, number> = {};
    const featureNames = this.featureEngineering.getFeatureNames();

    for (let j = 0; j < numFeatures; j++) {
      coefficients[featureNames[j]] = (coefficientsDineIn[j] + coefficientsDelivery[j]) / 2;
    }

    const weights: LinearModelWeights = {
      intercept: (interceptDineIn + interceptDelivery) / 2,
      coefficients,
    };

    // Calculate metrics
    const metrics = this.calculateMetrics(X, yDineIn, yDelivery, (x) => {
      const pred = weights.intercept + this.dotProduct(x, Object.values(weights.coefficients));
      return { dineIn: pred, delivery: pred };
    });

    return { weights, metrics };
  }

  /**
   * Train gradient boosting model
   */
  private trainGradientBoostModel(
    X: number[][],
    yDineIn: number[],
    yDelivery: number[],
    params: ModelParameters,
  ): { weights: GradientBoostWeights; metrics: TrainingMetrics } {
    const numTrees = params.numTrees || DEFAULT_NUM_TREES;
    const maxDepth = params.maxDepth || DEFAULT_MAX_DEPTH;
    const minSamples = params.minSamplesLeaf || DEFAULT_MIN_SAMPLES_LEAF;
    const subsample = params.subsampleRatio || DEFAULT_SUBSAMPLE_RATIO;
    const lr = params.learningRate || 0.1;

    // Combined target (average of dine-in and delivery)
    const y = yDineIn.map((d, i) => (d + yDelivery[i]) / 2);

    // Initialize predictions
    const initialPrediction = y.reduce((a, b) => a + b, 0) / y.length;
    let predictions = new Array(y.length).fill(initialPrediction);

    const trees: GradientBoostTree[] = [];

    for (let t = 0; t < numTrees; t++) {
      // Calculate residuals
      const residuals = y.map((actual, i) => actual - predictions[i]);

      // Subsample
      const sampleIndices = this.subsample(y.length, subsample);

      // Build tree on residuals
      const tree = this.buildDecisionTree(
        sampleIndices.map(i => X[i]),
        sampleIndices.map(i => residuals[i]),
        maxDepth,
        minSamples,
      );

      trees.push(tree);

      // Update predictions
      for (let i = 0; i < y.length; i++) {
        predictions[i] += lr * this.predictTree(tree, X[i]);
      }
    }

    const weights: GradientBoostWeights = {
      trees,
      learningRate: lr,
      initialPrediction,
    };

    // Calculate metrics
    const metrics = this.calculateMetrics(X, yDineIn, yDelivery, (x) => {
      const pred = this.predictGradientBoost(weights, x);
      return { dineIn: pred, delivery: pred };
    });

    return { weights, metrics };
  }

  /**
   * Train ensemble model (linear + gradient boost)
   */
  private trainEnsembleModel(
    X: number[][],
    yDineIn: number[],
    yDelivery: number[],
    params: ModelParameters,
  ): { weights: EnsembleWeights; metrics: TrainingMetrics } {
    // Train both base models
    const linearResult = this.trainLinearModel(X, yDineIn, yDelivery, params);
    const gbResult = this.trainGradientBoostModel(X, yDineIn, yDelivery, params);

    // Determine weights based on validation performance
    // Better model gets more weight
    const linearMape = linearResult.metrics.mape;
    const gbMape = gbResult.metrics.mape;

    const totalError = linearMape + gbMape;
    const linearWeight = totalError > 0 ? gbMape / totalError : 0.5; // Inverse error weighting
    const gbWeight = 1 - linearWeight;

    const weights: EnsembleWeights = {
      linear: linearResult.weights,
      gradientBoost: gbResult.weights,
      linearWeight,
      gradientBoostWeight: gbWeight,
    };

    // Calculate combined metrics
    const metrics = this.calculateMetrics(X, yDineIn, yDelivery, (x) => {
      const linearPred = linearResult.weights.intercept +
        this.dotProduct(x, Object.values(linearResult.weights.coefficients));
      const gbPred = this.predictGradientBoost(gbResult.weights, x);
      const combined = linearWeight * linearPred + gbWeight * gbPred;
      return { dineIn: combined, delivery: combined };
    });

    return { weights, metrics };
  }

  // ==================== Prediction Methods ====================

  /**
   * Make prediction with a trained model
   */
  private predictWithModel(
    model: MLModel,
    features: number[],
    featureNames: string[],
  ): { dineIn: number; delivery: number; confidence: number; contributions?: Record<string, number> } {
    let prediction: number;
    let contributions: Record<string, number> | undefined;

    switch (model.modelType) {
      case ModelType.LINEAR:
        const linear = model.weights as LinearModelWeights;
        prediction = linear.intercept;
        contributions = { intercept: linear.intercept };

        for (let i = 0; i < features.length; i++) {
          const name = featureNames[i];
          const contrib = (linear.coefficients[name] || 0) * features[i];
          prediction += contrib;
          contributions[name] = contrib;
        }
        break;

      case ModelType.GRADIENT_BOOST:
        const gb = model.weights as GradientBoostWeights;
        prediction = this.predictGradientBoost(gb, features);
        break;

      case ModelType.ENSEMBLE:
        const ensemble = model.weights as EnsembleWeights;
        const linearPred = ensemble.linear.intercept +
          this.dotProduct(features, featureNames.map(n => ensemble.linear.coefficients[n] || 0));
        const gbPred = this.predictGradientBoost(ensemble.gradientBoost, features);
        prediction = ensemble.linearWeight * linearPred + ensemble.gradientBoostWeight * gbPred;
        break;

      default:
        prediction = 0;
    }

    // Estimate confidence based on model metrics
    const mape = model.mape || 20;
    const confidence = Math.max(0.3, Math.min(0.95, 1 - mape / 100));

    return {
      dineIn: prediction,
      delivery: prediction,
      confidence,
      contributions,
    };
  }

  /**
   * Predict using gradient boost trees
   */
  private predictGradientBoost(weights: GradientBoostWeights, features: number[]): number {
    let prediction = weights.initialPrediction;

    for (const tree of weights.trees) {
      prediction += weights.learningRate * this.predictTree(tree, features);
    }

    return prediction;
  }

  /**
   * Predict using a single decision tree
   */
  private predictTree(tree: GradientBoostTree, features: number[]): number {
    if (!tree.leftChild && !tree.rightChild) {
      // Leaf node - return value
      return tree.leftValue; // Using leftValue as the leaf prediction
    }

    if (features[tree.featureIndex] <= tree.threshold) {
      return tree.leftChild ? this.predictTree(tree.leftChild, features) : tree.leftValue;
    } else {
      return tree.rightChild ? this.predictTree(tree.rightChild, features) : tree.rightValue;
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Get training data from database
   */
  private async getTrainingData(
    restaurantId: string,
    minPoints: number,
  ): Promise<Array<{ features: FeatureVector; actualDineIn: number; actualDelivery: number }>> {
    // Get historical forecasts with actuals
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        restaurantId,
        actualDineIn: { not: null },
        actualDelivery: { not: null },
      },
      orderBy: { date: 'desc' },
      take: minPoints * 2, // Get extra to ensure enough after filtering
    });

    // Get feature snapshots
    const snapshots = await this.prisma.featureSnapshot.findMany({
      where: { restaurantId },
      orderBy: { date: 'desc' },
      take: minPoints * 2,
    });

    // Build training data
    const trainingData: Array<{ features: FeatureVector; actualDineIn: number; actualDelivery: number }> = [];

    for (const snapshot of snapshots) {
      // Find matching forecast with actuals
      const forecast = forecasts.find(
        f => f.date.toISOString().split('T')[0] === snapshot.date.toISOString().split('T')[0] &&
          f.hourSlot === snapshot.hourSlot,
      );

      if (forecast && forecast.actualDineIn !== null && forecast.actualDelivery !== null) {
        const fv = await this.featureEngineering.extractFeatures(
          restaurantId,
          snapshot.date,
          snapshot.hourSlot,
        );

        if (fv.length > 0) {
          const normalized = this.featureEngineering.normalizeFeatures(fv[0]);
          trainingData.push({
            features: normalized,
            actualDineIn: forecast.actualDineIn,
            actualDelivery: forecast.actualDelivery,
          });
        }
      }
    }

    return trainingData;
  }

  /**
   * Prepare training data matrices
   */
  private prepareTrainingData(
    data: Array<{ features: FeatureVector; actualDineIn: number; actualDelivery: number }>,
  ): { X: number[][]; yDineIn: number[]; yDelivery: number[]; featureNames: string[] } {
    const X = data.map(d => d.features.features);
    const yDineIn = data.map(d => d.actualDineIn);
    const yDelivery = data.map(d => d.actualDelivery);
    const featureNames = data[0]?.features.featureNames || this.featureEngineering.getFeatureNames();

    return { X, yDineIn, yDelivery, featureNames };
  }

  /**
   * Build a decision tree
   */
  private buildDecisionTree(
    X: number[][],
    y: number[],
    maxDepth: number,
    minSamples: number,
    depth: number = 0,
  ): GradientBoostTree {
    const n = X.length;

    // Leaf node conditions
    if (depth >= maxDepth || n <= minSamples) {
      const mean = y.reduce((a, b) => a + b, 0) / n;
      return {
        featureIndex: 0,
        threshold: 0,
        leftValue: mean,
        rightValue: mean,
      };
    }

    // Find best split
    let bestFeature = 0;
    let bestThreshold = 0;
    let bestGain = -Infinity;
    let bestLeftIndices: number[] = [];
    let bestRightIndices: number[] = [];

    const numFeatures = X[0]?.length || 0;

    for (let f = 0; f < numFeatures; f++) {
      // Get unique thresholds
      const values = X.map(x => x[f]).sort((a, b) => a - b);
      const thresholds = [...new Set(values)];

      for (const threshold of thresholds) {
        const leftIndices = [];
        const rightIndices = [];

        for (let i = 0; i < n; i++) {
          if (X[i][f] <= threshold) {
            leftIndices.push(i);
          } else {
            rightIndices.push(i);
          }
        }

        if (leftIndices.length < minSamples || rightIndices.length < minSamples) {
          continue;
        }

        // Calculate gain (variance reduction)
        const leftY = leftIndices.map(i => y[i]);
        const rightY = rightIndices.map(i => y[i]);

        const totalVar = this.variance(y);
        const leftVar = this.variance(leftY);
        const rightVar = this.variance(rightY);

        const gain = totalVar -
          (leftY.length / n) * leftVar -
          (rightY.length / n) * rightVar;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
          bestLeftIndices = leftIndices;
          bestRightIndices = rightIndices;
        }
      }
    }

    // No good split found
    if (bestGain <= 0 || bestLeftIndices.length === 0 || bestRightIndices.length === 0) {
      const mean = y.reduce((a, b) => a + b, 0) / n;
      return {
        featureIndex: 0,
        threshold: 0,
        leftValue: mean,
        rightValue: mean,
      };
    }

    // Recursively build children
    const leftX = bestLeftIndices.map(i => X[i]);
    const leftY = bestLeftIndices.map(i => y[i]);
    const rightX = bestRightIndices.map(i => X[i]);
    const rightY = bestRightIndices.map(i => y[i]);

    return {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      leftValue: leftY.reduce((a, b) => a + b, 0) / leftY.length,
      rightValue: rightY.reduce((a, b) => a + b, 0) / rightY.length,
      leftChild: this.buildDecisionTree(leftX, leftY, maxDepth, minSamples, depth + 1),
      rightChild: this.buildDecisionTree(rightX, rightY, maxDepth, minSamples, depth + 1),
    };
  }

  /**
   * Calculate metrics for predictions
   */
  private calculateMetrics(
    X: number[][],
    yDineIn: number[],
    yDelivery: number[],
    predictFn: (x: number[]) => { dineIn: number; delivery: number },
  ): TrainingMetrics {
    let sumAbsError = 0;
    let sumSquaredError = 0;
    let sumAbsPercentError = 0;
    let sumSquaredY = 0;
    let sumY = 0;
    let count = 0;

    for (let i = 0; i < X.length; i++) {
      const pred = predictFn(X[i]);
      const actual = (yDineIn[i] + yDelivery[i]) / 2;
      const error = pred.dineIn - actual;

      sumAbsError += Math.abs(error);
      sumSquaredError += error * error;
      if (actual > 0) {
        sumAbsPercentError += Math.abs(error) / actual;
        count++;
      }
      sumY += actual;
      sumSquaredY += actual * actual;
    }

    const n = X.length;
    const meanY = sumY / n;
    const ssTot = sumSquaredY - n * meanY * meanY;

    return {
      mae: sumAbsError / n,
      rmse: Math.sqrt(sumSquaredError / n),
      mape: count > 0 ? (sumAbsPercentError / count) * 100 : 0,
      r2Score: ssTot > 0 ? 1 - sumSquaredError / ssTot : 0,
    };
  }

  /**
   * Calculate prediction interval
   */
  private calculatePredictionInterval(
    dineIn: number,
    delivery: number,
    mae: number,
    confidenceLevel: number,
  ): PredictionResult['predictionInterval'] {
    // Use z-score for confidence level (approximate)
    const z = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.90 ? 1.645 : 1.28;
    const margin = z * mae * 1.5; // Adjust for prediction uncertainty

    return {
      dineInLower: Math.max(0, dineIn - margin),
      dineInUpper: dineIn + margin,
      deliveryLower: Math.max(0, delivery - margin),
      deliveryUpper: delivery + margin,
      confidenceLevel,
    };
  }

  /**
   * Count feature usage in gradient boost trees
   */
  private countFeatureUsage(trees: GradientBoostTree[], numFeatures: number): number[] {
    const counts = new Array(numFeatures).fill(0);

    const countTree = (tree: GradientBoostTree) => {
      counts[tree.featureIndex]++;
      if (tree.leftChild) countTree(tree.leftChild);
      if (tree.rightChild) countTree(tree.rightChild);
    };

    for (const tree of trees) {
      countTree(tree);
    }

    return counts;
  }

  /**
   * Subsample indices
   */
  private subsample(n: number, ratio: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      if (Math.random() < ratio) {
        indices.push(i);
      }
    }
    return indices.length > 0 ? indices : [0]; // Ensure at least one sample
  }

  /**
   * Calculate dot product
   */
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Calculate variance
   */
  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }
}
