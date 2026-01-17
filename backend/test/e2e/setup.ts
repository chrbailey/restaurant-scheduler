/**
 * E2E Test Setup
 *
 * Provides utilities for:
 * - Starting NestJS application
 * - Database seeding with test data
 * - Creating authenticated test users
 * - Mock external services
 * - Cleanup between tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';

// ============================================================================
// TYPES
// ============================================================================

export interface TestUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: 'WORKER' | 'SUPERVISOR' | 'MANAGER' | 'OWNER';
  restaurantId: string;
  workerProfileId?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface TestRestaurant {
  id: string;
  name: string;
  timezone: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface TestShift {
  id: string;
  restaurantId: string;
  position: string;
  startTime: Date;
  endTime: Date;
  status: string;
  workerId?: string;
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  config: ConfigService;
  users: {
    owner: TestUser;
    manager: TestUser;
    supervisor: TestUser;
    worker1: TestUser;
    worker2: TestUser;
  };
  restaurants: {
    primary: TestRestaurant;
    secondary: TestRestaurant;
  };
  shifts: TestShift[];
}

// ============================================================================
// MOCK SERVICES
// ============================================================================

/**
 * Mock OTP service for testing
 * Always accepts OTP code "123456"
 */
export const MockOtpService = {
  sendOtp: jest.fn().mockResolvedValue({ success: true, expiresAt: Date.now() + 300000 }),
  verifyOtp: jest.fn().mockImplementation((phone: string, code: string) => {
    return Promise.resolve(code === '123456');
  }),
};

/**
 * Mock Twilio SMS service
 */
export const MockTwilioService = {
  sendSms: jest.fn().mockResolvedValue({ sid: 'mock-message-sid', status: 'sent' }),
};

/**
 * Mock Firebase Admin for push notifications
 */
export const MockFirebaseAdmin = {
  messaging: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue('mock-message-id'),
    sendMulticast: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  }),
};

/**
 * Mock DailyPay client for instant pay
 */
export const MockDailyPayClient = {
  enrollEmployee: jest.fn().mockResolvedValue({
    dailypayEmployeeId: 'dp-emp-123',
    status: 'ACTIVE',
    enrolledAt: new Date().toISOString(),
    bankAccountVerified: true,
  }),
  getEmployee: jest.fn().mockResolvedValue({
    dailypayEmployeeId: 'dp-emp-123',
    status: 'ACTIVE',
    enrolledAt: new Date().toISOString(),
    bankAccountVerified: true,
  }),
  unenrollEmployee: jest.fn().mockResolvedValue({ success: true }),
  requestTransfer: jest.fn().mockResolvedValue({
    transferId: 'transfer-123',
    amount: 50.0,
    fee: 2.99,
    netAmount: 47.01,
    status: 'PENDING',
    estimatedArrival: new Date().toISOString(),
  }),
  getTransferHistory: jest.fn().mockResolvedValue({
    transfers: [],
    total: 0,
    page: 1,
    limit: 20,
  }),
  getBalance: jest.fn().mockResolvedValue({
    available: 150.0,
    pending: 25.0,
    total: 175.0,
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
};

/**
 * Mock KitchenHub client for ghost kitchen
 */
export const MockKitchenHubClient = {
  connect: jest.fn().mockResolvedValue({ connected: true }),
  disconnect: jest.fn().mockResolvedValue({ disconnected: true }),
  updateAvailability: jest.fn().mockResolvedValue({ success: true }),
  acceptOrder: jest.fn().mockResolvedValue({ orderId: 'order-123', accepted: true }),
  rejectOrder: jest.fn().mockResolvedValue({ orderId: 'order-123', rejected: true }),
  updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
};

// ============================================================================
// TEST APPLICATION SETUP
// ============================================================================

let testApp: INestApplication;
let testPrisma: PrismaService;

/**
 * Create and configure the test application
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('OtpService')
    .useValue(MockOtpService)
    .overrideProvider('TwilioService')
    .useValue(MockTwilioService)
    .overrideProvider('FirebaseAdmin')
    .useValue(MockFirebaseAdmin)
    .overrideProvider('DailyPayClient')
    .useValue(MockDailyPayClient)
    .overrideProvider('KitchenHubClient')
    .useValue(MockKitchenHubClient)
    .compile();

  const app = moduleFixture.createNestApplication();

  // Apply same configuration as production
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.init();

  testApp = app;
  testPrisma = app.get(PrismaService);

  return app;
}

/**
 * Get the test application instance
 */
export function getTestApp(): INestApplication {
  if (!testApp) {
    throw new Error('Test app not initialized. Call createTestApp() first.');
  }
  return testApp;
}

/**
 * Get the Prisma service instance
 */
export function getPrisma(): PrismaService {
  if (!testPrisma) {
    throw new Error('Prisma not initialized. Call createTestApp() first.');
  }
  return testPrisma;
}

/**
 * Close the test application
 */
export async function closeTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null as any;
    testPrisma = null as any;
  }
}

// ============================================================================
// DATABASE SEEDING
// ============================================================================

const TEST_PHONE_PREFIX = '+1555000';

/**
 * Generate a unique test phone number
 */
