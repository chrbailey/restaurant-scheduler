/**
 * Demand Forecast Entity
 *
 * Stores hourly demand forecasts for training and accuracy tracking.
 * Actual values are filled in after the fact for ML training.
 */

export interface DemandForecast {
  id: string;
  restaurantId: string;
  date: Date;
  hourSlot: number; // 0-23

  /** Forecasted dine-in covers for this hour */
  dineInForecast: number;

  /** Forecasted delivery orders for this hour */
  deliveryForecast: number;

  /** Weather adjustment applied (-1 to +1) */
  weatherAdjustment: number;

  /** Event adjustment applied (-1 to +1) */
  eventAdjustment: number;

  /** Confidence score (0-1) */
  confidence: number;

  /** Actual dine-in covers (filled after fact) */
  actualDineIn: number | null;

  /** Actual delivery orders (filled after fact) */
  actualDelivery: number | null;

  createdAt: Date;
}

/**
 * Forecast accuracy metrics
 */
export interface ForecastAccuracy {
  /** Mean Absolute Percentage Error for dine-in */
  dineInMAPE: number;

  /** Mean Absolute Percentage Error for delivery */
  deliveryMAPE: number;

  /** Bias (positive = overforecast, negative = underforecast) */
  dineInBias: number;
  deliveryBias: number;

  /** Sample count used for calculation */
  sampleCount: number;
}

/**
 * Forecast summary for a time period
 */
export interface ForecastSummary {
  restaurantId: string;
  startDate: string;
  endDate: string;

  /** Total forecasted values */
  totalDineInForecast: number;
  totalDeliveryForecast: number;

  /** Actual values (if available) */
  totalDineInActual: number | null;
  totalDeliveryActual: number | null;

  /** Peak hours */
  peakDineInHour: number;
  peakDeliveryHour: number;

  /** Average confidence */
  avgConfidence: number;

  /** Weather impact summary */
  avgWeatherImpact: number;

  /** Event impact summary */
  avgEventImpact: number;
}

/**
 * Create demand forecast input
 */
export interface CreateDemandForecastInput {
  restaurantId: string;
  date: Date;
  hourSlot: number;
  dineInForecast: number;
  deliveryForecast: number;
  weatherAdjustment?: number;
  eventAdjustment?: number;
  confidence?: number;
}

/**
 * Update demand forecast with actuals
 */
export interface UpdateDemandForecastActuals {
  actualDineIn: number;
  actualDelivery: number;
}

/**
 * Forecast filter options
 */
export interface DemandForecastFilter {
  restaurantId?: string;
  startDate?: Date;
  endDate?: Date;
  hourSlot?: number;
  minConfidence?: number;
  hasActuals?: boolean;
}

/**
 * Forecast comparison result
 */
export interface ForecastComparison {
  hour: number;
  forecasted: number;
  actual: number;
  difference: number;
  percentageError: number;
}
