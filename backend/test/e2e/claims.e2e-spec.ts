/**
 * Claims E2E Tests
 *
 * Tests for shift claiming endpoints:
 * - POST /claims - Worker claims shift
 * - GET /claims - List pending claims (manager)
 * - POST /claims/:id/approve - Approve claim
 * - POST /claims/:id/reject - Reject claim
 * - Test priority scoring in response
 * - Test auto-approval triggers
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
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Claims E2E Tests', () => {
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
  });

  const claimsUrl = (restaurantId: string) => `/api/restaurants/${restaurantId}/claims`;

  // ==========================================================================
  // CREATE CLAIM TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/claims', () => {
    it('should allow worker to claim an open shift', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      const response = await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        {
          shiftId: openShift.id,
          notes: 'I can cover this shift',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('shiftId', openShift.id);
      expect(response.body).toHaveProperty('workerProfileId', context.users.worker1.workerProfileId);
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('notes', 'I can cover this shift');
    });

    it('should include priority score in claim response', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      const response = await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        {
          shiftId: openShift.id,
        },
      ).expect(201);

      // Priority score should be calculated based on worker's reputation
      expect(response.body).toHaveProperty('priorityScore');
      expect(typeof response.body.priorityScore).toBe('number');
    });

    it('should reject claim for already claimed shift by same worker', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      // First claim
      await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: openShift.id },
      ).expect(201);

      // Second claim by same worker
      await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: openShift.id },
      ).expect(409); // Conflict
    });

    it('should allow multiple workers to claim same shift', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      // Worker 1 claims
      await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: openShift.id },
      ).expect(201);

      // Worker 2 claims same shift
      await authPost(
        app,
        context.users.worker2,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: openShift.id },
      ).expect(201);
    });

    it('should reject claim for non-open shift', async () => {
      const draftShift = context.shifts.find(s => s.status === 'DRAFT');
      if (!draftShift) throw new Error('No draft shift found');

      await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: draftShift.id },
      ).expect(400);
    });

    it('should reject claim for non-existent shift', async () => {
      await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: 'non-existent-shift-id' },
      ).expect(404);
    });

    it('should require shiftId in request body', async () => {
      await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        {},
      ).expect(400);
    });
  });

  // ==========================================================================
  // AUTO-APPROVAL TESTS
  // ==========================================================================

  describe('Auto-approval', () => {
    it('should auto-approve claim when shift has autoApprove enabled and worker meets criteria', async () => {
      // Create shift with auto-approve
      const autoApproveShift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          position: 'SERVER',
          startTime: futureDate(5, 9),
          endTime: futureDate(5, 17),
          status: 'OPEN',
          publishedAt: new Date(),
          autoApprove: true,
          minReputationScore: 50, // Worker has 100
        },
      });

      const response = await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: autoApproveShift.id },
      ).expect(201);

      // Should be auto-approved
      expect(response.body.status).toBe('APPROVED');
    });

    it('should not auto-approve if worker reputation is below minimum', async () => {
      // Lower worker's reputation
      await prisma.workerProfile.update({
        where: { id: context.users.worker1.workerProfileId },
        data: { reputationScore: 40 },
      });

      // Create shift with high minimum reputation
      const highRepShift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          position: 'SERVER',
          startTime: futureDate(6, 9),
          endTime: futureDate(6, 17),
          status: 'OPEN',
          publishedAt: new Date(),
          autoApprove: true,
          minReputationScore: 80,
        },
      });

      const response = await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: highRepShift.id },
      ).expect(201);

      // Should remain pending
      expect(response.body.status).toBe('PENDING');
    });
  });

  // ==========================================================================
  // GET PENDING CLAIMS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/claims/pending', () => {
    beforeEach(async () => {
      // Create some claims
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 85,
        },
      });

      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'PENDING',
          priorityScore: 75,
        },
      });
    });

    it('should list pending claims for manager', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body.every((c: any) => c.status === 'PENDING')).toBe(true);
    });

    it('should include worker details and priority scores', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);

      response.body.forEach((claim: any) => {
        expect(claim).toHaveProperty('workerProfile');
        expect(claim).toHaveProperty('priorityScore');
        expect(claim).toHaveProperty('shift');
      });
    });

    it('should sort claims by priority score descending', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);

      for (let i = 1; i < response.body.length; i++) {
        expect(response.body[i - 1].priorityScore).toBeGreaterThanOrEqual(
          response.body[i].priorityScore,
        );
      }
    });

    it('should reject pending claims request from worker', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(403);
    });

    it('should allow supervisor to view pending claims', async () => {
      await authGet(
        app,
        context.users.supervisor,
        `${claimsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);
    });
  });

  // ==========================================================================
  // GET MY CLAIMS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/claims/mine', () => {
    beforeEach(async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 85,
        },
      });
    });

    it('should list worker\'s own claims', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/mine`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((claim: any) => {
        expect(claim.workerProfileId).toBe(context.users.worker1.workerProfileId);
      });
    });

    it('should filter claims by status', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/mine?status=PENDING`,
      ).expect(200);

      response.body.forEach((claim: any) => {
        expect(claim.status).toBe('PENDING');
      });
    });

    it('should return empty array if worker has no claims', async () => {
      const response = await authGet(
        app,
        context.users.worker2,
        `${claimsUrl(context.restaurants.primary.id)}/mine`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ==========================================================================
  // GET CLAIMS FOR SHIFT TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/claims/shift/:shiftId', () => {
    let openShift: any;

    beforeEach(async () => {
      openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 85,
        },
      });

      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'PENDING',
          priorityScore: 75,
        },
      });
    });

    it('should list all claims for a specific shift', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/shift/${openShift.id}`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      response.body.forEach((claim: any) => {
        expect(claim.shiftId).toBe(openShift.id);
      });
    });

    it('should reject request from worker', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/shift/${openShift.id}`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // APPROVE CLAIM TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/claims/:id/approve', () => {
    let claim: any;
    let openShift: any;

    beforeEach(async () => {
      openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      claim = await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 85,
        },
      });
    });

    it('should approve claim as manager', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/approve`,
      ).expect(200);

      expect(response.body.status).toBe('APPROVED');

      // Verify shift is now assigned
      const updatedShift = await prisma.shift.findUnique({
        where: { id: openShift.id },
      });
      expect(updatedShift?.workerId).toBe(context.users.worker1.workerProfileId);
    });

    it('should reject other pending claims when one is approved', async () => {
      // Create another claim
      const otherClaim = await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'PENDING',
          priorityScore: 75,
        },
      });

      // Approve first claim
      await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/approve`,
      ).expect(200);

      // Other claim should be rejected
      const rejectedClaim = await prisma.shiftClaim.findUnique({
        where: { id: otherClaim.id },
      });
      expect(rejectedClaim?.status).toBe('REJECTED');
    });

    it('should reject approval by worker', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/approve`,
      ).expect(403);
    });

    it('should not approve already approved claim', async () => {
      // Approve once
      await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/approve`,
      ).expect(200);

      // Try to approve again
      await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/approve`,
      ).expect(400);
    });
  });

  // ==========================================================================
  // REJECT CLAIM TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/claims/:id/reject', () => {
    let claim: any;

    beforeEach(async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      claim = await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 85,
        },
      });
    });

    it('should reject claim as manager', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/reject`,
        { reason: 'Scheduling conflict' },
      ).expect(200);

      expect(response.body.status).toBe('REJECTED');
      expect(response.body).toHaveProperty('rejectionReason', 'Scheduling conflict');
    });

    it('should reject claim without reason', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/reject`,
      ).expect(200);

      expect(response.body.status).toBe('REJECTED');
    });

    it('should reject rejection by worker', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/reject`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // WITHDRAW CLAIM TESTS
  // ==========================================================================

  describe('DELETE /restaurants/:restaurantId/claims/:id', () => {
    let claim: any;

    beforeEach(async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      claim = await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 85,
        },
      });
    });

    it('should allow worker to withdraw their own claim', async () => {
      const response = await authDelete(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}`,
      ).expect(200);

      expect(response.body.status).toBe('WITHDRAWN');
    });

    it('should not allow worker to withdraw another worker\'s claim', async () => {
      await authDelete(
        app,
        context.users.worker2,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}`,
      ).expect(403);
    });

    it('should not allow withdrawing an approved claim', async () => {
      // First approve the claim
      await authPost(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}/approve`,
      );

      // Try to withdraw
      await authDelete(
        app,
        context.users.worker1,
        `${claimsUrl(context.restaurants.primary.id)}/${claim.id}`,
      ).expect(400);
    });
  });

  // ==========================================================================
  // PRIORITY SCORING TESTS
  // ==========================================================================

  describe('Priority Scoring', () => {
    it('should calculate higher priority for workers with higher reputation', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      // Set different reputation scores
      await prisma.workerProfile.update({
        where: { id: context.users.worker1.workerProfileId },
        data: { reputationScore: 95 },
      });

      await prisma.workerProfile.update({
        where: { id: context.users.worker2.workerProfileId },
        data: { reputationScore: 60 },
      });

      // Both workers claim
      const claim1 = await authPost(
        app,
        context.users.worker1,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: openShift.id },
      );

      // Create a new open shift for worker2
      const newOpenShift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          position: 'SERVER',
          startTime: futureDate(8, 9),
          endTime: futureDate(8, 17),
          status: 'OPEN',
          publishedAt: new Date(),
        },
      });

      const claim2 = await authPost(
        app,
        context.users.worker2,
        claimsUrl(context.restaurants.primary.id),
        { shiftId: newOpenShift.id },
      );

      // Higher reputation should have higher priority
      expect(claim1.body.priorityScore).toBeGreaterThan(claim2.body.priorityScore);
    });

    it('should return claims sorted by priority score in pending list', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      // Set different reputation scores
      await prisma.workerProfile.update({
        where: { id: context.users.worker1.workerProfileId },
        data: { reputationScore: 70 },
      });

      await prisma.workerProfile.update({
        where: { id: context.users.worker2.workerProfileId },
        data: { reputationScore: 90 },
      });

      // Create claims with different priorities
      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'PENDING',
          priorityScore: 70,
        },
      });

      await prisma.shiftClaim.create({
        data: {
          shiftId: openShift.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'PENDING',
          priorityScore: 90,
        },
      });

      const response = await authGet(
        app,
        context.users.manager,
        `${claimsUrl(context.restaurants.primary.id)}/pending`,
      ).expect(200);

      // Should be sorted with highest priority first
      expect(response.body[0].priorityScore).toBeGreaterThanOrEqual(
        response.body[1].priorityScore,
      );
    });
  });
});
