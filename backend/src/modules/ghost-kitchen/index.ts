/**
 * Ghost Kitchen Module Exports
 *
 * Provides ghost kitchen / delivery-only mode functionality
 * with KitchenHub integration for order aggregation.
 */

// Module
export { GhostKitchenModule } from './ghost-kitchen.module';

// Services
export { GhostKitchenService } from './services/ghost-kitchen.service';
export { OrderService } from './services/order.service';
export { CapacityService } from './services/capacity.service';

// Forecasting Services
export {
  DemandForecasterService,
  HourlyForecast,
  DailyForecast,
  HistoricalPattern,
  LocalEvent,
} from './services/demand-forecaster.service';

export {
  OpportunityDetectorService,
  OpportunityStatus,
  OpportunityWindow,
  OpportunityCriteria,
} from './services/opportunity-detector.service';

export {
  StaffingRecommenderService,
  StaffingRecommendation,
  HourlyStaffing,
  SuggestedShift,
  ShiftAdjustment,
  AvailableWorker,
} from './services/staffing-recommender.service';

export {
  WeatherService,
  WeatherConditions,
  WeatherForecast,
  DailyWeather,
} from './services/weather.service';

// Jobs
export {
  ForecastJob,
  ForecastJobData,
  ForecastJobResult,
} from './jobs/forecast.job';

// Clients
export { KitchenHubClient } from './clients/kitchenhub.client';

// DTOs
export {
  KitchenHubOrderDto,
  KitchenHubMenuItemDto,
  OrderStatusUpdateDto,
  DeliveryPartnerDto,
  OrderStatus,
  OrderItemDto,
  OrderCustomerDto,
  DriverInfoDto,
  MenuAvailabilityUpdateDto,
  OrderHistoryQueryDto,
  OrderMetricsDto,
  OrderCreatedWebhookDto,
  OrderCancelledWebhookDto,
  DriverAssignedWebhookDto,
  DriverArrivedWebhookDto,
} from './dto/kitchenhub.dto';

// Entities
export {
  GhostOrder,
  GhostOrderStatus,
  GhostOrderItem,
  GhostOrderCustomer,
  GhostOrderDriver,
  OrderCancellationReason,
  isOrderActive,
  isOrderTerminal,
  isValidStatusTransition,
  calculatePrepTime,
  ORDER_STATUS_TRANSITIONS,
} from './entities/ghost-order.entity';

// Forecast Entities
export {
  DemandForecast,
  ForecastAccuracy,
  ForecastSummary,
  CreateDemandForecastInput,
  UpdateDemandForecastActuals,
  DemandForecastFilter,
  ForecastComparison,
} from './entities/demand-forecast.entity';

export {
  OpportunityStatus as OpportunityWindowStatus,
  OpportunityWindow as OpportunityWindowEntity,
  OpportunityScoringFactors,
  CreateOpportunityWindowInput,
  UpdateOpportunityStatusInput,
  OpportunityWindowFilter,
  OpportunityMetrics,
  OpportunitySummary,
  UpcomingOpportunities,
  OpportunityAction,
  OpportunityActionResult,
} from './entities/opportunity-window.entity';

// Config
export {
  kitchenhubConfig,
  DeliveryPlatform,
  KITCHENHUB_DEFAULTS,
} from './config/kitchenhub.config';
