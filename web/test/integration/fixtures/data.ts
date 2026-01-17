import { format, addDays, addHours } from 'date-fns';

// Helper to create ISO date strings
const now = new Date();
const today = format(now, 'yyyy-MM-dd');
const todayISO = now.toISOString();

// ================== SHIFTS ==================
export const mockShifts = [
  {
    id: 'shift-1',
    position: 'SERVER',
    startTime: `${today}T09:00:00.000Z`,
    endTime: `${today}T15:00:00.000Z`,
    status: 'CONFIRMED',
    assignedWorker: {
      id: 'worker-1',
      user: {
        firstName: 'John',
        lastName: 'Smith',
        phone: '555-0101',
      },
    },
    notes: 'Morning shift',
    requiredCount: 1,
  },
  {
    id: 'shift-2',
    position: 'LINE_COOK',
    startTime: `${today}T12:00:00.000Z`,
    endTime: `${today}T20:00:00.000Z`,
    status: 'PUBLISHED_UNASSIGNED',
    assignedWorker: null,
    notes: null,
    requiredCount: 2,
  },
  {
    id: 'shift-3',
    position: 'BARTENDER',
    startTime: `${today}T17:00:00.000Z`,
    endTime: `${today}T23:00:00.000Z`,
    status: 'PUBLISHED_CLAIMED',
    assignedWorker: null,
    notes: 'Evening rush expected',
    requiredCount: 1,
  },
];

// ================== WORKERS ==================
export const mockWorkers = [
  {
    id: 'worker-1',
    user: {
      firstName: 'John',
      lastName: 'Smith',
      phone: '555-0101',
      email: 'john.smith@example.com',
    },
    positions: ['SERVER', 'HOST'],
    role: 'WORKER',
    reputationScore: 4.5,
    reliabilityScore: 0.92,
    shiftsCompleted: 156,
    isActive: true,
    isPrimaryTier: true,
  },
  {
    id: 'worker-2',
    user: {
      firstName: 'Sarah',
      lastName: 'Johnson',
      phone: '555-0102',
      email: 'sarah.j@example.com',
    },
    positions: ['LINE_COOK', 'PREP_COOK'],
    role: 'LEAD',
    reputationScore: 4.8,
    reliabilityScore: 0.95,
    shiftsCompleted: 234,
    isActive: true,
    isPrimaryTier: true,
  },
  {
    id: 'worker-3',
    user: {
      firstName: 'Mike',
      lastName: 'Wilson',
      phone: '555-0103',
      email: 'mike.w@example.com',
    },
    positions: ['BARTENDER'],
    role: 'WORKER',
    reputationScore: 4.2,
    reliabilityScore: 0.78,
    shiftsCompleted: 89,
    isActive: true,
    isPrimaryTier: false,
  },
];

// ================== CLAIMS ==================
export const mockClaims = [
  {
    id: 'claim-1',
    worker: mockWorkers[2],
    shift: mockShifts[1],
    status: 'PENDING',
    priorityScore: 1250,
    createdAt: `${today}T08:30:00.000Z`,
    isOwnEmployee: true,
  },
  {
    id: 'claim-2',
    worker: mockWorkers[0],
    shift: mockShifts[2],
    status: 'PENDING',
    priorityScore: 850,
    createdAt: `${today}T09:15:00.000Z`,
    isOwnEmployee: true,
  },
];

// ================== SWAPS ==================
export const mockSwaps = [
  {
    id: 'swap-1',
    requester: mockWorkers[0],
    recipient: mockWorkers[1],
    shiftOffered: mockShifts[0],
    shiftRequested: mockShifts[1],
    status: 'PENDING',
    createdAt: `${today}T07:00:00.000Z`,
  },
];

// ================== GHOST KITCHEN ==================
export const mockGhostKitchenStatus = {
  isActive: true,
  maxCapacity: 15,
  currentCapacity: 8,
  autoAccept: true,
  sessionDuration: 7200, // 2 hours in seconds
  orderCount: 12,
};

