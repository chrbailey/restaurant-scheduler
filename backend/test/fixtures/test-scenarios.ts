/**
 * Named Test Scenarios
 *
 * Pre-configured test scenarios for common testing situations.
 * Each scenario includes setup data, execution steps, and expected outcomes.
 */

import {
  testRestaurants,
  testUsers,
  testWorkerProfiles,
  testShifts,
  testShiftClaims,
  testGhostKitchenSessions,
  Position,
  ShiftStatus,
  ShiftType,
  WorkerTier,
} from './seed-data';
import { expectedResults } from './expected-results';

// =============================================================================
// SCENARIO TYPES
// =============================================================================

export interface TestScenario {
  name: string;
  description: string;
  tags: string[];
  setup: ScenarioSetup;
  steps: ScenarioStep[];
  expectedOutcome: ExpectedOutcome;
  cleanup?: () => Promise<void>;
}

export interface ScenarioSetup {
  restaurants?: string[];
  workers?: string[];
  shifts?: string[];
  claims?: string[];
  additionalData?: Record<string, any>;
}

export interface ScenarioStep {
  action: string;
  params: Record<string, any>;
  expectedResult?: any;
}

export interface ExpectedOutcome {
  success: boolean;
  resultType: string;
  assertions: ExpectedAssertion[];
}

export interface ExpectedAssertion {
  field: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'exists' | 'notExists';
  value: any;
}

// =============================================================================
// SCENARIO: HIGH DEMAND SATURDAY
// =============================================================================

/**
 * Multiple workers claiming the same high-value Saturday shift
 * Tests priority scoring and conflict resolution
 */
