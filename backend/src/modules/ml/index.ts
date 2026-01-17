// Module
export { MLModule } from './ml.module';

// Services
export { MLForecasterService } from './services/ml-forecaster.service';
export { FeatureEngineeringService } from './services/feature-engineering.service';
export { EventAggregatorService } from './services/event-aggregator.service';
export { ModelRegistryService } from './services/model-registry.service';

// Jobs
export { ModelTrainingJob, TrainingJobType, TrainingJobData, TrainingJobResult } from './jobs/model-training.job';

// Entities and Types
export {
  // Model Types
  ModelType,
  ModelStatus,
  AccuracyTrend,
  // Weight Types
  LinearModelWeights,
  GradientBoostWeights,
  GradientBoostTree,
  EnsembleWeights,
  // Parameter and Metric Types
  ModelParameters,
  TrainingMetrics,
  // Entity Types
  MLModel,
  CachedEvent,
  FeatureSnapshot,
  FeatureVector,
  // Result Types
  PredictionResult,
  ModelEvaluation,
  TrainingRequest,
  TrainingResult,
  // Event Types
  EventCategory,
  EventSource,
} from './entities/ml-model.entity';

// Event Aggregator Types
export { LocalEvent, EventSearchParams, EventImpactResult } from './services/event-aggregator.service';

// Model Registry Types
export { ModelSaveRequest, ModelHistory, ActiveModelInfo } from './services/model-registry.service';
