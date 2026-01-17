/**
 * Auth E2E Tests
 *
 * Tests for authentication endpoints:
 * - Phone OTP login flow
 * - JWT token refresh
 * - Device binding
 * - Logout and token invalidation
 * - Unauthorized access returns 401
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  seedDatabase,
  cleanDatabase,
  getPrisma,
  TestUser,
  TestContext,
  MockOtpService,
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Auth E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let context: Omit<TestContext, 'app' | 'prisma' | 'config'>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    context = await seedDatabase(prisma);
    jest.clearAllMocks();
  });

  // ==========================================================================
  // OTP REQUEST TESTS
  // ==========================================================================

  describe('POST /api/auth/otp/request', () => {
    it('should send OTP to valid phone number', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(MockOtpService.sendOtp).toHaveBeenCalledWith(
        expect.objectContaining({ phone: context.users.worker1.phone }),
      );
    });

    it('should accept phone in E.164 format', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: '+14155551234' })
        .expect(200);
    });

    it('should reject invalid phone format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: 'invalid-phone' })
        .expect(400);

      expect(response.body.message).toContain('phone');
    });

    it('should reject empty phone', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: '' })
        .expect(400);
    });

    it('should reject missing phone field', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({})
        .expect(400);
    });
  });

  // ==========================================================================
  // OTP VERIFICATION TESTS
  // ==========================================================================

  describe('POST /api/auth/otp/verify', () => {
    it('should return tokens for valid OTP', async () => {
      // First request OTP
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone })
        .expect(200);

      // Verify OTP
      const response = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'test-device-1',
          deviceName: 'Test iPhone',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('phone', context.users.worker1.phone);
      expect(response.body.user).toHaveProperty('firstName', context.users.worker1.firstName);
      expect(response.body.user).toHaveProperty('lastName', context.users.worker1.lastName);
    });

    it('should reject invalid OTP code', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone })
        .expect(200);

      MockOtpService.verifyOtp.mockResolvedValueOnce(false);

      const response = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '000000',
          deviceId: 'test-device-1',
        })
        .expect(401);

      expect(response.body.message).toContain('Invalid');
    });

    it('should reject expired OTP', async () => {
      MockOtpService.verifyOtp.mockResolvedValueOnce(false);

      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'test-device-1',
        })
        .expect(401);
    });

    it('should require deviceId', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
        })
        .expect(400);
    });

    it('should reject OTP code with wrong length', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123', // Too short
          deviceId: 'test-device-1',
        })
        .expect(400);
    });
  });

  // ==========================================================================
  // DEVICE BINDING TESTS
  // ==========================================================================

  describe('Device Binding', () => {
    it('should bind token to device on login', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      const response = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'device-abc-123',
          deviceName: 'My iPhone',
        })
        .expect(200);

      // Verify device was stored
      const devices = await prisma.device.findMany({
        where: { userId: context.users.worker1.id },
      });

      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0]).toMatchObject({
        deviceId: 'device-abc-123',
        name: 'My iPhone',
      });
    });

    it('should allow multiple devices per user', async () => {
      // Login from device 1
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'device-1',
          deviceName: 'iPhone',
        })
        .expect(200);

      // Login from device 2
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'device-2',
          deviceName: 'iPad',
        })
        .expect(200);

      // Check both devices exist
      const devices = await prisma.device.findMany({
        where: { userId: context.users.worker1.id },
      });

      expect(devices.length).toBe(2);
    });

    it('should update existing device on re-login', async () => {
      // First login
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'same-device',
          deviceName: 'Original Name',
        })
        .expect(200);

      // Second login from same device
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'same-device',
          deviceName: 'Updated Name',
        })
        .expect(200);

      // Should only have one device entry
      const devices = await prisma.device.findMany({
        where: {
          userId: context.users.worker1.id,
          deviceId: 'same-device',
        },
      });

      expect(devices.length).toBe(1);
      expect(devices[0].name).toBe('Updated Name');
    });
  });

  // ==========================================================================
  // TOKEN REFRESH TESTS
  // ==========================================================================

  describe('POST /api/auth/token/refresh', () => {
    let accessToken: string;
    let refreshToken: string;
    const deviceId = 'test-device-refresh';

    beforeEach(async () => {
      // Login to get tokens
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId,
        })
        .expect(200);

      accessToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should return new tokens with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken,
          deviceId,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.accessToken).not.toBe(accessToken);
    });

    it('should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken: 'invalid-token-12345',
          deviceId,
        })
        .expect(401);
    });

    it('should reject refresh with wrong device ID', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken,
          deviceId: 'wrong-device-id',
        })
        .expect(401);
    });

    it('should invalidate old refresh token after use (rotation)', async () => {
      // Use refresh token
      const response = await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken,
          deviceId,
        })
        .expect(200);

      const newRefreshToken = response.body.refreshToken;

      // Try to use old refresh token again
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken, // Old token
          deviceId,
        })
        .expect(401);

      // New token should work
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken: newRefreshToken,
          deviceId,
        })
        .expect(200);
    });

    it('should require deviceId in refresh request', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken,
        })
        .expect(400);
    });
  });

  // ==========================================================================
  // LOGOUT TESTS
  // ==========================================================================

  describe('POST /api/auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;
    const deviceId = 'test-device-logout';

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId,
        })
        .expect(200);

      accessToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should logout successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should invalidate refresh token after logout', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
        })
        .expect(200);

      // Try to use the refresh token
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken,
          deviceId,
        })
        .expect(401);
    });

    it('should logout from all devices when allDevices is true', async () => {
      // Login from second device
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      const secondLogin = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId: 'device-2',
        })
        .expect(200);

      const secondRefreshToken = secondLogin.body.refreshToken;

      // Logout from all devices
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken,
          allDevices: true,
        })
        .expect(200);

      // Second device's token should also be invalid
      await request(app.getHttpServer())
        .post('/api/auth/token/refresh')
        .send({
          refreshToken: secondRefreshToken,
          deviceId: 'device-2',
        })
        .expect(401);
    });

    it('should require authentication for logout', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({
          refreshToken,
        })
        .expect(401);
    });
  });

  // ==========================================================================
  // UNAUTHORIZED ACCESS TESTS
  // ==========================================================================

  describe('Unauthorized Access', () => {
    it('should return 401 for protected routes without token', async () => {
      await request(app.getHttpServer())
        .get(`/api/restaurants/${context.restaurants.primary.id}/shifts`)
        .expect(401);
    });

    it('should return 401 for invalid token', async () => {
      await request(app.getHttpServer())
        .get(`/api/restaurants/${context.restaurants.primary.id}/shifts`)
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(401);
    });

    it('should return 401 for expired token', async () => {
      // Create a token with past expiration (mock this scenario)
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.' +
        'invalid-signature';

      await request(app.getHttpServer())
        .get(`/api/restaurants/${context.restaurants.primary.id}/shifts`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should return 401 for malformed authorization header', async () => {
      await request(app.getHttpServer())
        .get(`/api/restaurants/${context.restaurants.primary.id}/shifts`)
        .set('Authorization', 'NotBearer some-token')
        .expect(401);
    });

    it('should allow access to public endpoints without token', async () => {
      // OTP request is a public endpoint
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: '+14155551234' })
        .expect(200);
    });
  });

  // ==========================================================================
  // USER REGISTRATION TESTS
  // ==========================================================================

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          phone: '+14155559999',
          firstName: 'New',
          lastName: 'User',
          email: 'newuser@example.com',
          timezone: 'America/Los_Angeles',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');

      // Verify user was created in database
      const user = await prisma.user.findUnique({
        where: { phone: '+14155559999' },
      });

      expect(user).toBeDefined();
      expect(user!.firstName).toBe('New');
      expect(user!.lastName).toBe('User');
    });

    it('should reject duplicate phone number', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          phone: context.users.worker1.phone,
          firstName: 'Duplicate',
          lastName: 'User',
        })
        .expect(409);
    });

    it('should require first and last name', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          phone: '+14155558888',
        })
        .expect(400);
    });

    it('should accept optional email and timezone', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          phone: '+14155557777',
          firstName: 'Optional',
          lastName: 'Fields',
          // No email or timezone
        })
        .expect(201);
    });
  });

  // ==========================================================================
  // FCM TOKEN UPDATE TESTS
  // ==========================================================================

  describe('POST /api/auth/fcm-token', () => {
    let accessToken: string;
    const deviceId = 'fcm-test-device';

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: context.users.worker1.phone });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: context.users.worker1.phone,
          code: '123456',
          deviceId,
        })
        .expect(200);

      accessToken = loginResponse.body.accessToken;
    });

    it('should update FCM token for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/fcm-token')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          token: 'fcm-token-abc123',
          deviceId,
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify token was stored
      const device = await prisma.device.findFirst({
        where: {
          userId: context.users.worker1.id,
          deviceId,
        },
      });

      expect(device).toBeDefined();
      expect(device!.fcmToken).toBe('fcm-token-abc123');
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/fcm-token')
        .send({
          token: 'fcm-token-abc123',
          deviceId: 'some-device',
        })
        .expect(401);
    });

    it('should require token and deviceId', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/fcm-token')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });
});
