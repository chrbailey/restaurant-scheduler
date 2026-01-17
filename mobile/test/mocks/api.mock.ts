/**
 * API Mock Data
 *
 * Mock data for testing API responses across the app.
 */

import type {
  GhostKitchenSession,
  GhostKitchenOrder,
  GhostShift,
  GhostSessionStats,
  EarnedBalance,
  Transfer,
  InstantPayEnrollment,
  TradeOffer,
  RecommendedTrade,
  TradeProposal,
} from '../../src/services/api';

// ==================== User & Auth Mocks ====================

export const mockUser = {
  id: 'user-123',
  phone: '+15551234567',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
  avatarUrl: undefined,
  phoneVerified: true,
  locale: 'en-US',
  timezone: 'America/New_York',
};

export const mockWorkerProfile = {
  id: 'worker-456',
  restaurantId: 'restaurant-789',
  restaurantName: 'Test Restaurant',
  role: 'WORKER',
  positions: ['SERVER', 'HOST', 'DELIVERY_PACK'],
  tier: 'FULL_TIME',
};

export const mockWorkerProfileNoDelivery = {
  ...mockWorkerProfile,
  id: 'worker-457',
  positions: ['SERVER', 'HOST'],
};

export const mockAuthTokens = {
  accessToken: 'mock-access-token-abc123',
  refreshToken: 'mock-refresh-token-xyz789',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
};

// ==================== Shift Mocks ====================

export const mockShift = {
  id: 'shift-001',
  position: 'SERVER',
  status: 'CONFIRMED',
  startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  endTime: new Date(Date.now() + 86400000 + 28800000).toISOString(), // Tomorrow + 8 hours
  isGhostKitchen: false,
  restaurant: {
    id: 'restaurant-789',
    name: 'Test Restaurant',
    timezone: 'America/New_York',
  },
};

export const mockShiftInProgress = {
  ...mockShift,
  id: 'shift-002',
  status: 'IN_PROGRESS',
  startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  endTime: new Date(Date.now() + 25200000).toISOString(), // 7 hours from now
};

export const mockShiftPending = {
  ...mockShift,
  id: 'shift-003',
  status: 'PUBLISHED_CLAIMED',
  position: 'HOST',
};

export const mockAvailableShift = {
  id: 'available-shift-001',
  position: 'BARTENDER',
  startTime: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
  endTime: new Date(Date.now() + 172800000 + 21600000).toISOString(), // + 6 hours
  hourlyRateOverride: 25.0,
  isNetworkShift: false,
  restaurant: {
    id: 'restaurant-789',
    name: 'Test Restaurant',
    timezone: 'America/New_York',
  },
};

export const mockNetworkShift = {
  ...mockAvailableShift,
  id: 'network-shift-001',
  isNetworkShift: true,
  distance: 2.5,
  crossTrainingStatus: 'CERTIFIED' as const,
  restaurant: {
    id: 'restaurant-999',
    name: 'Partner Restaurant',
    timezone: 'America/New_York',
  },
};

export const mockNetworkShiftUncertified = {
  ...mockNetworkShift,
  id: 'network-shift-002',
  crossTrainingStatus: 'NOT_CERTIFIED' as const,
};

// ==================== Ghost Kitchen Mocks ====================

export const mockGhostKitchenSession: GhostKitchenSession = {
  id: 'session-001',
  restaurantId: 'restaurant-789',
  isActive: true,
  startedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
  activeOrderCount: 5,
  totalOrdersCompleted: 12,
};

export const mockGhostKitchenSessionInactive: GhostKitchenSession = {
  ...mockGhostKitchenSession,
  id: 'session-002',
  isActive: false,
  endedAt: new Date().toISOString(),
};

export const mockGhostKitchenOrder: GhostKitchenOrder = {
  id: 'order-001',
  orderNumber: 'DD-1234',
  platform: 'DOORDASH',
  status: 'PENDING',
  customerFirstName: 'Sarah',
  items: [
    {
      id: 'item-001',
      name: 'Cheeseburger',
      quantity: 2,
      modifiers: ['No onions', 'Extra pickles'],
      specialInstructions: 'Well done',
    },
    {
      id: 'item-002',
      name: 'French Fries',
      quantity: 1,
    },
    {
      id: 'item-003',
      name: 'Coca-Cola',
      quantity: 2,
    },
  ],
  specialInstructions: 'Please include extra napkins',
  receivedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
  estimatedPrepTime: 15,
};

