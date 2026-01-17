/**
 * Expected Results for Test Scenarios
 *
 * Defines expected outcomes for various test scenarios including:
 * - Priority scoring calculations
 * - Auto-approval thresholds
 * - Conflict detection results
 * - Reputation score calculations
 * - Capacity utilization percentages
 * - Forecast accuracy metrics
 * - P&L calculations for ghost kitchen
 */

import { testWorkerProfiles, testShifts, testRestaurants, testGhostKitchenSessions } from './seed-data';

// =============================================================================
// PRIORITY SCORING CALCULATIONS
// =============================================================================

/**
 * Priority scoring factors and their point values
 */
export const PRIORITY_SCORING_RULES = {
  OWN_EMPLOYEE_BONUS: 1000,
  PRIMARY_TIER_BONUS: 100,
  SECONDARY_TIER_BONUS: 50,
  ON_CALL_TIER_BONUS: 0,
  REPUTATION_MULTIPLIER: 100, // reputation * 100 (e.g., 4.5 = 450 points)
  RELIABILITY_BONUS_THRESHOLD: 4.5,
  RELIABILITY_BONUS: 50,
  NO_SHOW_PENALTY: 25, // per incident
  EARLY_CLAIM_BONUS_MAX: 60, // 1 point per minute early, max 60
};

/**
 * Expected priority scores for test claims
 */
export const expectedPriorityScores = {
  // Alex Johnson (wprofile-0003) claiming at Downtown Bistro
  // Own employee: +1000
  // Primary tier: +100
  // Reputation 4.75: +475
  // Reliability > 4.5: +50
  // No-shows: 0
  // = 1625 base (actual may vary with timing bonus)
  'wprofile-0003-at-rest-0001': {
    isOwnEmployee: true,
    isPrimaryTier: true,
    reputationScore: 4.75,
    reliabilityBonus: true,
    noShowCount: 0,
    expectedMinScore: 1575,
    expectedMaxScore: 1635,
  },

  // Emily Davis (wprofile-0006) claiming at Downtown Bistro
  // Own employee: +1000
  // Primary tier: +100
  // Reputation 4.9: +490
  // Reliability > 4.5: +50
  // No-shows: 0
  // = 1640 base
  'wprofile-0006-at-rest-0001': {
    isOwnEmployee: true,
    isPrimaryTier: true,
    reputationScore: 4.9,
    reliabilityBonus: true,
    noShowCount: 0,
    expectedMinScore: 1590,
    expectedMaxScore: 1650,
  },

  // Alex Johnson (wprofile-0016) claiming at Harbor Grill (cross-trained)
  // Network employee (not own): +0
  // Secondary tier: +50
  // Reputation 4.6: +460
  // Reliability > 4.5: +50
  // No-shows: 0
  // = 560 base
  'wprofile-0016-at-rest-0002': {
    isOwnEmployee: false,
    isPrimaryTier: false,
    reputationScore: 4.6,
    reliabilityBonus: true,
    noShowCount: 0,
    expectedMinScore: 510,
    expectedMaxScore: 620,
  },

  // James Wilson (wprofile-0005) - lower reliability worker
  // Own employee: +1000
  // Secondary tier: +50
  // Reputation 3.8: +380
  // Reliability 3.5 (below threshold): +0
  // No-shows: 2, penalty: -50
  // = 1380 base
  'wprofile-0005-at-rest-0001': {
    isOwnEmployee: true,
    isPrimaryTier: false,
    reputationScore: 3.8,
    reliabilityBonus: false,
    noShowCount: 2,
    expectedMinScore: 1330,
    expectedMaxScore: 1440,
  },

  // Robert Martinez (wprofile-0009) - low performer
  // Own employee: +1000
  // Secondary tier: +50
  // Reputation 3.5: +350
  // Reliability 3.1 (below threshold): +0
  // No-shows: 3, penalty: -75
  // = 1325 base
  'wprofile-0009-at-rest-0002': {
    isOwnEmployee: true,
    isPrimaryTier: false,
    reputationScore: 3.5,
    reliabilityBonus: false,
    noShowCount: 3,
    expectedMinScore: 1275,
    expectedMaxScore: 1385,
  },
};

/**
 * Calculate expected priority score
 */
