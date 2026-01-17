import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import Constants from 'expo-constants';

/**
 * API Client
 *
 * Axios instance with automatic token refresh and error handling.
 */

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retrying, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const { refreshToken, deviceId, setTokens, logout } = useAuthStore.getState();

      if (refreshToken && deviceId) {
        try {
          const response = await axios.post(`${API_URL}/auth/token/refresh`, {
            refreshToken,
            deviceId,
          });

          const { accessToken, refreshToken: newRefreshToken, expiresAt } = response.data;
          setTokens(accessToken, newRefreshToken, expiresAt);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, logout user
          logout();
          return Promise.reject(refreshError);
        }
      } else {
        logout();
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ==================== Auth API ====================

export const authApi = {
  requestOtp: (phone: string) => api.post('/auth/otp/request', { phone }),

  verifyOtp: (phone: string, code: string, deviceId: string, deviceName?: string) =>
    api.post('/auth/otp/verify', { phone, code, deviceId, deviceName }),

  refreshToken: (refreshToken: string, deviceId: string) =>
    api.post('/auth/token/refresh', { refreshToken, deviceId }),

  updateFcmToken: (token: string, deviceId: string) =>
    api.post('/auth/fcm-token', { token, deviceId }),

  logout: (refreshToken: string, allDevices = false) =>
    api.post('/auth/logout', { refreshToken, allDevices }),
};

// ==================== User API ====================

export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: { firstName?: string; lastName?: string; timezone?: string }) =>
    api.put('/users/me', data),
  getRestaurants: () => api.get('/users/me/restaurants'),
  getNotificationPrefs: () => api.get('/users/me/notification-preferences'),
  updateNotificationPrefs: (data: any) => api.put('/users/me/notification-preferences', data),
};

// ==================== Shifts API ====================

export const shiftsApi = {
  list: (restaurantId: string, params?: {
    status?: string[];
    startDate?: string;
    endDate?: string;
    workerId?: string;
  }) => api.get(`/restaurants/${restaurantId}/shifts`, { params }),

  getWeek: (restaurantId: string, weekStart: string, includeNetwork = false) =>
    api.get(`/restaurants/${restaurantId}/shifts/week`, {
      params: { weekStart, includeNetwork },
    }),

  get: (restaurantId: string, shiftId: string) =>
    api.get(`/restaurants/${restaurantId}/shifts/${shiftId}`),

  clockIn: (restaurantId: string, shiftId: string) =>
    api.post(`/restaurants/${restaurantId}/shifts/${shiftId}/clock-in`),

  clockOut: (restaurantId: string, shiftId: string) =>
    api.post(`/restaurants/${restaurantId}/shifts/${shiftId}/clock-out`),
};

// ==================== Pool API ====================

export const poolApi = {
  getAvailable: (params?: {
    position?: string[];
    startDate?: string;
    endDate?: string;
    includeNetwork?: boolean;
  }) => api.get('/pool/available', { params }),

  claim: (restaurantId: string, shiftId: string, notes?: string) =>
    api.post(`/restaurants/${restaurantId}/claims`, { shiftId, notes }),

  getMyClaims: (restaurantId: string, status?: string) =>
    api.get(`/restaurants/${restaurantId}/claims/mine`, { params: { status } }),

  withdrawClaim: (restaurantId: string, claimId: string) =>
    api.delete(`/restaurants/${restaurantId}/claims/${claimId}`),
};

// ==================== Swaps API ====================

export const swapsApi = {
  create: (restaurantId: string, data: {
    shiftId: string;
    targetWorkerId?: string;
    targetShiftId?: string;
    message?: string;
  }) => api.post(`/restaurants/${restaurantId}/swaps`, data),

  dropToPool: (restaurantId: string, shiftId: string, reason?: string) =>
    api.post(`/restaurants/${restaurantId}/swaps/drop`, { shiftId, reason }),

  getMySwaps: (restaurantId: string, status?: string) =>
    api.get(`/restaurants/${restaurantId}/swaps/mine`, { params: { status } }),

  respond: (restaurantId: string, swapId: string, accepted: boolean, message?: string) =>
    api.post(`/restaurants/${restaurantId}/swaps/${swapId}/respond`, { accepted, message }),

  cancel: (restaurantId: string, swapId: string) =>
    api.delete(`/restaurants/${restaurantId}/swaps/${swapId}`),
};