export const highDemandSaturdayScenario: TestScenario = {
  name: 'high-demand-saturday',
  description: 'Multiple workers compete to claim a popular Saturday dinner shift. Tests priority scoring, claim ordering, and approval workflow.',
  tags: ['claims', 'priority', 'scheduling', 'competition'],
  setup: {
    restaurants: ['rest-0001-test'],
    workers: [
      'wprofile-0003-test', // Alex - Primary, 4.75 rating
      'wprofile-0006-test', // Emily - Primary, 4.90 rating
      'wprofile-0016-test', // Alex at Harbor (cross-trained)
      'wprofile-0005-test', // James - Secondary, 3.50 rating
    ],
    shifts: ['shift-0005-test'], // Saturday SERVER shift
    additionalData: {
      shiftDetails: {
        position: Position.SERVER,
        date: 'Saturday',
        time: '11:00-19:00',
        restaurant: 'Downtown Bistro',
        autoApprove: true,
        minReputationScore: 4.0,
      },
    },
  },
  steps: [
    {
      action: 'WORKER_CLAIMS_SHIFT',
      params: {
        workerId: 'wprofile-0003-test',
        shiftId: 'shift-0005-test',
        claimTime: '08:00:00',
      },
      expectedResult: {
        claimCreated: true,
        priorityScore: { min: 1575, max: 1635 },
        status: 'PENDING',
      },
    },
    {
      action: 'WORKER_CLAIMS_SHIFT',
      params: {
        workerId: 'wprofile-0006-test',
        shiftId: 'shift-0005-test',
        claimTime: '08:15:00',
      },
      expectedResult: {
        claimCreated: true,
        priorityScore: { min: 1590, max: 1650 },
        status: 'PENDING',
      },
    },
    {
      action: 'WORKER_CLAIMS_SHIFT',
      params: {
        workerId: 'wprofile-0016-test',
        shiftId: 'shift-0005-test',
        claimTime: '10:00:00',
      },
      expectedResult: {
        claimCreated: true,
        priorityScore: { min: 510, max: 620 },
        status: 'PENDING',
      },
    },
    {
      action: 'WORKER_CLAIMS_SHIFT',
      params: {
        workerId: 'wprofile-0005-test',
        shiftId: 'shift-0005-test',
        claimTime: '10:30:00',
      },
      expectedResult: {
        claimCreated: false,
        reason: 'Does not meet minimum reputation score (4.0)',
      },
    },
    {
      action: 'RESOLVE_CLAIMS',
      params: {
        shiftId: 'shift-0005-test',
        method: 'HIGHEST_PRIORITY',
      },
      expectedResult: {
        winningClaim: 'wprofile-0006-test', // Highest priority score
        rejectedClaims: ['wprofile-0003-test', 'wprofile-0016-test'],
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'SHIFT_ASSIGNED',
    assertions: [
      { field: 'shift.status', operator: 'equals', value: ShiftStatus.CONFIRMED },
      { field: 'shift.assignedToId', operator: 'equals', value: 'wprofile-0006-test' },
      { field: 'claims.approved', operator: 'equals', value: 1 },
      { field: 'claims.rejected', operator: 'equals', value: 2 },
      { field: 'notifications.sent', operator: 'greaterThan', value: 0 },
    ],
  },
};

// =============================================================================
// SCENARIO: CROSS-RESTAURANT SWAP
// =============================================================================

/**
 * Two workers from different restaurants in the same network swap shifts
 * Tests network permissions, cross-training validation, and approval workflow
 */
export const crossRestaurantSwapScenario: TestScenario = {
  name: 'cross-restaurant-swap',
  description: 'Two bartenders from different network restaurants swap shifts. Tests cross-training verification and dual-manager approval.',
  tags: ['swaps', 'network', 'cross-training', 'approval'],
  setup: {
    restaurants: ['rest-0001-test', 'rest-0002-test'],
    workers: [
      'wprofile-0007-test', // David at Harbor Grill (bartender)
      'wprofile-0017-test', // David at Downtown (cross-trained bartender)
    ],
    shifts: ['shift-0022-test', 'shift-0026-test'],
    additionalData: {
      swap: {
        sourceShift: {
          id: 'shift-0026-test',
          restaurant: 'Harbor Grill',
          position: Position.BARTENDER,
          date: 'Today 17:00-01:00',
        },
        targetShift: {
          id: 'shift-0022-test',
          restaurant: 'Downtown Bistro',
          position: Position.BARTENDER,
          date: 'Today 17:00-01:00',
        },
      },
    },
  },
  steps: [
    {
      action: 'VERIFY_CROSS_TRAINING',
      params: {
        workerId: 'wprofile-0007-test',
        targetRestaurantId: 'rest-0001-test',
        requiredPositions: [Position.BARTENDER],
      },
      expectedResult: {
        isCrossTrained: true,
        positions: [Position.BARTENDER],
        status: 'APPROVED',
      },
    },
    {
      action: 'INITIATE_SWAP',
      params: {
        sourceWorkerId: 'wprofile-0007-test',
        sourceShiftId: 'shift-0026-test',
        targetWorkerId: 'wprofile-0017-test',
        targetShiftId: 'shift-0022-test',
        message: 'Cross-restaurant swap - both bartenders',
      },
      expectedResult: {
        swapCreated: true,
        requiresApproval: true,
        status: 'PENDING',
      },
    },
    {
      action: 'TARGET_WORKER_ACCEPTS',
      params: {
        swapId: 'swap-0002-test',
        workerId: 'wprofile-0017-test',
      },
      expectedResult: {
        status: 'ACCEPTED',
        awaitingManagerApproval: true,
      },
    },
    {
      action: 'MANAGER_APPROVES',
      params: {
        swapId: 'swap-0002-test',
        managerId: 'user-0001-test', // Downtown Bistro owner
      },
      expectedResult: {
        managerApproved: true,
        requiresSecondApproval: true, // Cross-restaurant needs both managers
      },
    },
    {
      action: 'MANAGER_APPROVES',
      params: {
        swapId: 'swap-0002-test',
        managerId: 'user-0002-test', // Harbor Grill manager
      },
      expectedResult: {
        fullyApproved: true,
        shiftsSwapped: true,
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'SHIFTS_SWAPPED',
    assertions: [
      { field: 'shift-0022.assignedToId', operator: 'equals', value: 'wprofile-0007-test' },
      { field: 'shift-0026.assignedToId', operator: 'equals', value: 'wprofile-0017-test' },
      { field: 'swap.status', operator: 'equals', value: 'ACCEPTED' },
      { field: 'swap.managerApproved', operator: 'equals', value: true },
    ],
  },
};

// =============================================================================
// SCENARIO: GHOST KITCHEN SURGE
// =============================================================================

/**
 * Ghost kitchen experiences surge in orders approaching capacity
 * Tests capacity management, auto-pause, and staffing recommendations
 */
export const ghostKitchenSurgeScenario: TestScenario = {
  name: 'ghost-kitchen-surge',
  description: 'Ghost kitchen experiences order surge during dinner rush. Tests capacity management, auto-throttling, and staffing alerts.',
  tags: ['ghost-kitchen', 'capacity', 'surge', 'alerts'],
  setup: {
    restaurants: ['rest-0001-test'],
    additionalData: {
      session: {
        id: 'gksession-0001-test',
        maxOrders: 25,
        autoDisableThreshold: 90, // 90% = 22-23 orders
        platforms: ['DOORDASH', 'UBEREATS', 'GRUBHUB'],
      },
      initialState: {
        currentOrders: 12,
        utilizationPercent: 48,
      },
    },
  },
  steps: [
    {
      action: 'RECEIVE_ORDER',
      params: {
        platform: 'DOORDASH',
        orderId: 'DD-SURGE-001',
        itemCount: 4,
        estimatedPrepTime: 15,
      },
      expectedResult: {
        accepted: true,
        currentOrders: 13,
        utilizationPercent: 52,
      },
    },
    {
      action: 'RECEIVE_MULTIPLE_ORDERS',
      params: {
        count: 7,
        platforms: ['DOORDASH', 'UBEREATS', 'GRUBHUB'],
      },
      expectedResult: {
        allAccepted: true,
        currentOrders: 20,
        utilizationPercent: 80,
        alertsSent: ['HIGH_UTILIZATION'],
      },
    },
    {
      action: 'RECEIVE_ORDER',
      params: {
        platform: 'UBEREATS',
        orderId: 'UE-SURGE-008',
        itemCount: 3,
      },
      expectedResult: {
        accepted: true,
        currentOrders: 21,
        utilizationPercent: 84,
        staffingRecommendation: {
          additionalWorkersNeeded: 1,
          recommendedPositions: [Position.DELIVERY_PACK],
        },
      },
    },
    {
      action: 'RECEIVE_ORDER',
      params: {
        platform: 'GRUBHUB',
        orderId: 'GH-SURGE-009',
        itemCount: 2,
      },
      expectedResult: {
        accepted: true,
        currentOrders: 22,
        utilizationPercent: 88,
        alertsSent: ['APPROACHING_CAPACITY'],
      },
    },
    {
      action: 'RECEIVE_ORDER',
      params: {
        platform: 'DOORDASH',
        orderId: 'DD-SURGE-010',
        itemCount: 5,
      },
      expectedResult: {
        accepted: true,
        currentOrders: 23,
        utilizationPercent: 92,
        autoThrottleTriggered: true,
        prepTimeExtended: true,
        alertsSent: ['AUTO_THROTTLE_ENABLED'],
      },
    },
    {
      action: 'COMPLETE_ORDERS',
      params: {
        count: 5,
      },
      expectedResult: {
        currentOrders: 18,
        utilizationPercent: 72,
        autoThrottleDisabled: true,
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'SURGE_MANAGED',
    assertions: [
      { field: 'session.status', operator: 'equals', value: 'ACTIVE' },
      { field: 'session.peakConcurrentOrders', operator: 'equals', value: 23 },
      { field: 'session.peakUtilization', operator: 'equals', value: 92 },
      { field: 'ordersRejected', operator: 'equals', value: 0 },
      { field: 'alerts.sent', operator: 'greaterThan', value: 2 },
    ],
  },
};

// =============================================================================
// SCENARIO: INSTANT PAY LIMITS
// =============================================================================

/**
 * Worker tests instant pay transfer limits
 * Tests daily limits, weekly limits, and balance calculations
 */
export const instantPayLimitsScenario: TestScenario = {
  name: 'instant-pay-limits',
  description: 'Worker attempts multiple instant pay transfers to test daily and weekly limits.',
  tags: ['payments', 'instant-pay', 'limits', 'validation'],
  setup: {
    workers: ['wprofile-0003-test'],
    additionalData: {
      workerEarnings: {
        totalAvailable: 450.00,
        alreadyTransferredToday: 0,
        alreadyTransferredThisWeek: 200.00,
      },
      limits: {
        dailyMax: 500.00,
        weeklyMax: 1500.00,
        instantFee: 2.99,
      },
    },
  },
  steps: [
    {
      action: 'CHECK_BALANCE',
      params: {
        workerId: 'wprofile-0003-test',
      },
      expectedResult: {
        available: 450.00,
        dailyLimitRemaining: 500.00,
        weeklyLimitRemaining: 1300.00, // 1500 - 200
        maxTransferableNow: 450.00,
      },
    },
    {
      action: 'REQUEST_TRANSFER',
      params: {
        workerId: 'wprofile-0003-test',
        amount: 200.00,
        method: 'INSTANT',
      },
      expectedResult: {
        success: true,
        amount: 200.00,
        fee: 2.99,
        netAmount: 197.01,
        status: 'PENDING',
      },
    },
    {
      action: 'REQUEST_TRANSFER',
      params: {
        workerId: 'wprofile-0003-test',
        amount: 200.00,
        method: 'INSTANT',
      },
      expectedResult: {
        success: true,
        amount: 200.00,
        fee: 2.99,
        netAmount: 197.01,
        status: 'PENDING',
        dailyLimitRemaining: 100.00,
      },
    },
    {
      action: 'REQUEST_TRANSFER',
      params: {
        workerId: 'wprofile-0003-test',
        amount: 200.00, // Exceeds remaining balance (only 50 left)
        method: 'INSTANT',
      },
      expectedResult: {
        success: false,
        reason: 'INSUFFICIENT_BALANCE',
        availableBalance: 50.00,
        maxAllowed: 50.00,
      },
    },
    {
      action: 'REQUEST_TRANSFER',
      params: {
        workerId: 'wprofile-0003-test',
        amount: 50.00,
        method: 'INSTANT',
      },
      expectedResult: {
        success: true,
        amount: 50.00,
        fee: 2.99,
        netAmount: 47.01,
        status: 'PENDING',
        dailyLimitRemaining: 50.00,
        availableBalance: 0,
      },
    },
    {
      action: 'REQUEST_TRANSFER',
      params: {
        workerId: 'wprofile-0003-test',
        amount: 10.00,
        method: 'INSTANT',
      },
      expectedResult: {
        success: false,
        reason: 'NO_AVAILABLE_BALANCE',
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'LIMITS_ENFORCED',
    assertions: [
      { field: 'transfers.successful', operator: 'equals', value: 3 },
      { field: 'transfers.failed', operator: 'equals', value: 2 },
      { field: 'totalTransferred', operator: 'equals', value: 450.00 },
      { field: 'totalFees', operator: 'equals', value: 8.97 }, // 3 * 2.99
    ],
  },
};

// =============================================================================
// SCENARIO: ML FORECAST ACCURACY
// =============================================================================

/**
 * Compare ML predictions to actual outcomes
 * Tests forecast accuracy, confidence intervals, and model performance
 */
export const mlForecastAccuracyScenario: TestScenario = {
  name: 'ml-forecast-accuracy',
  description: 'Compare ML demand forecasts against actual outcomes to measure accuracy.',
  tags: ['ml', 'forecast', 'accuracy', 'analytics'],
  setup: {
    restaurants: ['rest-0001-test'],
    additionalData: {
      forecastPeriod: {
        date: '2024-12-16',
        hourSlots: [11, 12, 13, 17, 18, 19, 20],
      },
      weatherConditions: {
        temperature: 58,
        precipitation: 0,
        condition: 'PARTLY_CLOUDY',
      },
      forecasts: [
        { hourSlot: 11, dineInForecast: 25, deliveryForecast: 12 },
        { hourSlot: 12, dineInForecast: 45, deliveryForecast: 18 },
        { hourSlot: 13, dineInForecast: 38, deliveryForecast: 15 },
        { hourSlot: 17, dineInForecast: 55, deliveryForecast: 22 },
        { hourSlot: 18, dineInForecast: 85, deliveryForecast: 35 },
        { hourSlot: 19, dineInForecast: 78, deliveryForecast: 32 },
        { hourSlot: 20, dineInForecast: 52, deliveryForecast: 25 },
      ],
    },
  },
  steps: [
    {
      action: 'RECORD_ACTUALS',
      params: {
        hourSlot: 11,
        actualDineIn: 22,
        actualDelivery: 14,
      },
      expectedResult: {
        dineInError: 3,
        dineInMAPE: 13.64, // |25-22|/22 * 100
        deliveryError: 2,
        deliveryMAPE: 14.29, // |12-14|/14 * 100
      },
    },
    {
      action: 'RECORD_ACTUALS',
      params: {
        hourSlot: 12,
        actualDineIn: 42,
        actualDelivery: 20,
      },
      expectedResult: {
        dineInError: 3,
        dineInMAPE: 7.14,
        deliveryError: 2,
        deliveryMAPE: 10.00,
      },
    },
    {
      action: 'RECORD_ACTUALS',
      params: {
        hourSlot: 13,
        actualDineIn: 40,
        actualDelivery: 14,
      },
      expectedResult: {
        dineInError: 2,
        dineInMAPE: 5.00,
        deliveryError: 1,
        deliveryMAPE: 7.14,
      },
    },
    {
      action: 'RECORD_ACTUALS',
      params: {
        hourSlot: 17,
        actualDineIn: 58,
        actualDelivery: 25,
      },
      expectedResult: {
        dineInError: 3,
        dineInMAPE: 5.17,
        deliveryError: 3,
        deliveryMAPE: 12.00,
      },
    },
    {
      action: 'RECORD_ACTUALS',
      params: {
        hourSlot: 18,
        actualDineIn: 90,
        actualDelivery: 38,
      },
      expectedResult: {
        dineInError: 5,
        dineInMAPE: 5.56,
        deliveryError: 3,
        deliveryMAPE: 7.89,
      },
    },
    {
      action: 'CALCULATE_DAILY_ACCURACY',
      params: {
        date: '2024-12-16',
      },
      expectedResult: {
        averageDineInMAPE: 7.30,
        averageDeliveryMAPE: 10.26,
        overallAccuracy: 91.22,
        forecastBias: -1.2, // Slight underforecast
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'ACCURACY_CALCULATED',
    assertions: [
      { field: 'overallAccuracy', operator: 'greaterThan', value: 85 },
      { field: 'dineInMAPE', operator: 'lessThan', value: 15 },
      { field: 'deliveryMAPE', operator: 'lessThan', value: 15 },
      { field: 'modelPerformance', operator: 'equals', value: 'GOOD' },
    ],
  },
};

// =============================================================================
// SCENARIO: NETWORK CONFLICT
// =============================================================================

/**
 * Worker scheduled at multiple restaurants creates conflicts
 * Tests conflict detection, resolution, and notifications
 */
export const networkConflictScenario: TestScenario = {
  name: 'network-conflict',
  description: 'Worker with profiles at multiple restaurants gets double-booked. Tests conflict detection and resolution.',
  tags: ['network', 'conflict', 'scheduling', 'validation'],
  setup: {
    restaurants: ['rest-0001-test', 'rest-0002-test'],
    workers: [
      'wprofile-0003-test', // Alex at Downtown
      'wprofile-0016-test', // Alex at Harbor
    ],
    shifts: ['shift-0021-test', 'shift-0025-test'], // Same time, different restaurants
    additionalData: {
      workerUserId: 'user-0003-test',
      conflictingShifts: {
        shift1: {
          id: 'shift-0021-test',
          restaurant: 'Downtown Bistro',
          time: 'Today 11:00-19:00',
        },
        shift2: {
          id: 'shift-0025-test',
          restaurant: 'Harbor Grill',
          time: 'Today 11:00-19:00',
        },
      },
    },
  },
  steps: [
    {
      action: 'ASSIGN_SHIFT',
      params: {
        shiftId: 'shift-0021-test',
        workerId: 'wprofile-0003-test',
      },
      expectedResult: {
        success: true,
        shiftAssigned: true,
      },
    },
    {
      action: 'ATTEMPT_CLAIM',
      params: {
        shiftId: 'shift-0025-test',
        workerId: 'wprofile-0016-test',
      },
      expectedResult: {
        success: false,
        reason: 'SCHEDULING_CONFLICT',
        conflictType: 'OVERLAPPING_SHIFTS',
        conflictingShiftId: 'shift-0021-test',
        message: 'Worker already scheduled at Downtown Bistro for overlapping time',
      },
    },
    {
      action: 'CHECK_AVAILABLE_SHIFTS',
      params: {
        workerId: 'wprofile-0016-test',
        date: 'Today',
      },
      expectedResult: {
        availableCount: 3, // Reduced because of conflict
        excludedShifts: ['shift-0025-test'],
        excludeReason: 'Conflicts with existing shift at Downtown Bistro',
      },
    },
    {
      action: 'RELEASE_SHIFT',
      params: {
        shiftId: 'shift-0021-test',
        workerId: 'wprofile-0003-test',
        reason: 'Worker request',
      },
      expectedResult: {
        success: true,
        shiftReleased: true,
        shiftStatus: ShiftStatus.PUBLISHED_UNASSIGNED,
      },
    },
    {
      action: 'ATTEMPT_CLAIM',
      params: {
        shiftId: 'shift-0025-test',
        workerId: 'wprofile-0016-test',
      },
      expectedResult: {
        success: true,
        claimCreated: true,
        noConflicts: true,
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'CONFLICT_PREVENTED',
    assertions: [
      { field: 'conflictsDetected', operator: 'equals', value: 1 },
      { field: 'conflictsPrevented', operator: 'equals', value: 1 },
      { field: 'doubleBookings', operator: 'equals', value: 0 },
      { field: 'notifications.sent', operator: 'greaterThan', value: 0 },
    ],
  },
};

// =============================================================================
// SCENARIO: SHIFT CANCELLATION CASCADE
// =============================================================================

/**
 * Cancelled shift triggers a cascade of notifications and re-assignments
 */
export const shiftCancellationCascadeScenario: TestScenario = {
  name: 'shift-cancellation-cascade',
  description: 'Manager cancels a confirmed shift, triggering notifications to worker and potential replacements.',
  tags: ['cancellation', 'notifications', 'workflow'],
  setup: {
    restaurants: ['rest-0001-test'],
    workers: ['wprofile-0003-test', 'wprofile-0006-test'],
    shifts: ['shift-0021-test'],
    additionalData: {
      confirmationDetails: {
        workerNotified: true,
        scheduledHoursAway: 6,
      },
    },
  },
  steps: [
    {
      action: 'CANCEL_SHIFT',
      params: {
        shiftId: 'shift-0021-test',
        cancelledBy: 'user-0001-test',
        reason: 'Low reservations',
      },
      expectedResult: {
        shiftCancelled: true,
        previousStatus: ShiftStatus.CONFIRMED,
        newStatus: ShiftStatus.CANCELLED,
      },
    },
    {
      action: 'VERIFY_NOTIFICATIONS',
      params: {
        shiftId: 'shift-0021-test',
      },
      expectedResult: {
        notificationsSent: [
          {
            recipient: 'user-0003-test',
            type: 'SHIFT_CANCELLED',
            urgency: 'HIGH',
          },
        ],
        totalNotifications: 1,
      },
    },
    {
      action: 'UPDATE_WORKER_SCHEDULE',
      params: {
        workerId: 'wprofile-0003-test',
        date: 'Today',
      },
      expectedResult: {
        shiftsRemoved: 1,
        hoursReduced: 7.5,
        earningsImpacted: 165.00,
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'CANCELLATION_PROCESSED',
    assertions: [
      { field: 'shift.status', operator: 'equals', value: ShiftStatus.CANCELLED },
      { field: 'worker.notified', operator: 'equals', value: true },
      { field: 'shift.assignedToId', operator: 'equals', value: null },
    ],
  },
};

// =============================================================================
// SCENARIO: NEW WORKER ONBOARDING
// =============================================================================

/**
 * New worker completes onboarding and claims first shift
 */
export const newWorkerOnboardingScenario: TestScenario = {
  name: 'new-worker-onboarding',
  description: 'New worker completes verification and claims their first shift with appropriate restrictions.',
  tags: ['onboarding', 'verification', 'new-worker'],
  setup: {
    restaurants: ['rest-0001-test'],
    workers: ['wprofile-0018-test'], // Pending verification
    shifts: ['shift-0007-test'], // Lower reputation requirement
    additionalData: {
      newWorker: {
        id: 'wprofile-0018-test',
        status: 'PENDING_VERIFICATION',
        defaultReputationScore: 3.0,
      },
    },
  },
  steps: [
    {
      action: 'ATTEMPT_CLAIM_BEFORE_VERIFICATION',
      params: {
        workerId: 'wprofile-0018-test',
        shiftId: 'shift-0007-test',
      },
      expectedResult: {
        success: false,
        reason: 'WORKER_NOT_VERIFIED',
        message: 'Complete verification before claiming shifts',
      },
    },
    {
      action: 'COMPLETE_VERIFICATION',
      params: {
        workerId: 'wprofile-0018-test',
        verifiedBy: 'user-0001-test',
      },
      expectedResult: {
        success: true,
        newStatus: 'ACTIVE',
        reputationScore: 3.0, // Default for new workers
      },
    },
    {
      action: 'ATTEMPT_CLAIM_HIGH_REPUTATION_SHIFT',
      params: {
        workerId: 'wprofile-0018-test',
        shiftId: 'shift-0006-test', // Requires 4.5 reputation
      },
      expectedResult: {
        success: false,
        reason: 'BELOW_MINIMUM_REPUTATION',
        required: 4.5,
        actual: 3.0,
      },
    },
    {
      action: 'CLAIM_APPROPRIATE_SHIFT',
      params: {
        workerId: 'wprofile-0018-test',
        shiftId: 'shift-0007-test', // Requires 3.5 reputation
      },
      expectedResult: {
        success: false, // Still below 3.5
        reason: 'BELOW_MINIMUM_REPUTATION',
        required: 3.5,
        actual: 3.0,
      },
    },
    {
      action: 'MANAGER_DIRECT_ASSIGNMENT',
      params: {
        shiftId: 'shift-0011-test', // No minimum reputation
        workerId: 'wprofile-0018-test',
        assignedBy: 'user-0001-test',
      },
      expectedResult: {
        success: true,
        shiftAssigned: true,
        note: 'Manager can override reputation requirements',
      },
    },
  ],
  expectedOutcome: {
    success: true,
    resultType: 'WORKER_ONBOARDED',
    assertions: [
      { field: 'worker.status', operator: 'equals', value: 'ACTIVE' },
      { field: 'worker.shiftsAssigned', operator: 'equals', value: 1 },
      { field: 'restrictedShifts.count', operator: 'greaterThan', value: 0 },
    ],
  },
};

// =============================================================================
// EXPORT ALL SCENARIOS
// =============================================================================

export const testScenarios = {
  'high-demand-saturday': highDemandSaturdayScenario,
  'cross-restaurant-swap': crossRestaurantSwapScenario,
  'ghost-kitchen-surge': ghostKitchenSurgeScenario,
  'instant-pay-limits': instantPayLimitsScenario,
  'ml-forecast-accuracy': mlForecastAccuracyScenario,
  'network-conflict': networkConflictScenario,
  'shift-cancellation-cascade': shiftCancellationCascadeScenario,
  'new-worker-onboarding': newWorkerOnboardingScenario,
};

/**
 * Get scenario by name
 */
export function getScenario(name: string): TestScenario | undefined {
  return testScenarios[name as keyof typeof testScenarios];
}

/**
 * Get scenarios by tag
 */
export function getScenariosByTag(tag: string): TestScenario[] {
  return Object.values(testScenarios).filter((s) => s.tags.includes(tag));
}

/**
 * Get all scenario names
 */
export function getScenarioNames(): string[] {
  return Object.keys(testScenarios);
}

export default testScenarios;