export const mockGhostKitchenOrderPreparing: GhostKitchenOrder = {
  ...mockGhostKitchenOrder,
  id: 'order-002',
  orderNumber: 'UE-5678',
  platform: 'UBEREATS',
  status: 'PREPARING',
  customerFirstName: 'Mike',
  items: [
    {
      id: 'item-004',
      name: 'Chicken Wings',
      quantity: 12,
      modifiers: ['Buffalo sauce'],
    },
  ],
  receivedAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
  acceptedAt: new Date(Date.now() - 540000).toISOString(),
  prepStartedAt: new Date(Date.now() - 420000).toISOString(),
};

export const mockGhostKitchenOrderReady: GhostKitchenOrder = {
  ...mockGhostKitchenOrder,
  id: 'order-003',
  orderNumber: 'GH-9012',
  platform: 'GRUBHUB',
  status: 'READY',
  customerFirstName: 'Lisa',
  items: [
    {
      id: 'item-005',
      name: 'Caesar Salad',
      quantity: 1,
    },
  ],
  receivedAt: new Date(Date.now() - 1200000).toISOString(), // 20 minutes ago
  acceptedAt: new Date(Date.now() - 1140000).toISOString(),
  prepStartedAt: new Date(Date.now() - 900000).toISOString(),
  readyAt: new Date(Date.now() - 180000).toISOString(),
  driver: {
    name: 'David',
    vehicle: 'Honda Civic - Blue',
    eta: new Date(Date.now() + 300000).toISOString(), // 5 minutes
  },
};

export const mockGhostKitchenOrders: GhostKitchenOrder[] = [
  mockGhostKitchenOrder,
  mockGhostKitchenOrderPreparing,
  mockGhostKitchenOrderReady,
];

export const mockGhostShift: GhostShift = {
  id: 'ghost-shift-001',
  position: 'DELIVERY_PACK',
  startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  endTime: new Date(Date.now() + 86400000 + 21600000).toISOString(), // + 6 hours
  hourlyRateOverride: 20.0,
  expectedOrderVolume: 'HIGH',
  isGhostKitchen: true,
  restaurant: {
    id: 'restaurant-789',
    name: 'Test Restaurant',
    timezone: 'America/New_York',
  },
};

export const mockGhostShiftSurge: GhostShift = {
  ...mockGhostShift,
  id: 'ghost-shift-002',
  expectedOrderVolume: 'SURGE',
  hourlyRateOverride: 28.0,
};

export const mockGhostSessionStats: GhostSessionStats = {
  sessionDuration: 120, // 2 hours
  ordersCompleted: 12,
  ordersInQueue: 5,
  avgPrepTime: 8.5, // minutes
  currentStreak: 5,
  peakOrdersPerHour: 8,
};

// ==================== Payments Mocks ====================

export const mockEarnedBalance: EarnedBalance = {
  available: 245.5,
  pending: 127.25,
  total: 372.75,
  currency: 'USD',
  lastUpdated: new Date().toISOString(),
  contributingShifts: [
    {
      id: 'contrib-001',
      date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      hours: 8,
      earnings: 160.0,
      position: 'SERVER',
      restaurantName: 'Test Restaurant',
      status: 'AVAILABLE',
    },
    {
      id: 'contrib-002',
      date: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      hours: 6,
      earnings: 85.5,
      position: 'HOST',
      restaurantName: 'Test Restaurant',
      status: 'AVAILABLE',
    },
    {
      id: 'contrib-003',
      date: new Date().toISOString(), // Today
      hours: 4,
      earnings: 127.25,
      position: 'BARTENDER',
      restaurantName: 'Test Restaurant',
      status: 'PENDING',
    },
  ],
};

export const mockEarnedBalanceEmpty: EarnedBalance = {
  available: 0,
  pending: 0,
  total: 0,
  currency: 'USD',
  lastUpdated: new Date().toISOString(),
  contributingShifts: [],
};

