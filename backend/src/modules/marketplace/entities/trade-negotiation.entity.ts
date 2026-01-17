/**
 * Trade Negotiation Entity
 *
 * Represents a multi-step negotiation session between two workers.
 * Unlike a simple accept/reject trade match, negotiations allow
 * back-and-forth counter-offers and term adjustments.
 *
 * Status Flow:
 * ACTIVE -> AGREED (both parties accept final terms)
 *        -> CANCELLED (either party cancels)
 *        -> EXPIRED (no activity before deadline)
 */

/**
 * Negotiation status enum
 */
export enum TradeNegotiationStatus {
  /** Negotiation is active with ongoing discussion */
  ACTIVE = 'ACTIVE',
  /** Both parties agreed on terms */
  AGREED = 'AGREED',
  /** Negotiation was cancelled by one party */
  CANCELLED = 'CANCELLED',
  /** Negotiation expired due to inactivity */
  EXPIRED = 'EXPIRED',
}

/**
 * Negotiation message type
 */
export enum NegotiationMessageType {
  /** Initial proposal */
  PROPOSAL = 'PROPOSAL',
  /** Counter-offer with new terms */
  COUNTER_OFFER = 'COUNTER_OFFER',
  /** Acceptance of current terms */
  ACCEPTANCE = 'ACCEPTANCE',
  /** General message/question */
  MESSAGE = 'MESSAGE',
  /** System message (e.g., reminders) */
  SYSTEM = 'SYSTEM',
}

/**
 * Negotiation terms being discussed
 */
export interface NegotiationTerms {
  /** First party's shift ID */
  shift1Id: string;
  /** Second party's shift ID */
  shift2Id: string;
  /** Any additional compensation (e.g., monetary adjustment) */
  compensation?: {
    type: 'NONE' | 'CASH' | 'FUTURE_FAVOR';
    amount?: number;
    description?: string;
  };
  /** Additional conditions */
  conditions?: string[];
  /** Proposed execution date */
  effectiveDate?: Date;
  /** Who proposed these terms */
  proposedById: string;
  /** When these terms were proposed */
  proposedAt: Date;
}

/**
 * Individual message in negotiation history
 */
export interface NegotiationMessage {
  /** Unique message identifier */
  id: string;
  /** Message type */
  type: NegotiationMessageType;
  /** Worker who sent the message (null for system messages) */
  senderId?: string;
  /** Message content */
  content: string;
  /** Updated terms if this is a counter-offer */
  terms?: Partial<NegotiationTerms>;
  /** When the message was sent */
  sentAt: Date;
  /** Whether the message has been read by the other party */
  read: boolean;
  /** When the message was read */
  readAt?: Date;
}

/**
 * Trade negotiation entity
 */
export interface TradeNegotiation {
  /** Unique identifier */
  id: string;
  /** First trade offer ID */
  offer1Id: string;
  /** Second trade offer ID (if applicable) */
  offer2Id?: string;
  /** First participant worker ID */
  participant1Id: string;
  /** Second participant worker ID */
  participant2Id: string;
  /** Current status */
  status: TradeNegotiationStatus;
  /** Current negotiation terms */
  currentTerms: NegotiationTerms;
  /** Negotiation message history */
  messages: NegotiationMessage[];
  /** Who's turn it is to respond */
  pendingResponseFrom?: string;
  /** When the negotiation expires */
  expiresAt: Date;
  /** When participant 1 last responded */
  participant1LastActiveAt?: Date;
  /** When participant 2 last responded */
  participant2LastActiveAt?: Date;
  /** Who cancelled (if cancelled) */
  cancelledById?: string;
  /** Cancellation reason */
  cancellationReason?: string;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Negotiation with related details for display
 */
export interface TradeNegotiationWithDetails extends TradeNegotiation {
  /** First participant details */
  participant1: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    reliabilityScore: number;
  };
  /** Second participant details */
  participant2: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    reliabilityScore: number;
  };
  /** First participant's shift details */
  shift1: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    restaurantName: string;
  };
  /** Second participant's shift details */
  shift2: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    restaurantName: string;
  };
  /** Unread message count for current user */
  unreadCount?: number;
}

/**
 * Create negotiation parameters
 */
export interface CreateNegotiationParams {
  offer1Id: string;
  offer2Id?: string;
  participant1Id: string;
  participant2Id: string;
  initialTerms: NegotiationTerms;
  initialMessage?: string;
  expiresInHours?: number;
}

/**
 * Counter offer parameters
 */
export interface CounterOfferParams {
  negotiationId: string;
  workerId: string;
  newTerms: Partial<NegotiationTerms>;
  message?: string;
}

/**
 * Negotiation search filters
 */
export interface NegotiationSearchFilters {
  /** Filter by participant */
  participantId?: string;
  /** Filter by status */
  status?: TradeNegotiationStatus[];
  /** Only show where it's my turn */
  pendingMyResponse?: boolean;
  /** Date range */
  dateFrom?: Date;
  dateTo?: Date;
  /** Pagination */
  limit?: number;
  offset?: number;
}
