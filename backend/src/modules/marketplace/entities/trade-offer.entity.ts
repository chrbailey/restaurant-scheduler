/**
 * Trade Offer Entity
 *
 * Represents a shift offer posted to the marketplace for trading.
 * Workers post their shifts with preferences for what they want in return.
 *
 * Status Flow:
 * OPEN -> MATCHED (when trade proposed) -> TRADED (trade completed)
 *      -> CANCELLED (owner cancelled) -> EXPIRED (TTL reached)
 */

/**
 * Trade offer status enum
 */
export enum TradeOfferStatus {
  /** Offer is open and accepting matches */
  OPEN = 'OPEN',
  /** Offer has a pending match proposal */
  MATCHED = 'MATCHED',
  /** Trade has been completed successfully */
  TRADED = 'TRADED',
  /** Offer was cancelled by the worker */
  CANCELLED = 'CANCELLED',
  /** Offer expired without being traded */
  EXPIRED = 'EXPIRED',
}

/**
 * Time slot preference
 */
export interface TimeSlotPreference {
  /** Preferred start time (HH:MM format) */
  startTime?: string;
  /** Preferred end time (HH:MM format) */
  endTime?: string;
  /** Minimum shift duration in hours */
  minDuration?: number;
  /** Maximum shift duration in hours */
  maxDuration?: number;
}

/**
 * Trade preferences for what the worker wants in return
 */
export interface TradePreferences {
  /** Preferred days of the week (0 = Sunday, 6 = Saturday) */
  daysOfWeek: number[];
  /** Preferred time slots */
  timeSlots: TimeSlotPreference[];
  /** Acceptable positions for the trade */
  positions: string[];
  /** Whether the worker is flexible on dates */
  flexibleDates: boolean;
  /** Preferred date range start */
  preferredDateFrom?: Date;
  /** Preferred date range end */
  preferredDateTo?: Date;
  /** Whether cross-restaurant trades are acceptable */
  allowCrossRestaurant?: boolean;
  /** Maximum distance in miles for cross-restaurant trades */
  maxDistanceMiles?: number;
  /** Additional notes about preferences */
  notes?: string;
}

/**
 * Trade offer entity representing a shift posted to the marketplace
 */
export interface TradeOffer {
  /** Unique identifier */
  id: string;
  /** Worker who owns this offer */
  workerId: string;
  /** Shift being offered */
  shiftId: string;
  /** Restaurant where the shift is located */
  restaurantId: string;
  /** Current status of the offer */
  status: TradeOfferStatus;
  /** Worker's preferences for what they want in return */
  preferences: TradePreferences;
  /** When the offer expires */
  expiresAt: Date;
  /** Number of times this offer has been viewed */
  viewCount: number;
  /** Number of workers who expressed interest */
  interestCount: number;
  /** When the offer was created */
  createdAt: Date;
  /** When the offer was last updated */
  updatedAt: Date;
}

/**
 * Trade offer with related data for display
 */
export interface TradeOfferWithDetails extends TradeOffer {
  /** Worker profile details */
  worker: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    reliabilityScore: number;
  };
  /** Shift details */
  shift: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    restaurantName: string;
  };
  /** Number of potential matches */
  matchCount?: number;
}

/**
 * Create trade offer parameters
 */
export interface CreateTradeOfferParams {
  workerId: string;
  shiftId: string;
  preferences: TradePreferences;
  expiresInHours?: number;
}

/**
 * Search filters for trade offers
 */
export interface TradeOfferSearchFilters {
  /** Filter by positions */
  positions?: string[];
  /** Filter by days of week */
  daysOfWeek?: number[];
  /** Filter by date range */
  dateFrom?: Date;
  dateTo?: Date;
  /** Filter by restaurant */
  restaurantId?: string;
  /** Include cross-restaurant offers */
  includeCrossRestaurant?: boolean;
  /** Maximum distance for cross-restaurant */
  maxDistanceMiles?: number;
  /** Filter by status */
  status?: TradeOfferStatus[];
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sort order */
  sortBy?: 'createdAt' | 'expiresAt' | 'viewCount' | 'interestCount';
  sortOrder?: 'asc' | 'desc';
}