export const mockOrders = [
  {
    id: 'order-1',
    platform: 'DoorDash',
    platformOrderId: 'DD-12345',
    status: 'NEW' as const,
    createdAt: new Date(Date.now() - 120000).toISOString(), // 2 mins ago
    items: [
      { name: 'Burger Deluxe', quantity: 2, notes: 'No onions' },
      { name: 'Fries', quantity: 2 },
    ],
    total: 35.98,
    customerName: 'Alex B.',
    estimatedPrepTime: 15,
    driverEta: 10,
  },
  {
    id: 'order-2',
    platform: 'UberEats',
    platformOrderId: 'UE-67890',
    status: 'PREPARING' as const,
    createdAt: new Date(Date.now() - 600000).toISOString(), // 10 mins ago
    acceptedAt: new Date(Date.now() - 540000).toISOString(),
    items: [
      { name: 'Pasta Carbonara', quantity: 1 },
      { name: 'Caesar Salad', quantity: 1 },
    ],
    total: 28.5,
    customerName: 'Maria C.',
    estimatedPrepTime: 20,
    driverEta: 5,
  },
  {
    id: 'order-3',
    platform: 'Grubhub',
    platformOrderId: 'GH-11111',
    status: 'READY' as const,
    createdAt: new Date(Date.now() - 1200000).toISOString(), // 20 mins ago
    acceptedAt: new Date(Date.now() - 1140000).toISOString(),
    items: [
      { name: 'Pizza Margherita', quantity: 1 },
    ],
    total: 18.99,
    customerName: 'Tom D.',
    driverEta: 2,
  },
];

export const mockForecast = {
  hourly: [
    { hour: '11:00', dineIn: 20, delivery: 8, opportunity: false },
    { hour: '12:00', dineIn: 45, delivery: 15, opportunity: false },
    { hour: '13:00', dineIn: 50, delivery: 12, opportunity: false },
    { hour: '14:00', dineIn: 25, delivery: 18, opportunity: true },
    { hour: '15:00', dineIn: 15, delivery: 22, opportunity: true },
    { hour: '16:00', dineIn: 18, delivery: 20, opportunity: true },
    { hour: '17:00', dineIn: 35, delivery: 25, opportunity: false },
    { hour: '18:00', dineIn: 60, delivery: 30, opportunity: false },
    { hour: '19:00', dineIn: 70, delivery: 28, opportunity: false },
    { hour: '20:00', dineIn: 55, delivery: 22, opportunity: false },
    { hour: '21:00', dineIn: 30, delivery: 15, opportunity: false },
  ],
  weather: {
    condition: 'Cloudy',
    temp: '55F',
    deliveryBoost: 12,
  },
  opportunities: [
    { startTime: '14:00', endTime: '16:00', score: 85 },
  ],
};

export const mockGhostKitchenStats = {
  totalOrders: 47,
  totalRevenue: 1289.50,
  ordersChange: 12,
  revenueChange: 8.5,
  avgPrepTime: 18,
  vsYesterday: 115,
  byPlatform: {
    DoorDash: { orders: 22, revenue: 598.00 },
    UberEats: { orders: 15, revenue: 421.50 },
    Grubhub: { orders: 10, revenue: 270.00 },
  },
};

export const mockGhostKitchenAnalytics = {
  totalRevenue: 4580.50,
  totalCosts: 2890.25,
  netProfit: 1690.25,
  profitMargin: 36.9,
  profitChange: 5.2,
  totalOrders: 156,
  avgPrepTime: 17,
  avgOrderValue: 29.36,
  avgOrdersPerHour: 8.5,
  avgCapacityUtilization: 62,
  peakHours: ['12:00', '18:00', '19:00'],
  revenueByPlatform: {
    DoorDash: 1980.50,
    UberEats: 1520.00,
    Grubhub: 1080.00,
  },
  costs: {
    labor: 1450.00,
    supplies: 420.25,
    platformFees: 820.00,
    other: 200.00,
  },
  ordersPerHour: [2, 3, 5, 8, 10, 12, 15, 18, 20, 22, 18, 14, 10, 8, 6, 4],
};