export function calculateExpectedPriorityScore(params: {
  isOwnEmployee: boolean;
  tier: 'PRIMARY' | 'SECONDARY' | 'ON_CALL';
  reputationScore: number;
  reliabilityScore: number;
  noShowCount: number;
  claimTimeBonus?: number;
}): number {
  let score = 0;

  if (params.isOwnEmployee) score += PRIORITY_SCORING_RULES.OWN_EMPLOYEE_BONUS;

  if (params.tier === 'PRIMARY') score += PRIORITY_SCORING_RULES.PRIMARY_TIER_BONUS;
  else if (params.tier === 'SECONDARY') score += PRIORITY_SCORING_RULES.SECONDARY_TIER_BONUS;

  score += Math.round(params.reputationScore * PRIORITY_SCORING_RULES.REPUTATION_MULTIPLIER);

  if (params.reliabilityScore >= PRIORITY_SCORING_RULES.RELIABILITY_BONUS_THRESHOLD) {
    score += PRIORITY_SCORING_RULES.RELIABILITY_BONUS;
  }

  score -= params.noShowCount * PRIORITY_SCORING_RULES.NO_SHOW_PENALTY;
  score += Math.min(params.claimTimeBonus || 0, PRIORITY_SCORING_RULES.EARLY_CLAIM_BONUS_MAX);

  return Math.max(0, score);
}

// =============================================================================
// AUTO-APPROVAL THRESHOLDS
// =============================================================================

export const expectedAutoApprovalResults = {
  // Downtown Bistro auto-approve threshold: 4.5
  'rest-0001': {
    threshold: 4.5,
    workersThatQualify: [
      'wprofile-0003-test', // 4.75
      'wprofile-0006-test', // 4.90
      'wprofile-0017-test', // 4.95
    ],
    workersThatDontQualify: [
      'wprofile-0004-test', // 4.40
      'wprofile-0005-test', // 3.50
      'wprofile-0015-test', // 4.85 (but ON_CALL tier may have restrictions)
    ],
  },

  // Harbor Grill auto-approve threshold: 4.0
  'rest-0002': {
    threshold: 4.0,
    workersThatQualify: [
      'wprofile-0007-test', // 5.00
      'wprofile-0008-test', // 4.55
      'wprofile-0010-test', // 4.65
    ],
    workersThatDontQualify: [
      'wprofile-0009-test', // 3.10
    ],
  },

  // Uptown Kitchen auto-approve threshold: 4.2
  'rest-0003': {
    threshold: 4.2,
    workersThatQualify: [
      'wprofile-0011-test', // 4.88
      'wprofile-0012-test', // 4.55
      'wprofile-0014-test', // 4.25
    ],
    workersThatDontQualify: [
      'wprofile-0013-test', // 3.80
    ],
  },
};

// =============================================================================
// CONFLICT DETECTION RESULTS
// =============================================================================

export const expectedConflictDetectionResults = {
  // Worker Alex Johnson (user-0003) has profiles at rest-0001 and rest-0002
  // shift-0021 (rest-0001, today 11:00-19:00) and shift-0025 (rest-0002, today 11:00-19:00)
  'alex-johnson-same-time-different-restaurants': {
    worker1ProfileId: 'wprofile-0003-test',
    worker2ProfileId: 'wprofile-0016-test',
    shift1Id: 'shift-0021-test',
    shift2Id: 'shift-0025-test',
    hasConflict: true,
    conflictType: 'OVERLAPPING_SHIFTS',
    conflictReason: 'Worker scheduled at two restaurants for overlapping times',
  },

  // Worker David Kim (user-0007) has profiles at rest-0001 and rest-0002
  // Can work both locations but not at same time
  'david-kim-different-times': {
    workerUserId: 'user-0007-test',
    shift1: { restaurantId: 'rest-0001-test', time: '10:00-14:00' },
    shift2: { restaurantId: 'rest-0002-test', time: '17:00-01:00' },
    hasConflict: false,
    conflictType: null,
    note: 'Sufficient travel time between shifts',
  },

  // Minimum travel time requirement (30 minutes default)
  'insufficient-travel-time': {
    shift1EndTime: '14:00',
    shift2StartTime: '14:15',
    distance: 5, // miles
    estimatedTravelTime: 20, // minutes
    requiredBuffer: 30, // minutes
    hasConflict: true,
    conflictType: 'INSUFFICIENT_TRAVEL_TIME',
  },

  // Rest period requirement (8 hours between closing and opening shifts)
  'rest-period-violation': {
    shift1EndTime: '01:00', // Late night shift ends
    shift2StartTime: '06:00', // Morning shift starts (only 5 hours rest)
    requiredRestPeriod: 8, // hours
    actualRestPeriod: 5, // hours
    hasConflict: true,
    conflictType: 'REST_PERIOD_VIOLATION',
  },
};

