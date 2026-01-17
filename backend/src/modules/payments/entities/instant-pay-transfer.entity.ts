/**
 * Instant Pay Transfer Entity
 *
 * Tracks all instant pay transfer requests and their status.
 * This entity mirrors the InstantPayTransfer Prisma model.
 */

/**
 * Transfer status enum
 */
export enum TransferStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transfer method enum
 */
export enum TransferMethod {
  INSTANT = 'INSTANT',
  NEXT_DAY = 'NEXT_DAY',
}

/**
 * Instant Pay Transfer entity interface
 */
export interface InstantPayTransfer {
  id: string;
  workerId: string;
  restaurantId: string;

  // Transfer details
  amount: number;
  fee: number;
  netAmount: number;
  method: TransferMethod;

  // Status tracking
  status: TransferStatus;
  requestedAt: Date;
  processedAt?: Date | null;

  // External reference
  externalTransferId?: string | null;

  // Failure tracking
  failureReason?: string | null;
  failureCode?: string | null;

  // Audit fields
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create instant pay transfer data
 */
export interface CreateInstantPayTransferData {
  workerId: string;
  restaurantId: string;
  amount: number;
  fee: number;
  netAmount: number;
  method?: TransferMethod;
  externalTransferId?: string;
}

/**
 * Update instant pay transfer data
 */
export interface UpdateInstantPayTransferData {
  status?: TransferStatus;
  processedAt?: Date;
  externalTransferId?: string;
  failureReason?: string;
  failureCode?: string;
}

/**
 * Transfer summary for a worker
 */
export interface WorkerTransferSummary {
  totalTransfers: number;
  totalAmount: number;
  totalFees: number;
  totalNetAmount: number;
  pendingAmount: number;
  lastTransferAt?: Date | null;
}

/**
 * Transfer filters for querying
 */
export interface TransferFilters {
  workerId?: string;
  restaurantId?: string;
  status?: TransferStatus[];
  startDate?: Date;
  endDate?: Date;
}

/**
 * Helper to calculate net amount after fee
 */
export function calculateNetAmount(amount: number, fee: number): number {
  return Math.max(0, amount - fee);
}

/**
 * Helper to check if transfer can be cancelled
 */
export function canCancelTransfer(status: TransferStatus): boolean {
  return status === TransferStatus.PENDING;
}

/**
 * Helper to check if transfer is terminal (no more status changes expected)
 */
export function isTerminalStatus(status: TransferStatus): boolean {
  return [
    TransferStatus.COMPLETED,
    TransferStatus.FAILED,
    TransferStatus.CANCELLED,
  ].includes(status);
}