function generateTestPhone(index: number): string {
  return `${TEST_PHONE_PREFIX}${index.toString().padStart(4, '0')}`;
}

/**
 * Create test restaurants
 */
export async function seedRestaurants(prisma: PrismaService): Promise<{
  primary: TestRestaurant;
  secondary: TestRestaurant;
}> {
  const primary = await prisma.restaurant.create({
    data: {
      name: 'Test Restaurant Primary',
      slug: 'test-restaurant-primary',
      timezone: 'America/New_York',
      address: '123 Test Street, New York, NY 10001',
      latitude: 40.7128,
      longitude: -74.006,
      phone: '+12125551234',
      settings: {
        maxShiftHours: 12,
        minBreakMinutes: 30,
        autoApproveEnabled: false,
        defaultHourlyRate: 18.0,
      },
    },
  });

  const secondary = await prisma.restaurant.create({
    data: {
      name: 'Test Restaurant Secondary',
      slug: 'test-restaurant-secondary',
      timezone: 'America/New_York',
      address: '456 Other Ave, New York, NY 10002',
      latitude: 40.72,
      longitude: -74.01,
      phone: '+12125555678',
      settings: {
        maxShiftHours: 10,
        minBreakMinutes: 30,
        autoApproveEnabled: true,
        defaultHourlyRate: 16.0,
      },
    },
  });

  return {
    primary: {
      id: primary.id,
      name: primary.name,
      timezone: primary.timezone,
      address: primary.address,
      latitude: primary.latitude,
      longitude: primary.longitude,
    },
    secondary: {
      id: secondary.id,
      name: secondary.name,
      timezone: secondary.timezone,
      address: secondary.address,
      latitude: secondary.latitude,
      longitude: secondary.longitude,
    },
  };
}

/**
 * Create a test user with the specified role
 */
export async function createTestUser(
  prisma: PrismaService,
  restaurantId: string,
  role: TestUser['role'],
  index: number,
): Promise<TestUser> {
  const phone = generateTestPhone(index);
  const firstName = `Test${role}`;
  const lastName = `User${index}`;

  const user = await prisma.user.create({
    data: {
      phone,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}${index}@test.example`,
      phoneVerified: true,
      locale: 'en-US',
      timezone: 'America/New_York',
    },
  });

  // Create restaurant membership with role
  await prisma.restaurantMember.create({
    data: {
      userId: user.id,
      restaurantId,
      role,
      status: 'ACTIVE',
    },
  });

  // Create worker profile for workers
  let workerProfileId: string | undefined;
  if (role === 'WORKER' || role === 'SUPERVISOR') {
    const workerProfile = await prisma.workerProfile.create({
      data: {
        userId: user.id,
        restaurantId,
        positions: ['SERVER', 'HOST'],
        status: 'ACTIVE',
        hourlyRate: 18.0,
        maxHoursPerWeek: 40,
        reputationScore: 100,
      },
    });
    workerProfileId = workerProfile.id;
  }

  return {
    id: user.id,
    phone,
    firstName,
    lastName,
    email: user.email ?? undefined,
    role,
    restaurantId,
    workerProfileId,
  };
}

/**
 * Create all test users
 */
export async function seedUsers(
  prisma: PrismaService,
  restaurantId: string,
): Promise<TestContext['users']> {
  const owner = await createTestUser(prisma, restaurantId, 'OWNER', 1);
  const manager = await createTestUser(prisma, restaurantId, 'MANAGER', 2);
  const supervisor = await createTestUser(prisma, restaurantId, 'SUPERVISOR', 3);
  const worker1 = await createTestUser(prisma, restaurantId, 'WORKER', 4);
  const worker2 = await createTestUser(prisma, restaurantId, 'WORKER', 5);

  return { owner, manager, supervisor, worker1, worker2 };
}

/**
 * Create test shifts
 */
export async function seedShifts(
  prisma: PrismaService,
  restaurantId: string,
  managerId: string,
): Promise<TestShift[]> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const shifts: TestShift[] = [];

  // Draft shift
  const draftShift = await prisma.shift.create({
    data: {
      restaurantId,
      createdById: managerId,
      position: 'SERVER',
      startTime: new Date(tomorrow.getTime() + 8 * 60 * 60 * 1000),
      endTime: new Date(tomorrow.getTime() + 16 * 60 * 60 * 1000),
      status: 'DRAFT',
      breakMinutes: 30,
    },
  });
  shifts.push({
    id: draftShift.id,
    restaurantId,
    position: draftShift.position,
    startTime: draftShift.startTime,
    endTime: draftShift.endTime,
    status: draftShift.status,
  });

  // Published/Open shift
  const openShift = await prisma.shift.create({
    data: {
      restaurantId,
      createdById: managerId,
      position: 'HOST',
      startTime: new Date(tomorrow.getTime() + 10 * 60 * 60 * 1000),
      endTime: new Date(tomorrow.getTime() + 18 * 60 * 60 * 1000),
      status: 'OPEN',
      breakMinutes: 30,
      publishedAt: now,
    },
  });
  shifts.push({
    id: openShift.id,
    restaurantId,
    position: openShift.position,
    startTime: openShift.startTime,
    endTime: openShift.endTime,
    status: openShift.status,
  });

  // Add more shifts for the next 7 days
  for (let i = 2; i <= 7; i++) {
    const shiftDate = new Date(now);
    shiftDate.setDate(shiftDate.getDate() + i);
    shiftDate.setHours(9, 0, 0, 0);

    const shift = await prisma.shift.create({
      data: {
        restaurantId,
        createdById: managerId,
        position: i % 2 === 0 ? 'SERVER' : 'BARTENDER',
        startTime: shiftDate,
        endTime: new Date(shiftDate.getTime() + 8 * 60 * 60 * 1000),
        status: 'OPEN',
        breakMinutes: 30,
        publishedAt: now,
      },
    });
    shifts.push({
      id: shift.id,
      restaurantId,
      position: shift.position,
      startTime: shift.startTime,
      endTime: shift.endTime,
      status: shift.status,
    });
  }

  return shifts;
}

/**
 * Seed all test data
 */
export async function seedDatabase(prisma: PrismaService): Promise<Omit<TestContext, 'app' | 'prisma' | 'config'>> {
  const restaurants = await seedRestaurants(prisma);
  const users = await seedUsers(prisma, restaurants.primary.id);
  const shifts = await seedShifts(prisma, restaurants.primary.id, users.manager.id);

  return { users, restaurants, shifts };
}

/**
 * Clean up test data
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // Delete in order respecting foreign key constraints
  const tablesToClean = [
    'shift_claim',
    'swap_request',
    'shift_history',
    'shift',
    'trade_negotiation_message',
    'trade_negotiation',
    'trade_match',
    'trade_offer',
    'instant_pay_transfer',
    'worker_earnings',
    'cross_training',
    'network_membership',
    'restaurant_network',
    'ghost_order',
    'ghost_kitchen_session',
    'notification',
    'device',
    'refresh_token',
    'worker_availability',
    'worker_profile',
    'restaurant_member',
    'restaurant',
    'user',
  ];

  for (const table of tablesToClean) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE 1=1`);
    } catch {
      // Table might not exist or have different name, skip
    }
  }
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Authenticate a test user and get tokens
 */