export const mockTransfer: Transfer = {
  id: 'transfer-001',
  amount: 100.0,
  fee: 2.99,
  netAmount: 97.01,
  status: 'COMPLETED',
  requestedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  processedAt: new Date(Date.now() - 3500000).toISOString(),
  completedAt: new Date(Date.now() - 3400000).toISOString(),
  destination: {
    type: 'DEBIT_CARD',
    last4: '4242',
    bankName: 'Chase',
  },
};

export const mockTransferPending: Transfer = {
  ...mockTransfer,
  id: 'transfer-002',
  status: 'PROCESSING',
  completedAt: undefined,
};

export const mockTransfers: Transfer[] = [
  mockTransfer,
  mockTransferPending,
  {
    ...mockTransfer,
    id: 'transfer-003',
    amount: 50.0,
    fee: 2.99,
    netAmount: 47.01,
    requestedAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
  },
];

export const mockInstantPayEnrollment: InstantPayEnrollment = {
  isEnrolled: true,
  enrolledAt: new Date(Date.now() - 30 * 86400000).toISOString(), // 30 days ago
  paymentMethod: {
    type: 'DEBIT_CARD',
    last4: '4242',
    bankName: 'Chase',
    isDefault: true,
  },
  feeStructure: {
    flatFee: 2.99,
    percentFee: 0,
    minTransfer: 5.0,
    maxTransfer: 500.0,
  },
};

export const mockInstantPayNotEnrolled: InstantPayEnrollment = {
  isEnrolled: false,
  feeStructure: {
    flatFee: 2.99,
    percentFee: 0,
    minTransfer: 5.0,
    maxTransfer: 500.0,
  },
};

// ==================== Marketplace Mocks ====================

export const mockTradeOffer: TradeOffer = {
  id: 'offer-001',
  status: 'ACTIVE',
  shift: {
    id: 'shift-trade-001',
    position: 'SERVER',
    startTime: new Date(Date.now() + 259200000).toISOString(), // 3 days from now
    endTime: new Date(Date.now() + 259200000 + 28800000).toISOString(), // + 8 hours
    restaurant: {
      id: 'restaurant-789',
      name: 'Test Restaurant',
    },
  },
  preferences: {
    daysOfWeek: ['TUESDAY', 'WEDNESDAY', 'THURSDAY'],
    timeSlots: ['EVENING'],
    flexibleOnDates: true,
  },
  worker: {
    id: 'worker-trade-001',
    firstName: 'Alex',
    lastName: 'Johnson',
  },
  interestCount: 5,
  matchCount: 2,
  createdAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
  expiresAt: new Date(Date.now() + 172800000).toISOString(), // 2 days from now
};

export const mockTradeOfferFlexible: TradeOffer = {
  ...mockTradeOffer,
  id: 'offer-002',
  preferences: {
    flexibleOnDates: true,
    notes: 'Open to any shift',
  },
  worker: {
    id: 'worker-trade-002',
    firstName: 'Sam',
    lastName: 'Williams',
  },
  interestCount: 8,
  matchCount: 4,
};

export const mockTradeOffers: TradeOffer[] = [
  mockTradeOffer,
  mockTradeOfferFlexible,
  {
    ...mockTradeOffer,
    id: 'offer-003',
    shift: {
      ...mockTradeOffer.shift,
      id: 'shift-trade-003',
      position: 'HOST',
    },
    preferences: {
      daysOfWeek: ['SATURDAY', 'SUNDAY'],
      timeSlots: ['MORNING', 'AFTERNOON'],
    },
    worker: {
      id: 'worker-trade-003',
      firstName: 'Jordan',
      lastName: 'Lee',
    },
    interestCount: 3,
    matchCount: 1,
  },
];

export const mockRecommendedTrade: RecommendedTrade = {
  offer: mockTradeOffer,
  matchingShifts: [
    {
      id: 'match-001',
      shift: {
        id: 'shift-match-001',
        position: 'SERVER',
        startTime: new Date(Date.now() + 345600000).toISOString(), // 4 days
        endTime: new Date(Date.now() + 345600000 + 21600000).toISOString(),
        restaurant: {
          id: 'restaurant-789',
          name: 'Test Restaurant',
        },
      },
      compatibilityScore: 0.92,
      reasons: ['Same position', 'Matches preferred days', 'Similar hours'],
    },
  ],
  recommendationScore: 0.92,
  reason: 'This matches your Wednesday availability and SERVER position',
};

