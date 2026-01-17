/**
 * Worker Earnings Entity
 *
 * Tracks earnings from completed shifts for earned wage access calculations.
 * This entity mirrors the WorkerEarnings Prisma model.
 */

/**
 * Payout via method enum
 */
export enum PayoutVia {
  INSTANT = 'INSTANT',
  REGULAR = 'REGULAR',
}

/**
 * Earnings status enum
 */
export enum EarningsStatus {
  PENDING = 'PENDING',
  AVAILABLE = 'AVAILABLE',
  PAID_OUT = 'PAID_OUT',
}

/**
 * Worker Earnings entity interface
 */
export interface WorkerEarnings {
  id: string;
  workerId: string;
  restaurantId: string;

  // Shift reference
  shiftId: string;

  // Earnings details
  hoursWorked: number;
  hourlyRate: number;
  grossEarnings: number;
  tips?: number | null;
  totalEarnings: number;

  // Timing
  earnedAt: Date;

  // Payout tracking
  status: EarningsStatus;
  paidOut: boolean;
  paidOutAt?: Date | null;
  paidOutVia?: PayoutVia | null;
  transferId?: string | null;

  // Audit fields
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create worker earnings data
 */
export interface CreateWorkerEarningsData {
  workerId: string;
  restaurantId: string;
  shiftId: string;
  hoursWorked: number;
  hourlyRate: number;
  grossEarnings: number;
  tips?: number;
  earnedAt: Date;
}

/**
 * Update worker earnings data
 */
export interface UpdateWorkerEarningsData {
  status?: EarningsStatus;
  paidOut?: boolean;
  paidOutAt?: Date;
  paidOutVia?: PayoutVia;
  transferId?: string;
}

/**
 * Earnings summary for a worker
 */
export interface WorkerEarningsSummary {
  totalEarnings: number;
  totalHoursWorked: number;
  availableForTransfer: number;
  paidOutInstant: number;
  paidOutRegular: number;
  pendingEarnings: number;
  shiftCount: number;
}

/**
 * Pay period earnings summary
 */
export interface PayPeriodEarningsSummary {
  startDate: Date;
  endDate: Date;
  totalGrossEarnings: number;
  totalTips: number;
  totalHoursWorked: number;
  instantPayWithdrawals: number;
  regularPayAmount: number;
  shiftCount: number;
}

/**
 * Earnings filters for querying
 */
export interface EarningsFilters {
  workerId?: string;
  restaurantId?: string;
  shiftId?: string;
  status?: EarningsStatus[];
  paidOut?: boolean;
  paidOutVia?: PayoutVia;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Helper to calculate total earnings
 */
export function calculateTotalEarnings(grossEarnings: number, tips?: number): number {
  return grossEarnings + (tips || 0);
}

/**
 * Helper to calculate gross earnings from hours and rate
 */
export function calculateGrossEarnings(hoursWorked: number, hourlyRate: number): number {
  return Math.round(hoursWorked * hourlyRate * 100) / 100;
}

/**
 * Helper to check if earnings are available for transfer
 */
export function canTransferEarnings(earnings: WorkerEarnings): boolean {
  return earnings.status === EarningsStatus.AVAILABLE && !earnings.paidOut;
}

/**
 * Earnings aggregation by restaurant
 */
export interface EarningsByRestaurant {
  restaurantId: string;
  restaurantName: string;
  totalEarnings: number;
  hoursWorked: number;
  shiftCount: number;
  averageHourlyRate: number;
}

/**
 * Earnings aggregation by time period
 */
export interface EarningsByPeriod {
  period: string; // e.g., '2024-01-15' for daily, '2024-W03' for weekly
  totalEarnings: number;
  hoursWorked: number;
  shiftCount: number;
}
