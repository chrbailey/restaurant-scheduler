/**
 * ML Model Entity Types
 *
 * Type definitions for ML models used in demand forecasting.
 * These mirror the Prisma schema and provide runtime type safety.
 */

// ==================== Model Types ====================

export enum ModelType {
  LINEAR = 'LINEAR',
  GRADIENT_BOOST = 'GRADIENT_BOOST',
  ENSEMBLE = 'ENSEMBLE',
}

export enum ModelStatus {
  TRAINING = 'TRAINING',
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  FAILED = 'FAILED',
}

export enum AccuracyTrend {
  IMPROVING = 'IMPROVING',
  STABLE = 'STABLE',
  DEGRADING = 'DEGRADING',
}

// ==================== Linear Regression Weights ====================

export interface LinearModelWeights {
  intercept: number;
  coefficients: Record<string, number>; // Feature name -> coefficient
}

// ==================== Gradient Boosting Weights ====================

export interface GradientBoostTree {
  featureIndex: number;
  threshold: number;
  leftValue: number;
  rightValue: number;
  leftChild?: GradientBoostTree;
  rightChild?: GradientBoostTree;
}

export interface GradientBoostWeights {
  trees: GradientBoostTree[];
  learningRate: number;
  initialPrediction: number;
}

// ==================== Ensemble Weights ====================

export interface EnsembleWeights {
  linear: LinearModelWeights;
  gradientBoost: GradientBoostWeights;
  linearWeight: number; // Weight for linear model predictions
  gradientBoostWeight: number; // Weight for gradient boost predictions
}

// ==================== Model Parameters ====================

export interface ModelParameters {
  // Training configuration
  learningRate?: number;
  maxIterations?: number;
  convergenceThreshold?: number;
  regularization?: number; // L2 regularization strength

  // Gradient boost specific
  numTrees?: number;
  maxDepth?: number;
  minSamplesLeaf?: number;
  subsampleRatio?: number;

  // Feature configuration
  featureScaling?: 'none' | 'minmax' | 'zscore';
  missingValueStrategy?: 'zero' | 'mean' | 'median';

  // Validation
  validationSplit?: number; // Fraction for validation set
  earlyStoppingRounds?: number;
}

// ==================== Training Metrics ====================

export interface TrainingMetrics {
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Square Error
  mape: number; // Mean Absolute Percentage Error
  r2Score: number; // R-squared coefficient of determination

  // Optional detailed metrics
  trainingMae?: number;
  validationMae?: number;
  trainingLoss?: number[];
  validationLoss?: number[];
}

// ==================== ML Model Entity ====================

export interface MLModel {
  id: string;
  restaurantId: string;
  version: number;
  modelType: ModelType;

  // Weights stored as JSON
  weights: LinearModelWeights | GradientBoostWeights | EnsembleWeights;
  parameters: ModelParameters;
  featureNames: string[];

  // Metrics
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  r2Score: number | null;

  // Training metadata
  trainedAt: Date;
  dataPointsUsed: number;
  trainingDuration: number | null;

  // Status
  status: ModelStatus;

  // Prediction tracking
  predictionsCount: number;
  lastPredictionAt: Date | null;

  // Performance monitoring
  recentMae: number | null;
  accuracyTrend: AccuracyTrend;

  createdAt: Date;
  updatedAt: Date;
}

// ==================== Cached Event Entity ====================

export enum EventCategory {
  SPORTS = 'SPORTS',
  CONCERT = 'CONCERT',
  FESTIVAL = 'FESTIVAL',
  CONFERENCE = 'CONFERENCE',
  HOLIDAY = 'HOLIDAY',
  OTHER = 'OTHER',
}

export enum EventSource {
  PREDICTHQ = 'PREDICTHQ',
  TICKETMASTER = 'TICKETMASTER',
  MANUAL = 'MANUAL',
}

export interface CachedEvent {
  id: string;
  externalId: string;
  source: EventSource;

  name: string;
  category: EventCategory;
  subcategory: string | null;

  lat: number;
  lng: number;
  venue: string | null;
  city: string | null;
  state: string | null;

  startTime: Date;
  endTime: Date;
  timezone: string | null;

  expectedAttendance: number | null;
  rank: number | null;

  fetchedAt: Date;
  expiresAt: Date;
}

// ==================== Feature Snapshot Entity ====================

export interface FeatureSnapshot {
  id: string;
  restaurantId: string;
  date: Date;
  hourSlot: number;

  // Target variables
  actualDineIn: number | null;
  actualDelivery: number | null;

  // Temporal features
  dayOfWeek: number;
  weekOfYear: number;
  monthOfYear: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;

  // Weather features
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  cloudCover: number | null;
  weatherCondition: string | null;

  // Event features
  eventCount: number;
  totalAttendance: number;
  nearestEventDist: number | null;
  eventImpactScore: number;

  // Lag features
  lagDineIn1d: number | null;
  lagDineIn7d: number | null;
  lagDelivery1d: number | null;
  lagDelivery7d: number | null;

  // Rolling averages
  avgDineIn7d: number | null;
  avgDelivery7d: number | null;
  avgDineIn28d: number | null;
  avgDelivery28d: number | null;

  // Trend features
  dineInTrend: number | null;
  deliveryTrend: number | null;

  createdAt: Date;
}

// ==================== Feature Vector ====================

/**
 * Normalized feature vector ready for ML model input
 */
export interface FeatureVector {
  features: number[];
  featureNames: string[];
  metadata: {
    restaurantId: string;
    date: string;
    hourSlot: number;
    rawSnapshot?: FeatureSnapshot;
  };
}

// ==================== Prediction Result ====================

export interface PredictionResult {
  restaurantId: string;
  date: string;
  hourSlot: number;

  predictedDineIn: number;
  predictedDelivery: number;

  confidence: number;
  modelVersion: number;
  modelType: ModelType;

  // Feature contributions (for explainability)
  featureContributions?: Record<string, number>;

  // Uncertainty estimates
  predictionInterval?: {
    dineInLower: number;
    dineInUpper: number;
    deliveryLower: number;
    deliveryUpper: number;
    confidenceLevel: number; // e.g., 0.95 for 95% CI
  };
}

// ==================== Model Evaluation ====================

export interface ModelEvaluation {
  modelId: string;
  restaurantId: string;
  evaluatedAt: Date;

  // Overall metrics
  metrics: TrainingMetrics;

  // Breakdown by time periods
  metricsByDayOfWeek?: Record<number, TrainingMetrics>;
  metricsByHour?: Record<number, TrainingMetrics>;

  // Recommendations
  needsRetraining: boolean;
  retrainingReason?: string;

  // Comparison with previous version
  improvementOverPrevious?: {
    maeDelta: number;
    mapeImprovement: number;
  };
}

// ==================== Training Request ====================

export interface TrainingRequest {
  restaurantId: string;
  modelType?: ModelType;
  parameters?: Partial<ModelParameters>;
  minDataPoints?: number;
  forceRetrain?: boolean;
}

// ==================== Training Result ====================

export interface TrainingResult {
  success: boolean;
  modelId?: string;
  version?: number;
  metrics?: TrainingMetrics;
  trainingDuration: number;
  dataPointsUsed: number;
  error?: string;
}
