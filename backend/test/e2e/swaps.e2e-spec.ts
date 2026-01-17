/**
 * Swaps E2E Tests
 *
 * Tests for shift swap endpoints:
 * - POST /swaps - Create swap request
 * - GET /swaps - List swap requests
 * - POST /swaps/:id/accept - Accept swap
 * - POST /swaps/:id/reject - Reject swap
 * - Test notification triggers
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  seedDatabase,
  cleanDatabase,
  getPrisma,
  authenticateUser,
  authGet,
  authPost,
  authDelete,
  TestContext,
  futureDate,
  MockFirebaseAdmin,
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Swaps E2E Tests', () => {
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

    await Promise.all([
      authenticateUser(app, context.users.owner),
      authenticateUser(app, context.users.manager),
      authenticateUser(app, context.users.supervisor),
      authenticateUser(app, context.users.worker1),
      authenticateUser(app, context.users.worker2),
    ]);

    jest.clearAllMocks();
  });

  const swapsUrl = (restaurantId: string) => `/api/restaurants/${restaurantId}/swaps`;

  // Helper to create an assigned shift for a worker
  async function createAssignedShift(workerId: string, daysFromNow: number = 3) {
    return prisma.shift.create({
      data: {
        restaurantId: context.restaurants.primary.id,
        createdById: context.users.manager.id,
        position: 'SERVER',
        startTime: futureDate(daysFromNow, 9),
        endTime: futureDate(daysFromNow, 17),
        status: 'CONFIRMED',
        workerId,
      },
    });
  }

  // ==========================================================================
  // CREATE SWAP REQUEST TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/swaps', () => {
    it('should create swap request for assigned shift', async () => {
      const assignedShift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: assignedShift.id,
          message: 'Need someone to cover my shift',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('shiftId', assignedShift.id);
      expect(response.body).toHaveProperty('requestorId', context.users.worker1.workerProfileId);
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('message', 'Need someone to cover my shift');
    });

    it('should create swap request targeting specific worker', async () => {
      const assignedShift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: assignedShift.id,
          targetWorkerId: context.users.worker2.workerProfileId,
          message: 'Hey, can you cover for me?',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('targetWorkerId', context.users.worker2.workerProfileId);
    });

    it('should create swap request proposing a trade (shift for shift)', async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const response = await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: shift1.id,
          targetWorkerId: context.users.worker2.workerProfileId,
          targetShiftId: shift2.id,
          message: 'Want to trade shifts?',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('targetShiftId', shift2.id);
    });

    it('should reject swap request for shift not assigned to worker', async () => {
      const otherWorkersShift = await createAssignedShift(context.users.worker2.workerProfileId!);

      await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: otherWorkersShift.id,
        },
      ).expect(403);
    });

    it('should reject swap request for non-existent shift', async () => {
      await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: 'non-existent-shift-id',
        },
      ).expect(404);
    });

    it('should set expiration time if specified', async () => {
      const assignedShift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: assignedShift.id,
          expiresInHours: 24,
        },
      ).expect(201);

      expect(response.body).toHaveProperty('expiresAt');
      const expiresAt = new Date(response.body.expiresAt);
      const expectedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(60000); // Within 1 minute
    });
  });

  // ==========================================================================
  // DROP TO POOL TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/swaps/drop', () => {
    it('should drop shift to pool for others to claim', async () => {
      const assignedShift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/drop`,
        {
          shiftId: assignedShift.id,
          reason: 'Personal emergency',
        },
      ).expect(200);

      expect(response.body).toHaveProperty('success', true);

      // Verify shift is now open
      const updatedShift = await prisma.shift.findUnique({
        where: { id: assignedShift.id },
      });
      expect(updatedShift?.status).toBe('OPEN');
      expect(updatedShift?.workerId).toBeNull();
    });

    it('should reject drop from worker not assigned to shift', async () => {
      const assignedShift = await createAssignedShift(context.users.worker2.workerProfileId!);

      await authPost(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/drop`,
        {
          shiftId: assignedShift.id,
        },
      ).expect(403);
    });
  });

  // ==========================================================================
  // GET PENDING SWAPS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/swaps/pending', () => {
    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          message: 'Need coverage',
        },
      });
    });

    it('should list pending swaps for manager', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${swapsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.every((s: any) => s.status === 'PENDING')).toBe(true);
    });

    it('should include shift and worker details', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${swapsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);

      response.body.forEach((swap: any) => {
        expect(swap).toHaveProperty('shift');
        expect(swap).toHaveProperty('requestor');
      });
    });

    it('should reject pending swaps request from worker', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // GET MY SWAPS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/swaps/mine', () => {
    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
        },
      });
    });

    it('should list worker\'s own swap requests', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/mine`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((swap: any) => {
        expect(swap.requestorId).toBe(context.users.worker1.workerProfileId);
      });
    });

    it('should filter swaps by status', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/mine?status=PENDING`,
      ).expect(200);

      response.body.forEach((swap: any) => {
        expect(swap.status).toBe('PENDING');
      });
    });
  });

  // ==========================================================================
  // GET SWAP DETAILS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/swaps/:id', () => {
    let swapRequest: any;

    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          message: 'Test swap request',
        },
      });
    });

    it('should get swap details', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('id', swapRequest.id);
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('message', 'Test swap request');
    });

    it('should return 404 for non-existent swap', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/non-existent-id`,
      ).expect(404);
    });
  });

  // ==========================================================================
  // RESPOND TO SWAP TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/swaps/:id/respond', () => {
    let swapRequest: any;
    let shift: any;

    beforeEach(async () => {
      shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          targetWorkerId: context.users.worker2.workerProfileId,
          status: 'PENDING',
        },
      });
    });

    it('should allow target worker to accept swap', async () => {
      const response = await authPost(
        app,
        context.users.worker2,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/respond`,
        {
          accepted: true,
          message: 'Sure, I can cover!',
        },
      ).expect(200);

      expect(response.body.status).toBe('ACCEPTED');
    });

    it('should allow target worker to decline swap', async () => {
      const response = await authPost(
        app,
        context.users.worker2,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/respond`,
        {
          accepted: false,
          message: 'Sorry, I have plans',
        },
      ).expect(200);

      expect(response.body.status).toBe('DECLINED');
    });

    it('should reject response from non-target worker', async () => {
      // Create another worker
      const anotherWorker = await prisma.user.create({
        data: {
          phone: '+15559998888',
          firstName: 'Another',
          lastName: 'Worker',
          phoneVerified: true,
          locale: 'en-US',
          timezone: 'America/New_York',
        },
      });

      await prisma.restaurantMember.create({
        data: {
          userId: anotherWorker.id,
          restaurantId: context.restaurants.primary.id,
          role: 'WORKER',
          status: 'ACTIVE',
        },
      });

      const anotherProfile = await prisma.workerProfile.create({
        data: {
          userId: anotherWorker.id,
          restaurantId: context.restaurants.primary.id,
          positions: ['SERVER'],
          status: 'ACTIVE',
          hourlyRate: 18.0,
        },
      });

      // Authenticate this new worker
      const testWorker = {
        id: anotherWorker.id,
        phone: anotherWorker.phone,
        firstName: 'Another',
        lastName: 'Worker',
        role: 'WORKER' as const,
        restaurantId: context.restaurants.primary.id,
        workerProfileId: anotherProfile.id,
      };

      await authenticateUser(app, testWorker);

      // Try to respond to swap not targeted at them
      await authPost(
        app,
        testWorker,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/respond`,
        { accepted: true },
      ).expect(403);
    });
  });

  // ==========================================================================
  // MANAGER APPROVAL TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/swaps/:id/approve', () => {
    let swapRequest: any;

    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          targetWorkerId: context.users.worker2.workerProfileId,
          status: 'ACCEPTED', // Already accepted by target worker
        },
      });
    });

    it('should allow manager to approve accepted swap', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/approve`,
      ).expect(200);

      expect(response.body.status).toBe('COMPLETED');
    });

    it('should reject approval by worker', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/approve`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // MANAGER REJECTION TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/swaps/:id/reject', () => {
    let swapRequest: any;

    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
        },
      });
    });

    it('should allow manager to reject swap', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/reject`,
        { reason: 'Staffing concerns' },
      ).expect(200);

      expect(response.body.status).toBe('REJECTED');
    });

    it('should reject without reason', async () => {
      await authPost(
        app,
        context.users.manager,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/reject`,
      ).expect(200);
    });
  });

  // ==========================================================================
  // CANCEL SWAP TESTS
  // ==========================================================================

  describe('DELETE /restaurants/:restaurantId/swaps/:id', () => {
    let swapRequest: any;

    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
        },
      });
    });

    it('should allow requestor to cancel their swap request', async () => {
      const response = await authDelete(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}`,
      ).expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });

    it('should not allow other workers to cancel the swap', async () => {
      await authDelete(
        app,
        context.users.worker2,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}`,
      ).expect(403);
    });

    it('should not allow cancelling completed swap', async () => {
      await prisma.swapRequest.update({
        where: { id: swapRequest.id },
        data: { status: 'COMPLETED' },
      });

      await authDelete(
        app,
        context.users.worker1,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}`,
      ).expect(400);
    });
  });

  // ==========================================================================
  // NOTIFICATION TESTS
  // ==========================================================================

  describe('Notification Triggers', () => {
    it('should send notification when swap request targets specific worker', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      // Register FCM token for target worker
      await prisma.device.create({
        data: {
          userId: context.users.worker2.id,
          deviceId: 'worker2-device',
          fcmToken: 'fcm-token-worker2',
        },
      });

      await authPost(
        app,
        context.users.worker1,
        swapsUrl(context.restaurants.primary.id),
        {
          shiftId: shift.id,
          targetWorkerId: context.users.worker2.workerProfileId,
          message: 'Can you cover?',
        },
      ).expect(201);

      // Verify notification was sent (mock was called)
      expect(MockFirebaseAdmin.messaging).toHaveBeenCalled();
    });

    it('should send notification when swap is accepted', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      // Register FCM token for requestor
      await prisma.device.create({
        data: {
          userId: context.users.worker1.id,
          deviceId: 'worker1-device',
          fcmToken: 'fcm-token-worker1',
        },
      });

      const swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          targetWorkerId: context.users.worker2.workerProfileId,
          status: 'PENDING',
        },
      });

      await authPost(
        app,
        context.users.worker2,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/respond`,
        { accepted: true },
      ).expect(200);

      // Verify notification was sent to requestor
      expect(MockFirebaseAdmin.messaging).toHaveBeenCalled();
    });

    it('should notify manager when swap requires approval', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      // Register FCM token for manager
      await prisma.device.create({
        data: {
          userId: context.users.manager.id,
          deviceId: 'manager-device',
          fcmToken: 'fcm-token-manager',
        },
      });

      const swapRequest = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          targetWorkerId: context.users.worker2.workerProfileId,
          status: 'PENDING',
        },
      });

      await authPost(
        app,
        context.users.worker2,
        `${swapsUrl(context.restaurants.primary.id)}/${swapRequest.id}/respond`,
        { accepted: true },
      ).expect(200);

      // Notification should be sent to manager for approval
      expect(MockFirebaseAdmin.messaging).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // EXPIRATION TESTS
  // ==========================================================================

  describe('Swap Expiration', () => {
    it('should not allow response to expired swap', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      // Create expired swap
      const expiredSwap = await prisma.swapRequest.create({
        data: {
          shiftId: shift.id,
          requestorId: context.users.worker1.workerProfileId!,
          targetWorkerId: context.users.worker2.workerProfileId,
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      await authPost(
        app,
        context.users.worker2,
        `${swapsUrl(context.restaurants.primary.id)}/${expiredSwap.id}/respond`,
        { accepted: true },
      ).expect(400);
    });
  });
});
