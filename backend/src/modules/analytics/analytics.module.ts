import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Controllers
import { AnalyticsController } from './controllers/analytics.controller';

// Services
import { IntelligentMatcherService } from './services/intelligent-matcher.service';
import { LaborOptimizerService } from './services/labor-optimizer.service';
import { ForecastAccuracyService } from './services/forecast-accuracy.service';
import { WorkerAnalyticsService } from './services/worker-analytics.service';
import { DashboardAggregatorService } from './services/dashboard-aggregator.service';

// Jobs
import { AnalyticsSnapshotJob } from './jobs/analytics-snapshot.job';

// Common modules
import { PrismaModule } from '@/common/prisma/prisma.module';
import { RedisModule } from '@/common/redis/redis.module';

/**
 * Analytics Module
 *
 * Provides intelligent worker matching and advanced analytics:
 *
 * Intelligent Matching:
 * - Worker suggestions for open shifts based on multi-factor scoring
 * - Position qualification, availability, performance, reliability
 * - Distance, overtime risk, preference matching, team synergy
 * - Cost efficiency optimization
 *
 * Labor Optimization:
 * - Full labor cost breakdown by day, position, hour
 * - Overstaffing and understaffing detection
 * - AI-suggested optimal schedules
 * - Savings opportunity analysis
 * - Industry benchmark comparisons
 *
 * Forecast Accuracy:
 * - Predicted vs actual comparison
 * - Accuracy trends over time
 * - Weak point identification
 * - Factor-based accuracy breakdown
 *
 * Worker Analytics:
 * - Comprehensive performance reports
 * - Churn risk prediction
 * - Engagement scoring
 * - Retention action suggestions
 * - Team comparison metrics
 *
 * Executive Dashboard:
 * - High-level summary metrics
 * - Key performance indicators with trends
 * - Alerts requiring attention
 * - Restaurant comparisons
 * - Report exports (PDF, Excel, CSV, JSON)
 *
 * Daily Snapshots:
 * - Point-in-time metric capture
 * - Historical trend analysis
 * - Automated at midnight
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
  ],
  controllers: [
    AnalyticsController,
  ],
  providers: [
    // Core services
    IntelligentMatcherService,
    LaborOptimizerService,
    ForecastAccuracyService,
    WorkerAnalyticsService,
    DashboardAggregatorService,

    // Jobs
    AnalyticsSnapshotJob,
  ],
  exports: [
    // Export services for use by other modules
    IntelligentMatcherService,
    LaborOptimizerService,
    ForecastAccuracyService,
    WorkerAnalyticsService,
    DashboardAggregatorService,
    AnalyticsSnapshotJob,
  ],
})
export class AnalyticsModule {}