// ==================== Notifications API ====================

export const notificationsApi = {
  list: (unreadOnly = false, limit = 50) =>
    api.get('/notifications', { params: { unreadOnly, limit } }),

  getUnreadCount: () => api.get('/notifications/unread-count'),

  markAsRead: (id: string) => api.post(`/notifications/${id}/read`),

  markAllAsRead: () => api.post('/notifications/read-all'),
};

// ==================== Network API ====================

export const networkApi = {
  // Get all networks the current worker belongs to
  getMyNetworks: () => api.get('/networks/mine'),

  // Get available shifts across a network
  getNetworkShifts: (
    networkId: string,
    params?: {
      position?: string[];
      startDate?: string;
      endDate?: string;
      restaurantId?: string;
    },
  ) => api.get(`/networks/${networkId}/shifts`, { params }),

  // Claim a shift at another restaurant in the network
  claimNetworkShift: (
    networkId: string,
    shiftId: string,
    restaurantId: string,
    notes?: string,
  ) =>
    api.post(`/networks/${networkId}/shifts/${shiftId}/claim`, {
      restaurantId,
      notes,
    }),

  // Get all cross-training certifications for the current worker
  getMyCrossTrainings: () => api.get('/cross-training/mine'),

  // Request cross-training certification at another restaurant
  requestCrossTraining: (restaurantId: string, positions: string[]) =>
    api.post('/cross-training/request', { restaurantId, positions }),

  // Get cross-training status for a specific restaurant
  getCrossTrainingStatus: (restaurantId: string) =>
    api.get(`/cross-training/status/${restaurantId}`),

  // Get network restaurants with shift counts and cross-training status
  getNetworkRestaurants: (networkId: string) =>
    api.get(`/networks/${networkId}/restaurants`),

  // Get worker's network stats (reputation, total shifts, etc.)
  getNetworkStats: () => api.get('/networks/stats'),
};

// ==================== Ghost Kitchen API ====================

export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED';
export type DeliveryPlatform = 'DOORDASH' | 'UBEREATS' | 'GRUBHUB' | 'INTERNAL';

export interface GhostKitchenSession {
  id: string;
  restaurantId: string;
  isActive: boolean;
  startedAt: string;
  endedAt?: string;
  activeOrderCount: number;
  totalOrdersCompleted: number;
}

export interface GhostKitchenOrder {
  id: string;
  orderNumber: string;
  platform: DeliveryPlatform;
  status: OrderStatus;
  customerFirstName: string;
  items: GhostOrderItem[];
  specialInstructions?: string;
  receivedAt: string;
  acceptedAt?: string;
  prepStartedAt?: string;
  readyAt?: string;
  pickedUpAt?: string;
  estimatedPrepTime?: number;
  driver?: {
    name: string;
    vehicle?: string;
    eta?: string;
  };
}

export interface GhostOrderItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: string[];
  specialInstructions?: string;
}

export interface GhostShift {
  id: string;
  position: 'DELIVERY_PACK';
  startTime: string;
  endTime: string;
  hourlyRateOverride: number | null;
  expectedOrderVolume?: 'LOW' | 'MEDIUM' | 'HIGH' | 'SURGE';
  isGhostKitchen: true;
  restaurant: {
    id: string;
    name: string;
    timezone: string;
  };
}

export interface GhostSessionStats {
  sessionDuration: number; // minutes
  ordersCompleted: number;
  ordersInQueue: number;
  avgPrepTime: number; // minutes
  currentStreak: number;
  peakOrdersPerHour: number;
}

