/**
 * Analytics Snapshot Entity
 *
 * Represents point-in-time metrics captured daily for historical analysis.
 * This entity mirrors the Prisma AnalyticsSnapshot model and provides
 * TypeScript interfaces for the application layer.
 */

/**
 * Snapshot metadata stored as JSON
 */
export interface SnapshotMetadata {
  // Shift breakdown
  shiftsScheduled?: number;
  shiftsCompleted?: number;
  shiftsCancelled?: number;
  shiftsNoShow?: number;

  // Position breakdown
  laborByPosition?: Record<string, {
    hours: number;
    cost: number;
    workerCount: number;
  }>;

  // Time breakdown
  laborByDayOfWeek?: Record<number, {
    hours: number;
    cost: number;
  }>;

  // Overtime details
  overtimeHours?: number;
  overtimeCost?: number;
  workersWithOvertime?: number;

  // Worker metrics
  topPerformers?: {
    workerId: string;
    name: string;
    metric: string;
    value: number;
  }[];
  atRiskWorkers?: {
    workerId: string;
    name: string;
    churnRiskScore: number;
  }[];

  // Forecast details
  forecastMAPE?: number;
  forecastBias?: number;

  // Ghost kitchen (if applicable)
  ghostKitchenOrders?: number;
  ghostKitchenRevenue?: number;

  // Notes and flags
  notes?: string;
  flags?: string[];
}

/**
 * Analytics Snapshot status
 */
export enum SnapshotStatus {
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
  PARTIAL = 'PARTIAL',
  ERROR = 'ERROR',
}

/**
 * Analytics Snapshot entity
 */
export interface AnalyticsSnapshot {
  id: string;
  restaurantId: string;
  date: Date;

  // Core metrics
  laborCost: number;
  laborHours: number;
  revenue: number | null;

  // Calculated ratios
  laborAsPercentOfRevenue: number | null;
  costPerHour: number;

  // Forecast metrics
  forecastAccuracy: number | null;
  coverageScore: number | null;

  // Worker metrics
  workerCount: number;
  avgReliability: number | null;

  // Flexible metadata
  metadata: SnapshotMetadata;

  // Status tracking
  status: SnapshotStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create snapshot input
 */
export interface CreateSnapshotInput {
  restaurantId: string;
  date: Date;
  laborCost: number;
  laborHours: number;
  revenue?: number;
  forecastAccuracy?: number;
  coverageScore?: number;
  workerCount: number;
  avgReliability?: number;
  metadata?: SnapshotMetadata;
}

/**
 * Snapshot query filters
 */
export interface SnapshotQueryFilters {
  restaurantId: string;
  startDate?: Date;
  endDate?: Date;
  status?: SnapshotStatus;
}

/**
 * Snapshot aggregation result
 */
export interface SnapshotAggregation {
  restaurantId: string;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startDate: Date;
  endDate: Date;
  metrics: {
    totalLaborCost: number;
    totalLaborHours: number;
    totalRevenue: number | null;
    avgLaborCostPerDay: number;
    avgLaborHoursPerDay: number;
    avgForecastAccuracy: number | null;
    avgCoverageScore: number | null;
    avgWorkerCount: number;
    avgReliability: number | null;
  };
  trends: {
    laborCostTrend: number;
    laborHoursTrend: number;
    accuracyTrend: number | null;
  };
  snapshotCount: number;
}

/**
 * Snapshot comparison between periods
 */
export interface SnapshotComparison {
  restaurantId: string;
  period1: {
    startDate: Date;
    endDate: Date;
    metrics: SnapshotAggregation['metrics'];
  };
  period2: {
    startDate: Date;
    endDate: Date;
    metrics: SnapshotAggregation['metrics'];
  };
  differences: {
    metric: string;
    period1Value: number;
    period2Value: number;
    absoluteDifference: number;
    percentDifference: number;
    improved: boolean;
  }[];
}

/**
 * Helper function to calculate cost per hour
 */
export function calculateCostPerHour(laborCost: number, laborHours: number): number {
  if (laborHours === 0) return 0;
  return Math.round((laborCost / laborHours) * 100) / 100;
}

/**
 * Helper function to calculate labor as percent of revenue
 */
export function calculateLaborPercentOfRevenue(
  laborCost: number,
  revenue: number | null,
): number | null {
  if (revenue === null || revenue === 0) return null;
  return Math.round((laborCost / revenue) * 10000) / 100;
}

/**
 * Helper function to validate snapshot data
 */
export function validateSnapshotData(input: CreateSnapshotInput): string[] {
  const errors: string[] = [];

  if (!input.restaurantId) {
    errors.push('Restaurant ID is required');
  }

  if (!input.date) {
    errors.push('Date is required');
  }

  if (input.laborCost < 0) {
    errors.push('Labor cost cannot be negative');
  }

  if (input.laborHours < 0) {
    errors.push('Labor hours cannot be negative');
  }

  if (input.revenue !== undefined && input.revenue < 0) {
    errors.push('Revenue cannot be negative');
  }

  if (input.forecastAccuracy !== undefined &&
    (input.forecastAccuracy < 0 || input.forecastAccuracy > 100)) {
    errors.push('Forecast accuracy must be between 0 and 100');
  }

  if (input.coverageScore !== undefined &&
    (input.coverageScore < 0 || input.coverageScore > 100)) {
    errors.push('Coverage score must be between 0 and 100');
  }

  if (input.workerCount < 0) {
    errors.push('Worker count cannot be negative');
  }

  if (input.avgReliability !== undefined &&
    (input.avgReliability < 0 || input.avgReliability > 5)) {
    errors.push('Average reliability must be between 0 and 5');
  }

  return errors;
}

/**
 * Default metadata template
 */
export const DEFAULT_SNAPSHOT_METADATA: SnapshotMetadata = {
  shiftsScheduled: 0,
  shiftsCompleted: 0,
  shiftsCancelled: 0,
  shiftsNoShow: 0,
  laborByPosition: {},
  laborByDayOfWeek: {},
  overtimeHours: 0,
  overtimeCost: 0,
  workersWithOvertime: 0,
  topPerformers: [],
  atRiskWorkers: [],
  notes: '',
  flags: [],
};
