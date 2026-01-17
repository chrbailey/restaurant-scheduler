/**
 * Opportunity Window Entity
 *
 * Tracks ghost kitchen opportunities identified by the forecasting system.
 * Records manager responses and actual results for optimization.
 */

export enum OpportunityStatus {
  /** System has identified and suggested this window */
  SUGGESTED = 'SUGGESTED',

  /** Manager accepted - shifts will be/have been created */
  ACCEPTED = 'ACCEPTED',

  /** Manager declined the suggestion */
  DECLINED = 'DECLINED',

  /** Window time passed without response */
  EXPIRED = 'EXPIRED',

  /** Currently running (ghost kitchen active) */
  IN_PROGRESS = 'IN_PROGRESS',

  /** Completed - actuals available */
  COMPLETED = 'COMPLETED',
}

export interface OpportunityWindow {
  id: string;
  restaurantId: string;

  /** Date of the opportunity */
  date: Date;

  /** Start time (HH:MM format) */
  startTime: string;

  /** End time (HH:MM format) */
  endTime: string;

  /** Opportunity score (0-100) */
  score: number;

  /** Current status */
  status: OpportunityStatus;

  /** Forecasted delivery orders during window */
  forecastedOrders: number;

  /** Actual orders received (filled after completion) */
  actualOrders: number | null;

  /** Recommended number of staff for this window */
  recommendedStaff: number;

  /** When manager was notified */
  notifiedAt: Date | null;

  /** When manager responded */
  respondedAt: Date | null;

  createdAt: Date;
}

/**
 * Opportunity scoring criteria
 */
export interface OpportunityScoringFactors {
  /** Delivery volume factor (0-40 points) */
  deliveryVolume: number;

  /** Low dine-in factor (0-25 points) */
  lowDineIn: number;

  /** Window duration factor (0-15 points) */
  duration: number;

  /** Forecast confidence factor (0-20 points) */
  confidence: number;
}

/**
 * Create opportunity window input
 */
export interface CreateOpportunityWindowInput {
  restaurantId: string;
  date: Date;
  startTime: string;
  endTime: string;
  score: number;
  forecastedOrders: number;
  recommendedStaff: number;
}

/**
 * Update opportunity status input
 */
export interface UpdateOpportunityStatusInput {
  status: OpportunityStatus;
  respondedAt?: Date;
  actualOrders?: number;
}

/**
 * Opportunity filter options
 */
export interface OpportunityWindowFilter {
  restaurantId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: OpportunityStatus[];
  minScore?: number;
}

/**
 * Opportunity performance metrics
 */
export interface OpportunityMetrics {
  /** Total opportunities identified */
  totalOpportunities: number;

  /** Number accepted by managers */
  acceptedCount: number;

  /** Acceptance rate percentage */
  acceptanceRate: number;

  /** Average opportunity score */
  avgScore: number;

  /** Average forecasted orders per opportunity */
  avgForecastedOrders: number;

  /** Average actual orders (for completed opportunities) */
  avgActualOrders: number;

  /** Forecast accuracy percentage */
  forecastAccuracy: number;

  /** Total revenue from accepted opportunities */
  totalRevenue: number;

  /** Average revenue per opportunity */
  avgRevenuePerOpportunity: number;
}

/**
 * Opportunity summary for dashboard
 */
export interface OpportunitySummary {
  id: string;
  date: string;
  timeRange: string;
  score: number;
  status: OpportunityStatus;
  forecastedOrders: number;
  actualOrders: number | null;
  potentialRevenue: number;
  actualRevenue: number | null;
  staffNeeded: number;
}

/**
 * Upcoming opportunities response
 */
export interface UpcomingOpportunities {
  today: OpportunitySummary[];
  tomorrow: OpportunitySummary[];
  thisWeek: OpportunitySummary[];
  totalPotentialRevenue: number;
}

/**
 * Opportunity response action
 */
export type OpportunityAction = 'ACCEPT' | 'DECLINE' | 'POSTPONE';

/**
 * Opportunity action response
 */
export interface OpportunityActionResult {
  success: boolean;
  opportunityId: string;
  action: OpportunityAction;
  message: string;
  shiftsCreated?: string[];
}