export const ghostKitchenApi = {
  // Check if ghost kitchen mode is active for a restaurant
  getActiveSession: (restaurantId: string) =>
    api.get<GhostKitchenSession>(`/restaurants/${restaurantId}/ghost-kitchen/session`),

  // Get available ghost kitchen delivery shifts
  getGhostShifts: (restaurantId: string, params?: {
    startDate?: string;
    endDate?: string;
  }) => api.get<GhostShift[]>(`/restaurants/${restaurantId}/ghost-kitchen/shifts`, { params }),

  // Claim a ghost kitchen delivery shift
  claimGhostShift: (restaurantId: string, shiftId: string, notes?: string) =>
    api.post(`/restaurants/${restaurantId}/ghost-kitchen/shifts/${shiftId}/claim`, { notes }),

  // Get orders assigned to the current worker
  getMyActiveOrders: (restaurantId: string) =>
    api.get<GhostKitchenOrder[]>(`/restaurants/${restaurantId}/ghost-kitchen/orders/mine`),

  // Update order status (worker action)
  updateOrderStatus: (restaurantId: string, orderId: string, status: OrderStatus) =>
    api.patch(`/restaurants/${restaurantId}/ghost-kitchen/orders/${orderId}/status`, { status }),

  // Get current session statistics
  getSessionStats: (restaurantId: string) =>
    api.get<GhostSessionStats>(`/restaurants/${restaurantId}/ghost-kitchen/session/stats`),

  // Get single order details
  getOrder: (restaurantId: string, orderId: string) =>
    api.get<GhostKitchenOrder>(`/restaurants/${restaurantId}/ghost-kitchen/orders/${orderId}`),

  // Report an issue with an order
  reportIssue: (restaurantId: string, orderId: string, issue: {
    type: 'MISSING_ITEM' | 'WRONG_ITEM' | 'QUALITY_ISSUE' | 'CUSTOMER_REQUEST' | 'OTHER';
    description: string;
  }) => api.post(`/restaurants/${restaurantId}/ghost-kitchen/orders/${orderId}/issue`, issue),

  // Pause/resume worker's ghost kitchen availability
  setPauseStatus: (restaurantId: string, isPaused: boolean, reason?: string) =>
    api.post(`/restaurants/${restaurantId}/ghost-kitchen/pause`, { isPaused, reason }),
};

// ==================== Payments/Instant Pay API ====================

export type TransferStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface EarnedBalance {
  available: number;
  pending: number;
  total: number;
  currency: string;
  lastUpdated: string;
  contributingShifts: ContributingShift[];
}

export interface ContributingShift {
  id: string;
  date: string;
  hours: number;
  earnings: number;
  position: string;
  restaurantName: string;
  status: 'PENDING' | 'AVAILABLE';
}

export interface Transfer {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: TransferStatus;
  requestedAt: string;
  processedAt?: string;
  completedAt?: string;
  failureReason?: string;
  destination: {
    type: 'BANK_ACCOUNT' | 'DEBIT_CARD';
    last4: string;
    bankName?: string;
  };
}

export interface InstantPayEnrollment {
  isEnrolled: boolean;
  enrolledAt?: string;
  paymentMethod?: {
    type: 'BANK_ACCOUNT' | 'DEBIT_CARD';
    last4: string;
    bankName?: string;
    isDefault: boolean;
  };
  feeStructure: {
    flatFee: number;
    percentFee: number;
    minTransfer: number;
    maxTransfer: number;
  };
}

