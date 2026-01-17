/**
 * Ghost Kitchen Session Entity Types
 *
 * Type definitions for ghost kitchen sessions and related configuration.
 */

/**
 * Session status enum
 */
export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

/**
 * Session end reason enum
 */
export enum SessionEndReason {
  MANUAL = 'MANUAL',
  CAPACITY = 'CAPACITY',
  SCHEDULED = 'SCHEDULED',
  ERROR = 'ERROR',
}

/**
 * Supported delivery platforms
 */
export enum DeliveryPlatform {
  DOORDASH = 'DOORDASH',
  UBEREATS = 'UBEREATS',
  GRUBHUB = 'GRUBHUB',
}

/**
 * Platform fee configuration
 */
export interface PlatformFeeConfig {
  platform: DeliveryPlatform;
  commissionPercent: number; // e.g., 15 for 15%
  flatFee?: number; // Optional flat fee per order
}

/**
 * Default platform fees (can be overridden per restaurant)
 */
export const DEFAULT_PLATFORM_FEES: Record<DeliveryPlatform, PlatformFeeConfig> = {
  [DeliveryPlatform.DOORDASH]: {
    platform: DeliveryPlatform.DOORDASH,
    commissionPercent: 15,
    flatFee: 0,
  },
  [DeliveryPlatform.UBEREATS]: {
    platform: DeliveryPlatform.UBEREATS,
    commissionPercent: 30,
    flatFee: 0,
  },
  [DeliveryPlatform.GRUBHUB]: {
    platform: DeliveryPlatform.GRUBHUB,
    commissionPercent: 20,
    flatFee: 0,
  },
};

/**
 * Ghost mode configuration options
 */
export interface GhostModeConfig {
  maxOrders: number;
  endTime?: Date;
  autoAccept: boolean;
  minPrepTime: number; // Minimum prep time in minutes to quote
  platforms: DeliveryPlatform[];
  platformFees?: PlatformFeeConfig[];
  supplyPackagingCost?: number; // Cost per order for packaging/supplies
}

/**
 * Default ghost mode configuration
 */
export const DEFAULT_GHOST_MODE_CONFIG: GhostModeConfig = {
  maxOrders: 20,
  autoAccept: true,
  minPrepTime: 15,
  platforms: [DeliveryPlatform.DOORDASH, DeliveryPlatform.UBEREATS, DeliveryPlatform.GRUBHUB],
  supplyPackagingCost: 1.50,
};

/**
 * Platform breakdown statistics
 */
export interface PlatformBreakdown {
  platform: DeliveryPlatform;
  orders: number;
  revenue: number;
  fees: number;
  averagePrepTime?: number;
}

/**
 * Session statistics
 */
export interface SessionStats {
  totalOrders: number;
  totalRevenue: number;
  totalPrepTime: number;
  avgPrepTime: number | null;
  peakConcurrentOrders: number;
  peakUtilization: number | null;
  completedOrders: number;
  cancelledOrders: number;
  platformBreakdown: PlatformBreakdown[];
}

/**
 * Session P&L (Profit and Loss) summary
 */
export interface SessionPnL {
  sessionId: string;
  revenue: number;
  platformFees: number;
  laborCost: number;
  supplyCost: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number; // Percentage
}

/**
 * Ghost mode status response
 */
export interface GhostModeStatus {
  enabled: boolean;
  status: SessionStatus | null;
  sessionId: string | null;
  startedAt: Date | null;
  scheduledEndAt: Date | null;
  pausedAt: Date | null;
  pauseEndTime: Date | null;
  currentOrders: number;
  maxOrders: number;
  utilizationPercent: number;
  platforms: DeliveryPlatform[];
  config: GhostModeConfig | null;
}

/**
 * Forecast opportunity
 */
export interface ForecastOpportunity {
  id: string;
  date: Date;
  dayOfWeek: number;
  timeSlot: string; // e.g., "18:00-22:00"
  predictedOrders: number;
  predictedRevenue: number;
  confidence: number; // 0-100%
  historicalAverage: number;
  factors: string[]; // e.g., ["weekend", "game_day", "weather_good"]
  staffingRecommendation: StaffingRecommendation;
}

/**
 * Staffing recommendation for ghost kitchen shifts
 */
export interface StaffingRecommendation {
  minWorkers: number;
  optimalWorkers: number;
  positions: string[];
  estimatedLaborCost: number;
  estimatedRevenuePerWorker: number;
}

/**
 * Date range filter for analytics
 */
export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}