export async function authenticateUser(
  app: INestApplication,
  user: TestUser,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Request OTP
  await request(app.getHttpServer())
    .post('/api/auth/otp/request')
    .send({ phone: user.phone })
    .expect(200);

  // Verify OTP
  const response = await request(app.getHttpServer())
    .post('/api/auth/otp/verify')
    .send({
      phone: user.phone,
      code: '123456',
      deviceId: `test-device-${user.id}`,
      deviceName: 'Test Device',
    })
    .expect(200);

  user.accessToken = response.body.accessToken;
  user.refreshToken = response.body.refreshToken;

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

/**
 * Create an authenticated request with the user's token
 */
export function authenticatedRequest(
  app: INestApplication,
  user: TestUser,
): request.SuperTest<request.Test> {
  if (!user.accessToken) {
    throw new Error(`User ${user.firstName} is not authenticated. Call authenticateUser() first.`);
  }

  const agent = request(app.getHttpServer());
  // Note: supertest doesn't support default headers on the agent,
  // use the helper functions below instead
  return agent;
}

/**
 * Make a GET request with authentication
 */
export function authGet(
  app: INestApplication,
  user: TestUser,
  url: string,
): request.Test {
  return request(app.getHttpServer())
    .get(url)
    .set('Authorization', `Bearer ${user.accessToken}`);
}

/**
 * Make a POST request with authentication
 */
export function authPost(
  app: INestApplication,
  user: TestUser,
  url: string,
  body?: object,
): request.Test {
  const req = request(app.getHttpServer())
    .post(url)
    .set('Authorization', `Bearer ${user.accessToken}`);

  if (body) {
    req.send(body);
  }

  return req;
}

/**
 * Make a PUT request with authentication
 */
export function authPut(
  app: INestApplication,
  user: TestUser,
  url: string,
  body?: object,
): request.Test {
  const req = request(app.getHttpServer())
    .put(url)
    .set('Authorization', `Bearer ${user.accessToken}`);

  if (body) {
    req.send(body);
  }

  return req;
}

/**
 * Make a DELETE request with authentication
 */
export function authDelete(
  app: INestApplication,
  user: TestUser,
  url: string,
): request.Test {
  return request(app.getHttpServer())
    .delete(url)
    .set('Authorization', `Bearer ${user.accessToken}`);
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Generate a future date/time for shift testing
 */
export function futureDate(daysFromNow: number, hour = 9): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/**
 * Generate a date range for the current week
 */
export function currentWeekRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - dayOfWeek);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Generate a valid webhook signature for KitchenHub
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  const crypto = require('crypto');
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  return `sha256=${hmac.digest('hex')}`;
}

// ============================================================================
// GLOBAL TEST HOOKS
// ============================================================================

// This file is loaded via setupFilesAfterEnv in jest-e2e.json
// Add any global beforeAll/afterAll hooks here if needed

beforeAll(async () => {
  // Any global setup
});

afterAll(async () => {
  // Any global teardown
});