// =============================================================================
// REPUTATION SCORE CALCULATIONS
// =============================================================================

export const expectedReputationScores = {
  // Perfect worker - David Kim (wprofile-0007)
  'wprofile-0007-test': {
    shiftsCompleted: 68,
    noShowCount: 0,
    lateCount: 0,
    averageRating: 4.95,
    expectedReliabilityScore: 5.0,
    expectedNetworkTier: 'PLATINUM',
    expectedNetworkScore: 495, // 4.95 * 100
  },

  // Good worker - Alex Johnson (wprofile-0003)
  'wprofile-0003-test': {
    shiftsCompleted: 85,
    noShowCount: 0,
    lateCount: 2,
    averageRating: 4.7,
    expectedReliabilityScore: 4.75,
    expectedNetworkTier: 'GOLD',
    expectedNetworkScore: 470,
  },

  // Average worker - Maria Garcia (wprofile-0004)
  'wprofile-0004-test': {
    shiftsCompleted: 95,
    noShowCount: 1,
    lateCount: 4,
    averageRating: 4.5,
    expectedReliabilityScore: 4.40,
    expectedNetworkTier: 'GOLD',
    expectedNetworkScore: 440,
  },

  // Below average - James Wilson (wprofile-0005)
  'wprofile-0005-test': {
    shiftsCompleted: 45,
    noShowCount: 2,
    lateCount: 8,
    averageRating: 3.8,
    expectedReliabilityScore: 3.50,
    expectedNetworkTier: 'SILVER',
    expectedNetworkScore: 350,
  },

  // Poor performer - Robert Martinez (wprofile-0009)
  'wprofile-0009-test': {
    shiftsCompleted: 42,
    noShowCount: 3,
    lateCount: 6,
    averageRating: 3.5,
    expectedReliabilityScore: 3.10,
    expectedNetworkTier: 'BRONZE',
    expectedNetworkScore: 310,
  },

  // New worker - Rachel Harris (wprofile-0018)
  'wprofile-0018-test': {
    shiftsCompleted: 0,
    noShowCount: 0,
    lateCount: 0,
    averageRating: 3.0,
    expectedReliabilityScore: 3.00, // Default for new workers
    expectedNetworkTier: 'BRONZE',
    expectedNetworkScore: 300,
  },
};

/**
 * Reputation tier thresholds
 */
export const REPUTATION_TIER_THRESHOLDS = {
  PLATINUM: 450, // 4.5+ star equivalent
  GOLD: 400,     // 4.0+ star equivalent
  SILVER: 350,   // 3.5+ star equivalent
  BRONZE: 0,     // Below 3.5
};

/**
 * Calculate expected reliability score
 */
export function calculateExpectedReliabilityScore(params: {
  shiftsCompleted: number;
  noShowCount: number;
  lateCount: number;
  averageRating: number;
}): number {
  if (params.shiftsCompleted === 0) return 3.0;

  let score = params.averageRating;
  const noShowPenalty = (params.noShowCount / params.shiftsCompleted) * 2;
  const latePenalty = (params.lateCount / params.shiftsCompleted) * 0.5;

  score -= noShowPenalty;
  score -= latePenalty;

  // Experience bonus
  if (params.shiftsCompleted >= 50) score += 0.2;
  else if (params.shiftsCompleted >= 20) score += 0.1;

  return Math.max(1, Math.min(5, Math.round(score * 100) / 100));
}

// =============================================================================
// CAPACITY UTILIZATION
// =============================================================================

export const expectedCapacityUtilization = {
  // Active ghost kitchen session at Downtown Bistro
  'gksession-0001-test': {
    maxOrders: 25,
    currentOrders: 12,
    expectedUtilization: 48, // 12/25 * 100
    utilizationStatus: 'MODERATE',
    canAcceptMore: true,
    ordersUntilCapacity: 13,
    autoDisableThreshold: 90,
    ordersUntilAutoDisable: Math.floor(25 * 0.9) - 12, // 22 - 12 = 10
  },

  // Completed session statistics
  'gksession-0002-test': {
    maxOrders: 20,
    peakConcurrentOrders: 8,
    peakUtilization: 40, // 8/20 * 100
    averageUtilization: 28, // estimated average throughout session
    totalOrders: 28,
    sessionDurationHours: 4.5,
    ordersPerHour: 6.2, // 28/4.5
  },
};