export const mockTradeProposal: TradeProposal = {
  id: 'proposal-001',
  status: 'PENDING',
  offer: mockTradeOffer,
  proposedShift: {
    id: 'proposed-shift-001',
    position: 'SERVER',
    startTime: new Date(Date.now() + 518400000).toISOString(), // 6 days
    endTime: new Date(Date.now() + 518400000 + 28800000).toISOString(),
    restaurant: {
      id: 'restaurant-789',
      name: 'Test Restaurant',
    },
  },
  proposer: {
    id: 'worker-456',
    firstName: 'John',
    lastName: 'Doe',
  },
  message: 'Would love to swap - this works better for my schedule!',
  createdAt: new Date(Date.now() - 3600000).toISOString(),
};

// ==================== API Response Helpers ====================

export function createMockApiResponse<T>(data: T) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };
}

export function createMockApiError(status: number, message: string) {
  const error: any = new Error(message);
  error.response = {
    status,
    data: { message },
  };
  error.isAxiosError = true;
  return error;
}

// ==================== Mock API Functions ====================

export const mockApi = {
  // Auth
  requestOtp: jest.fn(() => Promise.resolve(createMockApiResponse({ success: true }))),
  verifyOtp: jest.fn(() =>
    Promise.resolve(
      createMockApiResponse({
        ...mockAuthTokens,
        user: mockUser,
        profiles: [mockWorkerProfile],
      })
    )
  ),

  // Shifts
  getWeek: jest.fn(() =>
    Promise.resolve(
      createMockApiResponse({
        [new Date().toISOString().split('T')[0]]: [mockShift, mockShiftInProgress],
      })
    )
  ),
  getAvailable: jest.fn(() =>
    Promise.resolve(createMockApiResponse([mockAvailableShift, mockNetworkShift]))
  ),
  claim: jest.fn(() => Promise.resolve(createMockApiResponse({ success: true }))),

  // Ghost Kitchen
  getActiveSession: jest.fn(() => Promise.resolve(createMockApiResponse(mockGhostKitchenSession))),
  getMyActiveOrders: jest.fn(() => Promise.resolve(createMockApiResponse(mockGhostKitchenOrders))),
  updateOrderStatus: jest.fn(() => Promise.resolve(createMockApiResponse({ success: true }))),
  getSessionStats: jest.fn(() => Promise.resolve(createMockApiResponse(mockGhostSessionStats))),
  getGhostShifts: jest.fn(() =>
    Promise.resolve(createMockApiResponse([mockGhostShift, mockGhostShiftSurge]))
  ),

  // Payments
  getEarnedBalance: jest.fn(() => Promise.resolve(createMockApiResponse(mockEarnedBalance))),
  getEnrollmentStatus: jest.fn(() =>
    Promise.resolve(createMockApiResponse(mockInstantPayEnrollment))
  ),
  getTransferHistory: jest.fn(() => Promise.resolve(createMockApiResponse(mockTransfers))),
  requestTransfer: jest.fn(() =>
    Promise.resolve(
      createMockApiResponse({
        ...mockTransfer,
        id: 'transfer-new',
        status: 'PROCESSING',
      })
    )
  ),

  // Marketplace
  getTradeOffers: jest.fn(() => Promise.resolve(createMockApiResponse(mockTradeOffers))),
  getMyOffers: jest.fn(() => Promise.resolve(createMockApiResponse([mockTradeOffer]))),
  getRecommendedTrades: jest.fn(() =>
    Promise.resolve(createMockApiResponse([mockRecommendedTrade]))
  ),
  createTradeOffer: jest.fn(() =>
    Promise.resolve(createMockApiResponse({ ...mockTradeOffer, id: 'offer-new' }))
  ),
  proposeTrade: jest.fn(() =>
    Promise.resolve(createMockApiResponse({ ...mockTradeProposal, id: 'proposal-new' }))
  ),
};
