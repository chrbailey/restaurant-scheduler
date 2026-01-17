/**
 * Shift Lifecycle States
 *
 * State machine transitions:
 * DRAFT → PUBLISHED_UNASSIGNED → PUBLISHED_CLAIMED → CONFIRMED → IN_PROGRESS → COMPLETED
 *                  ↓                    ↓
 *           PUBLISHED_OFFERED    (swap/trade flows)
 *                  ↓
 *            back to pool
 */
export enum ShiftStatus {
  /** Initial creation by manager, not yet visible to workers */
  DRAFT = 'DRAFT',
  /** Published and available for claiming */
  PUBLISHED_UNASSIGNED = 'PUBLISHED_UNASSIGNED',
  /** Offered to specific worker(s), awaiting response */
  PUBLISHED_OFFERED = 'PUBLISHED_OFFERED',
  /** Worker claimed, awaiting confirmation (if required) */
  PUBLISHED_CLAIMED = 'PUBLISHED_CLAIMED',
  /** Fully confirmed and scheduled */
  CONFIRMED = 'CONFIRMED',
  /** Worker has clocked in, shift is active */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Shift completed successfully */
  COMPLETED = 'COMPLETED',
  /** Shift was cancelled */
  CANCELLED = 'CANCELLED',
  /** Worker no-showed */
  NO_SHOW = 'NO_SHOW',
}

/** Valid state transitions for shift state machine */
export const SHIFT_TRANSITIONS: Record<ShiftStatus, ShiftStatus[]> = {
  [ShiftStatus.DRAFT]: [ShiftStatus.PUBLISHED_UNASSIGNED, ShiftStatus.CANCELLED],
  [ShiftStatus.PUBLISHED_UNASSIGNED]: [
    ShiftStatus.PUBLISHED_OFFERED,
    ShiftStatus.PUBLISHED_CLAIMED,
    ShiftStatus.CANCELLED,
  ],
  [ShiftStatus.PUBLISHED_OFFERED]: [
    ShiftStatus.PUBLISHED_CLAIMED,
    ShiftStatus.PUBLISHED_UNASSIGNED, // Offer declined/expired
    ShiftStatus.CANCELLED,
  ],
  [ShiftStatus.PUBLISHED_CLAIMED]: [
    ShiftStatus.CONFIRMED,
    ShiftStatus.PUBLISHED_UNASSIGNED, // Claim rejected
    ShiftStatus.CANCELLED,
  ],
  [ShiftStatus.CONFIRMED]: [
    ShiftStatus.IN_PROGRESS,
    ShiftStatus.PUBLISHED_UNASSIGNED, // Released back to pool
    ShiftStatus.CANCELLED,
    ShiftStatus.NO_SHOW,
  ],
  [ShiftStatus.IN_PROGRESS]: [ShiftStatus.COMPLETED, ShiftStatus.NO_SHOW],
  [ShiftStatus.COMPLETED]: [],
  [ShiftStatus.CANCELLED]: [],
  [ShiftStatus.NO_SHOW]: [],
};

/** Shift type distinguishes regular vs ghost kitchen shifts */
export enum ShiftType {
  DINE_IN = 'DINE_IN',
  GHOST_KITCHEN = 'GHOST_KITCHEN',
  HYBRID = 'HYBRID', // Can flex between both
}

/** Position types common in restaurants */
export enum Position {
  SERVER = 'SERVER',
  BARTENDER = 'BARTENDER',
  HOST = 'HOST',
  LINE_COOK = 'LINE_COOK',
  PREP_COOK = 'PREP_COOK',
  DISHWASHER = 'DISHWASHER',
  BUSSER = 'BUSSER',
  EXPO = 'EXPO',
  DELIVERY_PACK = 'DELIVERY_PACK', // Ghost kitchen packing
  MANAGER = 'MANAGER',
  GENERAL_MANAGER = 'GENERAL_MANAGER',
}

/** Core shift interface */
export interface Shift {
  id: string;
  restaurantId: string;
  position: Position;
  status: ShiftStatus;
  type: ShiftType;

  /** Scheduled start time (ISO 8601) */
  startTime: string;
  /** Scheduled end time (ISO 8601) */
  endTime: string;

  /** Break duration in minutes */
  breakMinutes: number;

  /** Assigned worker (null if unassigned) */
  assignedWorkerId: string | null;

  /** Workers who have been offered this shift */
  offeredToWorkerIds: string[];

  /** Notes from manager */
  notes: string | null;

  /** Whether auto-approval is enabled for claims */
  autoApprove: boolean;

  /** Minimum reputation score required to claim (0-5) */
  minReputationScore: number | null;

  /** Hourly rate override (null = use worker's default) */
  hourlyRateOverride: number | null;

  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

/** Shift claim request from a worker */
export interface ShiftClaim {
  id: string;
  shiftId: string;
  workerId: string;
  workerProfileId: string;

  /** Calculated priority score */
  priorityScore: number;

  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

  /** Reason for rejection if applicable */
  rejectionReason: string | null;

  claimedAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
}

/** Shift swap request between workers */
export interface ShiftSwap {
  id: string;

  /** Shift being given up */
  sourceShiftId: string;
  sourceWorkerId: string;

  /** Target shift or worker */
  targetShiftId: string | null; // If trading shifts
  targetWorkerId: string | null; // If direct swap

  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

  /** Whether manager approval is required */
  requiresApproval: boolean;

  /** Manager approval status */
  managerApproved: boolean | null;
  approvedByUserId: string | null;

  /** Optional message from requester */
  message: string | null;

  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
}

/** Priority scoring factors for shift claims */
export interface ClaimPriorityFactors {
  /** +1000 if own employee */
  isOwnEmployee: boolean;
  /** +100 if in primary tier */
  isPrimaryTier: boolean;
  /** 0-500 based on 1-5 rating (100 points per star) */
  reputationScore: number;
  /** +50 if reliability > 4.5 */
  reliabilityBonus: boolean;
  /** -25 per no-show incident */
  noShowCount: number;
  /** +1 per minute early, max 60 */
  claimTimeBonus: number;
}

/** Calculate total priority score from factors */
export function calculatePriorityScore(factors: ClaimPriorityFactors): number {
  let score = 0;

  if (factors.isOwnEmployee) score += 1000;
  if (factors.isPrimaryTier) score += 100;
  score += factors.reputationScore * 100; // Convert 1-5 to 0-500
  if (factors.reliabilityBonus) score += 50;
  score -= factors.noShowCount * 25;
  score += Math.min(factors.claimTimeBonus, 60);

  return Math.max(0, score); // Never negative
}