export const paymentsApi = {
  // Get current earned balance available for instant pay
  getEarnedBalance: () =>
    api.get<EarnedBalance>('/payments/earned-balance'),

  // Request an instant pay transfer
  requestTransfer: (amount: number, notes?: string) =>
    api.post<Transfer>('/payments/transfers', { amount, notes }),

  // Get transfer history
  getTransferHistory: (params?: {
    status?: TransferStatus;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => api.get<Transfer[]>('/payments/transfers', { params }),

  // Get single transfer details
  getTransfer: (transferId: string) =>
    api.get<Transfer>(`/payments/transfers/${transferId}`),

  // Get instant pay enrollment status
  getEnrollmentStatus: () =>
    api.get<InstantPayEnrollment>('/payments/instant-pay/enrollment'),

  // Enroll in instant pay (DailyPay)
  enrollInstantPay: (data: {
    accountType: 'BANK_ACCOUNT' | 'DEBIT_CARD';
    routingNumber?: string;
    accountNumber?: string;
    cardNumber?: string;
    expiryMonth?: string;
    expiryYear?: string;
    acceptedTerms: boolean;
  }) => api.post('/payments/instant-pay/enroll', data),

  // Update payment method
  updatePaymentMethod: (data: {
    accountType: 'BANK_ACCOUNT' | 'DEBIT_CARD';
    routingNumber?: string;
    accountNumber?: string;
    cardNumber?: string;
    expiryMonth?: string;
    expiryYear?: string;
  }) => api.put('/payments/instant-pay/payment-method', data),

  // Cancel pending transfer
  cancelTransfer: (transferId: string) =>
    api.delete(`/payments/transfers/${transferId}`),
};

// ==================== Marketplace/Trade API ====================

export type TradeOfferStatus = 'ACTIVE' | 'MATCHED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
export type TradeProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'OVERNIGHT';

export interface TradePreferences {
  daysOfWeek?: DayOfWeek[];
  timeSlots?: TimeSlot[];
  positions?: string[];
  flexibleOnDates?: boolean;
  notes?: string;
}

export interface TradeOffer {
  id: string;
  status: TradeOfferStatus;
  shift: {
    id: string;
    position: string;
    startTime: string;
    endTime: string;
    restaurant: {
      id: string;
      name: string;
    };
  };
  preferences: TradePreferences;
  worker: {
    id: string;
    firstName: string;
    lastName: string;
  };
  interestCount: number;
  matchCount: number;
  createdAt: string;
  expiresAt: string;
}

export interface TradeProposal {
  id: string;
  status: TradeProposalStatus;
  offer: TradeOffer;
  proposedShift: {
    id: string;
    position: string;
    startTime: string;
    endTime: string;
    restaurant: {
      id: string;
      name: string;
    };
  };
  proposer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  message?: string;
  createdAt: string;
  respondedAt?: string;
  rejectionReason?: string;
}

export interface TradeMatch {
  id: string;
  shift: {
    id: string;
    position: string;
    startTime: string;
    endTime: string;
    restaurant: {
      id: string;
      name: string;
    };
  };
  compatibilityScore: number;
  reasons: string[];
}

export interface RecommendedTrade {
  offer: TradeOffer;
  matchingShifts: TradeMatch[];
  recommendationScore: number;
  reason: string;
}

export const marketplaceApi = {
  // Get all active trade offers (with filters)
  getTradeOffers: (params?: {
    dayOfWeek?: DayOfWeek[];
    timeSlot?: TimeSlot[];
    position?: string[];
    restaurantId?: string;
    limit?: number;
    offset?: number;
  }) => api.get<TradeOffer[]>('/marketplace/offers', { params }),

  // Create a new trade offer
  createTradeOffer: (shiftId: string, preferences: TradePreferences) =>
    api.post<TradeOffer>('/marketplace/offers', { shiftId, preferences }),

  // Get my trade offers
  getMyOffers: (status?: TradeOfferStatus) =>
    api.get<TradeOffer[]>('/marketplace/offers/mine', { params: { status } }),

  // Get single offer details
  getOffer: (offerId: string) =>
    api.get<TradeOffer>(`/marketplace/offers/${offerId}`),

  // Get matches for a specific offer (shifts you could trade)
  getMatchesForOffer: (offerId: string) =>
    api.get<TradeMatch[]>(`/marketplace/offers/${offerId}/matches`),

  // Update trade offer preferences
  updateOffer: (offerId: string, preferences: TradePreferences) =>
    api.put<TradeOffer>(`/marketplace/offers/${offerId}`, { preferences }),

  // Cancel/delete trade offer
  cancelOffer: (offerId: string) =>
    api.delete(`/marketplace/offers/${offerId}`),

  // Propose a trade (offer your shift for theirs)
  proposeTrade: (offerId: string, myShiftId: string, message?: string) =>
    api.post<TradeProposal>(`/marketplace/offers/${offerId}/propose`, {
      shiftId: myShiftId,
      message,
    }),

  // Get proposals I've made
  getMyProposals: (status?: TradeProposalStatus) =>
    api.get<TradeProposal[]>('/marketplace/proposals/mine', { params: { status } }),

  // Get proposals received for my offers
  getReceivedProposals: (status?: TradeProposalStatus) =>
    api.get<TradeProposal[]>('/marketplace/proposals/received', { params: { status } }),

  // Accept a trade proposal
  acceptTrade: (tradeId: string) =>
    api.post(`/marketplace/proposals/${tradeId}/accept`),

  // Reject a trade proposal
  rejectTrade: (tradeId: string, reason?: string) =>
    api.post(`/marketplace/proposals/${tradeId}/reject`, { reason }),

  // Get AI-recommended trades based on your schedule
  getRecommendedTrades: () =>
    api.get<RecommendedTrade[]>('/marketplace/recommendations'),

  // Express interest in an offer (without proposing yet)
  expressInterest: (offerId: string) =>
    api.post(`/marketplace/offers/${offerId}/interest`),

  // Get trade history (completed trades)
  getTradeHistory: (params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => api.get('/marketplace/history', { params }),
};
