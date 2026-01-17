/**
 * API Request/Response Types
 *
 * These types define the contract between frontend and backend.
 */

/** Standard API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    hasMore?: boolean;
  };
}

/** API error structure */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  validationErrors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/** Paginated list request */
export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Date range filter */
export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

// ==================== AUTH ====================

export interface LoginRequest {
  phone: string;
}

export interface VerifyOtpRequest {
  phone: string;
  code: string;
  deviceId: string;
  deviceName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ==================== SHIFTS ====================

export interface CreateShiftRequest {
  restaurantId: string;
  position: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  notes?: string;
  autoApprove?: boolean;
  minReputationScore?: number;
  hourlyRateOverride?: number;
  type?: string;
}

export interface UpdateShiftRequest {
  position?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  notes?: string;
  autoApprove?: boolean;
  minReputationScore?: number;
  hourlyRateOverride?: number;
}

export interface PublishShiftsRequest {
  shiftIds: string[];
}

export interface AssignShiftRequest {
  workerId: string;
  notify?: boolean;
}

export interface OfferShiftRequest {
  workerIds: string[];
  expiresInHours?: number;
  message?: string;
}

export interface ListShiftsRequest extends PaginatedRequest, DateRangeFilter {
  restaurantId?: string;
  status?: string[];
  position?: string[];
  workerId?: string;
  includeNetwork?: boolean;
}

// ==================== SHIFT CLAIMS ====================

export interface ClaimShiftRequest {
  shiftId: string;
  workerProfileId: string;
  notes?: string;
}

export interface ResolveClaimRequest {
  approved: boolean;
  reason?: string;
}

export interface ListClaimsRequest extends PaginatedRequest {
  shiftId?: string;
  workerId?: string;
  status?: string[];
}

// ==================== SHIFT SWAPS ====================

export interface CreateSwapRequest {
  sourceShiftId: string;
  targetWorkerId?: string;
  targetShiftId?: string;
  message?: string;
}

export interface RespondToSwapRequest {
  accepted: boolean;
  message?: string;
}

export interface ApproveSwapRequest {
  approved: boolean;
  reason?: string;
}

// ==================== AVAILABILITY ====================

export interface SetAvailabilityRequest {
  workerProfileId: string;
  availability: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isPreferred: boolean;
  }[];
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface TimeOffRequestCreate {
  workerProfileId: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

// ==================== WORKER PROFILES ====================

export interface CreateWorkerProfileRequest {
  userId: string;
  restaurantId: string;
  role: string;
  tier: string;
  positions: string[];
  hourlyRate: number;
}

export interface UpdateWorkerProfileRequest {
  role?: string;
  tier?: string;
  positions?: string[];
  hourlyRate?: number;
  status?: string;
}

export interface InviteWorkerRequest {
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: string;
  positions: string[];
  hourlyRate: number;
}

// ==================== RESTAURANTS ====================

export interface CreateRestaurantRequest {
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  timezone: string;
  phone: string;
  email: string;
}

export interface UpdateRestaurantSettingsRequest {
  shiftSettings?: {
    requireClaimApproval?: boolean;
    autoApproveThreshold?: number;
    networkVisibilityHours?: number;
    minReputationScore?: number;
    allowCrossRestaurantSwaps?: boolean;
  };
  ghostKitchenConfig?: {
    maxConcurrentOrders?: number;
    enabledPlatforms?: string[];
    autoDisableThreshold?: number;
  };
}

// ==================== NETWORKS ====================

export interface CreateNetworkRequest {
  name: string;
  description?: string;
}

export interface InviteToNetworkRequest {
  restaurantId: string;
}

export interface UpdateNetworkSettingsRequest {
  enableCrossRestaurantShifts?: boolean;
  requireCrossRestaurantApproval?: boolean;
  maxDistanceMiles?: number;
  minNetworkReputationScore?: number;
}

// ==================== GHOST KITCHEN ====================

export interface EnableGhostModeRequest {
  endTime?: string;
  platforms?: string[];
  maxOrders?: number;
}

export interface GhostModeStatus {
  enabled: boolean;
  enabledAt?: string;
  endTime?: string;
  currentOrders: number;
  maxOrders: number;
  platforms: string[];
  utilizationPercent: number;
}

// ==================== ANALYTICS ====================

export interface ScheduleAnalyticsRequest extends DateRangeFilter {
  restaurantId: string;
}

export interface ScheduleAnalytics {
  totalShifts: number;
  filledShifts: number;
  openShifts: number;
  coverageRate: number;
  noShowCount: number;
  swapCount: number;
  claimCount: number;
  averageClaimTime: number; // minutes
  laborCost: number;
  laborHours: number;
  byPosition: {
    position: string;
    count: number;
    fillRate: number;
  }[];
  byDay: {
    date: string;
    scheduledHours: number;
    actualHours: number;
  }[];
}

export interface GhostKitchenAnalytics {
  totalSessions: number;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  averagePrepTime: number;
  peakHours: { hour: number; orders: number }[];
  byPlatform: {
    platform: string;
    orders: number;
    revenue: number;
  }[];
}
