import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { MLForecasterService } from './services/ml-forecaster.service';
import { FeatureEngineeringService } from './services/feature-engineering.service';
import { EventAggregatorService } from './services/event-aggregator.service';
import { ModelRegistryService } from './services/model-registry.service';

// Jobs
import { ModelTrainingJob } from './jobs/model-training.job';

// Common modules
import { PrismaModule } from '@/common/prisma/prisma.module';
import { RedisModule } from '@/common/redis/redis.module';

// Ghost Kitchen module (for WeatherService dependency)
import { GhostKitchenModule } from '@/modules/ghost-kitchen/ghost-kitchen.module';

/**
 * ML Module
 *
 * Provides machine learning enhanced demand forecasting:
 *
 * - Feature Engineering: Temporal, weather, event, and lag features
 * - Model Training: Linear regression, gradient boosting, ensemble
 * - Model Registry: Versioning, rollback, performance monitoring
 * - Event Aggregation: PredictHQ, Ticketmaster integration
 * - Scheduled Training: Weekly retraining, accuracy monitoring
 *
 * Key Services:
 * - MLForecasterService: Core ML forecasting and training
 * - FeatureEngineeringService: Feature extraction and normalization
 * - EventAggregatorService: Local event data aggregation
 * - ModelRegistryService: Model persistence and versioning
 * - ModelTrainingJob: BullMQ job for scheduled training
 *
 * Features Considered:
 * - Day of week, hour of day (cyclical encoding)
 * - Weather (temperature, precipitation, conditions)
 * - Local events (sports, concerts, festivals, conferences)
 * - Historical patterns (lag features, rolling averages)
 * - Holidays and special dates
 * - Seasonal trends
 *
 * Model Types:
 * - LINEAR: Interpretable baseline with regularization
 * - GRADIENT_BOOST: Tree-based for non-linear patterns
 * - ENSEMBLE: Weighted combination for robustness
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    forwardRef(() => GhostKitchenModule), // For WeatherService
  ],
  providers: [
    // Core services
    MLForecasterService,
    FeatureEngineeringService,
    EventAggregatorService,
    ModelRegistryService,

    // Jobs
    ModelTrainingJob,
  ],
  exports: [
    MLForecasterService,
    FeatureEngineeringService,
    EventAggregatorService,
    ModelRegistryService,
    ModelTrainingJob,
  ],
})
export class MLModule {}
