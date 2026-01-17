/**
 * Trade Match Entity
 *
 * Represents a proposed trade between two workers.
 * One worker (offerer) has posted an offer, and another (acceptor)
 * proposes their shift in exchange.
 *
 * Status Flow:
 * PROPOSED -> ACCEPTED (acceptor agrees) -> COMPLETED (trade executed)
 *          -> REJECTED (acceptor declines)
 *          -> CANCELLED (either party cancels)
 *          -> EXPIRED (no response in time)
 */

/**
 * Trade match status enum
 */
export enum TradeMatchStatus {
  /** Trade has been proposed, awaiting response */
  PROPOSED = 'PROPOSED',
  /** Both parties have accepted the trade */
  ACCEPTED = 'ACCEPTED',
  /** Trade was rejected by the offerer */
  REJECTED = 'REJECTED',
  /** Trade was cancelled by either party */
  CANCELLED = 'CANCELLED',
  /** Trade was completed successfully */
  COMPLETED = 'COMPLETED',
  /** Trade proposal expired without response */
  EXPIRED = 'EXPIRED',
}

/**
 * Manager approval status
 */
export interface ManagerApproval {
  /** Whether manager approval is required */
  required: boolean;
  /** Whether approval has been granted */
  approved?: boolean;
  /** Manager who approved/rejected */
  approvedById?: string;
  /** When approval decision was made */
  approvedAt?: Date;
  /** Reason if rejected */
  rejectionReason?: string;
}

/**
 * Trade match entity representing a proposed trade
 */
export interface TradeMatch {
  /** Unique identifier */
  id: string;
  /** Reference to the trade offer */
  offerId: string;
  /** Worker who created the original offer */
  offererId: string;
  /** Shift being offered */
  offererShiftId: string;
  /** Worker proposing to accept the trade */
  acceptorId: string;
  /** Shift the acceptor is offering in exchange */
  acceptorShiftId: string;
  /** Current status of the trade */
  status: TradeMatchStatus;
  /** When the trade was proposed */
  proposedAt: Date;
  /** When a response was received */
  respondedAt?: Date;
  /** When the trade was completed */
  completedAt?: Date;
  /** Manager approval details */
  managerApproval: ManagerApproval;
  /** Compatibility score (0-100) */
  compatibilityScore?: number;
  /** Message from the proposer */
  message?: string;
  /** Reason for rejection if rejected */
  rejectionReason?: string;
  /** When the proposal expires */
  expiresAt: Date;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Trade match with related details for display
 */
export interface TradeMatchWithDetails extends TradeMatch {
  /** Offer details */
  offer: {
    id: string;
    status: string;
    preferences: any;
  };
  /** Offerer worker details */
  offerer: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    reliabilityScore: number;
  };
  /** Offerer shift details */
  offererShift: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    restaurantId: string;
    restaurantName: string;
  };
  /** Acceptor worker details */
  acceptor: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    reliabilityScore: number;
  };
  /** Acceptor shift details */
  acceptorShift: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    restaurantId: string;
    restaurantName: string;
  };
}

/**
 * Create trade match parameters
 */
export interface CreateTradeMatchParams {
  offerId: string;
  offererId: string;
  offererShiftId: string;
  acceptorId: string;
  acceptorShiftId: string;
  message?: string;
  expiresInHours?: number;
}

/**
 * Trade match search filters
 */
export interface TradeMatchSearchFilters {
  /** Filter by offerer */
  offererId?: string;
  /** Filter by acceptor */
  acceptorId?: string;
  /** Filter by status */
  status?: TradeMatchStatus[];
  /** Filter by restaurant */
  restaurantId?: string;
  /** Date range */
  dateFrom?: Date;
  dateTo?: Date;
  /** Pagination */
  limit?: number;
  offset?: number;
}