// ================== ANALYTICS ==================
export const mockExecutiveAnalytics = {
  laborCost: 4532,
  laborCostChange: -2.3,
  efficiency: 87,
  forecastAccuracy: 91.2,
  mape: 8.8,
  workerSatisfaction: 4.2,
  feedbackCount: 47,
  laborCostTrend: [4200, 4350, 4100, 4500, 4300, 4450, 4600],
  efficiencyTrend: [82, 85, 83, 87, 84, 88, 86],
  aiRecommendation: 'Consider scheduling an additional server for Saturday evening (6-10 PM) to handle expected demand increase.',
};

export const mockAlerts = {
  items: [
    {
      type: 'critical',
      title: '3 unfilled shifts tomorrow',
      description: 'Morning shifts on tomorrow need coverage. Consider posting to shift pool.',
      action: 'Fill Gaps',
      actionPath: '/ai-scheduling/suggestions',
    },
    {
      type: 'warning',
      title: 'Overtime threshold approaching',
      description: '2 workers are at 35+ hours this week. Monitor to avoid overtime costs.',
      action: 'View Workers',
      actionPath: '/analytics/workers',
    },
  ],
};

export const mockLaborAnalytics = {
  totalLabor: 5360,
  regularPay: 4980,
  overtimePay: 280,
  instantPayAdvances: 100,
  laborAsPercentOfRevenue: 28.5,
  costByPosition: [
    { position: 'Server', cost: 1850, hours: 120, avgRate: 15.42 },
    { position: 'Line Cook', cost: 1420, hours: 80, avgRate: 17.75 },
    { position: 'Host', cost: 680, hours: 45, avgRate: 15.11 },
    { position: 'Bartender', cost: 890, hours: 52, avgRate: 17.12 },
    { position: 'Dishwasher', cost: 520, hours: 40, avgRate: 13.0 },
  ],
  costByDay: [
    { day: 'Monday', cost: 580, hours: 38 },
    { day: 'Tuesday', cost: 620, hours: 40 },
    { day: 'Wednesday', cost: 640, hours: 42 },
    { day: 'Thursday', cost: 720, hours: 48 },
    { day: 'Friday', cost: 980, hours: 65 },
    { day: 'Saturday', cost: 1100, hours: 72 },
    { day: 'Sunday', cost: 720, hours: 48 },
  ],
  recommendations: [
    {
      type: 'savings',
      title: 'Reduce Saturday afternoon staffing',
      description: 'Data shows consistent overstaffing 2-5 PM on Saturdays. Consider reducing by 1 server.',
      impact: '$120/week potential savings',
    },
    {
      type: 'warning',
      title: 'Friday dinner understaffed',
      description: 'Peak hours (6-9 PM) show consistent understaffing. Consider adding coverage.',
      impact: 'Improve service quality',
    },
  ],
};

// ================== PAYMENTS ==================
export const mockPaymentsOverview = {
  enrolledWorkers: 24,
  totalWorkers: 32,
  totalTransferred: 4850,
  transferCount: 67,
  avgTransferAmount: 72.39,
  feeRevenue: 145.50,
  pendingTransfers: [
    {
      id: 'pt1',
      workerId: 'w1',
      workerName: 'John Smith',
      amount: 85.00,
      earnedBalance: 185.00,
      requestedAt: `${today}T14:30:00.000Z`,
      status: 'pending',
    },
    {
      id: 'pt2',
      workerId: 'w2',
      workerName: 'Sarah Johnson',
      amount: 120.00,
      earnedBalance: 320.00,
      requestedAt: `${today}T10:15:00.000Z`,
      status: 'processing',
    },
  ],
  transferHistory: [
    { date: 'Jan 12', amount: 450 },
    { date: 'Jan 13', amount: 380 },
    { date: 'Jan 14', amount: 520 },
    { date: 'Jan 15', amount: 680 },
    { date: 'Jan 16', amount: 590 },
    { date: 'Jan 17', amount: 720 },
    { date: 'Jan 18', amount: 850 },
  ],
};