/**
 * Utilization status thresholds
 */
export const UTILIZATION_THRESHOLDS = {
  LOW: 30,
  MODERATE: 60,
  HIGH: 80,
  CRITICAL: 90,
};

/**
 * Calculate utilization status
 */
export function getUtilizationStatus(utilizationPercent: number): string {
  if (utilizationPercent >= UTILIZATION_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (utilizationPercent >= UTILIZATION_THRESHOLDS.HIGH) return 'HIGH';
  if (utilizationPercent >= UTILIZATION_THRESHOLDS.MODERATE) return 'MODERATE';
  return 'LOW';
}

// =============================================================================
// FORECAST ACCURACY METRICS
// =============================================================================

export const expectedForecastAccuracy = {
  // Today's lunch forecast vs actual
  'forecast-0001-test': {
    dineInForecast: 45,
    actualDineIn: 42,
    dineInError: 3,
    dineInMAPE: 6.67, // |45-42|/42 * 100 = 7.14%
    deliveryForecast: 18,
    actualDelivery: 20,
    deliveryError: 2,
    deliveryMAPE: 10.0, // |18-20|/20 * 100 = 10%
    overallAccuracy: 91.67, // 100 - average MAPE
    confidence: 0.85,
    withinConfidenceInterval: true,
  },

  // Weekly aggregate metrics
  weeklyMetrics: {
    averageMAPE: 8.5,
    forecastAccuracy: 91.5,
    dineInBias: -2.3, // Slight underforecast
    deliveryBias: 1.8, // Slight overforecast
    bestPerformingDay: 'Tuesday',
    worstPerformingDay: 'Saturday',
    weatherImpactCorrelation: 0.72, // Strong correlation
  },

  // ML model performance
  modelPerformance: {
    modelType: 'GRADIENT_BOOST',
    mae: 3.2, // Mean Absolute Error
    rmse: 4.1, // Root Mean Square Error
    mape: 8.5, // Mean Absolute Percentage Error
    r2Score: 0.87, // R-squared
    dataPointsUsed: 2500,
    featureImportance: {
      dayOfWeek: 0.25,
      hourSlot: 0.20,
      weatherCondition: 0.15,
      historicalAverage: 0.18,
      eventImpact: 0.12,
      trend: 0.10,
    },
  },
};

/**
 * Calculate MAPE (Mean Absolute Percentage Error)
 */
export function calculateMAPE(forecast: number, actual: number): number {
  if (actual === 0) return forecast > 0 ? 100 : 0;
  return Math.abs((forecast - actual) / actual) * 100;
}

/**
 * Calculate forecast accuracy
 */
export function calculateForecastAccuracy(mape: number): number {
  return Math.max(0, 100 - mape);
}

// =============================================================================
// GHOST KITCHEN P&L CALCULATIONS
// =============================================================================

export const expectedGhostKitchenPnL = {
  // Completed session P&L
  'gksession-0002-test': {
    // Revenue
    totalRevenue: 756.80,

    // Platform fees
    doordashFees: 72.90, // 18 orders * $27 avg * 15%
    ubereatsFees: 81.24, // 10 orders * $27.08 avg * 30%
    totalPlatformFees: 154.14,

    // Labor cost (estimated 4 hours with 2 workers at $20/hr)
    laborHours: 9, // 4.5 hours * 2 workers
    laborRate: 20,
    totalLaborCost: 180.00,

    // Supply cost ($1.50 per order)
    supplyPackagingCost: 1.50,
    totalOrders: 28,
    totalSupplyCost: 42.00, // 28 * $1.50

    // Calculations
    grossProfit: 602.66, // 756.80 - 154.14
    netProfit: 380.66, // 602.66 - 180.00 - 42.00
    profitMargin: 50.30, // 380.66 / 756.80 * 100

    // Per-order metrics
    averageOrderValue: 27.03,
    averageNetProfitPerOrder: 13.60,
    laborCostPerOrder: 6.43,
    platformFeePerOrder: 5.50,
  },

  // Active session projected P&L
  'gksession-0001-test-projected': {
    currentRevenue: 324.50,
    projectedTotalRevenue: 540.83, // Extrapolated for full session
    projectedPlatformFees: 99.45,
    projectedLaborCost: 160.00,
    projectedSupplyCost: 30.00, // 20 projected orders
    projectedNetProfit: 251.38,
    projectedProfitMargin: 46.48,
  },

  // Platform comparison
  platformComparison: {
    DOORDASH: {
      commissionRate: 15,
      averageOrderValue: 27.00,
      averageNetPerOrder: 22.95, // After 15% fee
      profitability: 'HIGH',
    },
    UBEREATS: {
      commissionRate: 30,
      averageOrderValue: 27.08,
      averageNetPerOrder: 18.96, // After 30% fee
      profitability: 'MEDIUM',
    },
    GRUBHUB: {
      commissionRate: 20,
      averageOrderValue: 27.17,
      averageNetPerOrder: 21.74, // After 20% fee
      profitability: 'MEDIUM-HIGH',
    },
  },
};

/**
 * Calculate session P&L
 */
export function calculateSessionPnL(params: {
  revenue: number;
  platformFees: number;
  laborHours: number;
  laborRate: number;
  orderCount: number;
  supplyPackagingCost: number;
}): {
  grossProfit: number;
  laborCost: number;
  supplyCost: number;
  netProfit: number;
  profitMargin: number;
} {
  const grossProfit = params.revenue - params.platformFees;
  const laborCost = params.laborHours * params.laborRate;
  const supplyCost = params.orderCount * params.supplyPackagingCost;
  const netProfit = grossProfit - laborCost - supplyCost;
  const profitMargin = params.revenue > 0 ? (netProfit / params.revenue) * 100 : 0;

  return {
    grossProfit: Math.round(grossProfit * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    supplyCost: Math.round(supplyCost * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 100) / 100,
  };
}

// =============================================================================
// INSTANT PAY LIMITS
// =============================================================================

export const expectedInstantPayLimits = {
  // Daily limits
  daily: {
    maxTransferAmount: 500.00,
    maxTransfersPerDay: 3,
    minTransferAmount: 10.00,
    instantFee: 2.99,
    nextDayFee: 0.00,
  },

  // Weekly limits
  weekly: {
    maxTransferAmount: 1500.00,
    maxTransfersPerWeek: 10,
  },

  // Worker-specific limits based on tenure
  workerLimits: {
    newWorker: { // < 30 days
      dailyMax: 100.00,
      weeklyMax: 300.00,
    },
    regularWorker: { // 30-90 days
      dailyMax: 300.00,
      weeklyMax: 1000.00,
    },
    establishedWorker: { // > 90 days
      dailyMax: 500.00,
      weeklyMax: 1500.00,
    },
  },

  // Available balance calculations
  balanceCalculations: {
    'wprofile-0003-test': {
      totalEarnings: 250.00,
      alreadyTransferred: 0,
      availableForTransfer: 250.00,
      dailyLimitRemaining: 500.00,
      weeklyLimitRemaining: 1500.00,
      canTransfer: true,
      maxTransferableNow: 250.00,
    },
    'wprofile-0007-test': {
      totalEarnings: 307.50,
      alreadyTransferred: 200.00, // Previous transfer
      availableForTransfer: 107.50,
      dailyLimitRemaining: 300.00, // Already transferred $200 today
      weeklyLimitRemaining: 1300.00,
      canTransfer: true,
      maxTransferableNow: 107.50,
    },
  },
};

// =============================================================================
// EXPORT ALL EXPECTED RESULTS
// =============================================================================

export const expectedResults = {
  priorityScoring: {
    rules: PRIORITY_SCORING_RULES,
    scores: expectedPriorityScores,
    calculate: calculateExpectedPriorityScore,
  },
  autoApproval: expectedAutoApprovalResults,
  conflictDetection: expectedConflictDetectionResults,
  reputation: {
    scores: expectedReputationScores,
    tiers: REPUTATION_TIER_THRESHOLDS,
    calculate: calculateExpectedReliabilityScore,
  },
  capacity: {
    utilization: expectedCapacityUtilization,
    thresholds: UTILIZATION_THRESHOLDS,
    getStatus: getUtilizationStatus,
  },
  forecast: {
    accuracy: expectedForecastAccuracy,
    calculateMAPE,
    calculateAccuracy: calculateForecastAccuracy,
  },
  ghostKitchenPnL: {
    results: expectedGhostKitchenPnL,
    calculate: calculateSessionPnL,
  },
  instantPay: expectedInstantPayLimits,
};

export default expectedResults;