// ================== NETWORK ==================
export const mockNetworks = [
  {
    id: 'network-1',
    name: 'Downtown Restaurant Group',
    memberCount: 8,
  },
];

export const mockNetworkShifts = {
  incoming: [
    {
      id: 'ns-1',
      worker: mockWorkers[0],
      homeRestaurant: { id: 'rest-2', name: 'Bistro Next Door' },
      workingRestaurant: { id: 'rest-1', name: 'Main Restaurant' },
      position: 'SERVER',
      startTime: `${today}T11:00:00.000Z`,
      endTime: `${today}T19:00:00.000Z`,
    },
  ],
  outgoing: [
    {
      id: 'ns-2',
      worker: mockWorkers[1],
      homeRestaurant: { id: 'rest-1', name: 'Main Restaurant' },
      workingRestaurant: { id: 'rest-3', name: 'Partner Grill' },
      position: 'LINE_COOK',
      startTime: `${today}T12:00:00.000Z`,
      endTime: `${today}T20:00:00.000Z`,
    },
  ],
};

// ================== DASHBOARD ==================
export const mockDashboardStats = {
  todayShifts: 12,
  activeWorkers: 8,
  unfilledShifts: 3,
  coverageGaps: 1,
};

// ================== AI SUGGESTIONS ==================
export const mockWorkerSuggestions = [
  {
    workerId: 'worker-1',
    firstName: 'John',
    lastName: 'Smith',
    matchScore: 95,
    reasons: [
      'Has worked 45 shifts in this position',
      'Available based on calendar',
      'High reliability score (92%)',
      'Preferred by other team members',
    ],
    availability: 'confirmed' as const,
    reliabilityScore: 0.92,
    previousShiftsInPosition: 45,
  },
  {
    workerId: 'worker-2',
    firstName: 'Sarah',
    lastName: 'Johnson',
    matchScore: 82,
    reasons: [
      'Cross-trained in position',
      'Likely available based on patterns',
      'High reliability score (95%)',
    ],
    availability: 'likely' as const,
    reliabilityScore: 0.95,
    previousShiftsInPosition: 12,
  },
  {
    workerId: 'worker-3',
    firstName: 'Mike',
    lastName: 'Wilson',
    matchScore: 68,
    reasons: [
      'Qualified for position',
      'Has expressed interest in more hours',
    ],
    availability: 'unknown' as const,
    reliabilityScore: 0.78,
    previousShiftsInPosition: 5,
  },
];

// ================== SESSIONS ==================
export const mockGhostKitchenSessions = [
  {
    id: 'session-1',
    startedAt: `${today}T11:00:00.000Z`,
    endedAt: `${today}T15:00:00.000Z`,
    duration: 14400, // 4 hours
    totalOrders: 32,
    totalRevenue: 890.50,
    avgOrderValue: 27.83,
    peakCapacity: 12,
    maxCapacity: 15,
  },
  {
    id: 'session-2',
    startedAt: `${today}T17:00:00.000Z`,
    endedAt: null,
    duration: 7200, // 2 hours so far
    totalOrders: 18,
    totalRevenue: 520.00,
    avgOrderValue: 28.89,
    peakCapacity: 8,
    maxCapacity: 15,
  },
];

// ================== IDENTITY ==================
export const mockIdentity = {
  name: 'Manager User',
  restaurantId: 'rest-1',
  restaurantName: 'Main Restaurant',
};
