/**
 * Shifts E2E Tests
 *
 * Tests for shift management endpoints:
 * - POST /shifts - Create shift (manager only)
 * - GET /shifts - List shifts with filters
 * - PUT /shifts/:id - Update shift
 * - POST /shifts/publish - Publish shifts
 * - POST /shifts/:id/assign - Assign worker
 * - DELETE /shifts/:id - Cancel shift
 * - RLS: workers can only see their restaurant's shifts
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
  authPut,
  authDelete,
  TestContext,
  futureDate,
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Shifts E2E Tests', () => {
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

    // Authenticate all users
    await Promise.all([
      authenticateUser(app, context.users.owner),
      authenticateUser(app, context.users.manager),
      authenticateUser(app, context.users.supervisor),
      authenticateUser(app, context.users.worker1),
      authenticateUser(app, context.users.worker2),
    ]);
  });

  const baseUrl = (restaurantId: string) => `/api/restaurants/${restaurantId}/shifts`;

  // ==========================================================================
  // CREATE SHIFT TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/shifts', () => {
    it('should create a shift as manager', async () => {
      const shiftData = {
        position: 'SERVER',
        startTime: futureDate(1, 9).toISOString(),
        endTime: futureDate(1, 17).toISOString(),
        breakMinutes: 30,
        notes: 'Morning shift',
      };

      const response = await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('position', 'SERVER');
      expect(response.body).toHaveProperty('status', 'DRAFT');
      expect(response.body).toHaveProperty('breakMinutes', 30);
      expect(response.body).toHaveProperty('notes', 'Morning shift');
    });

    it('should create a shift as owner', async () => {
      const shiftData = {
        position: 'HOST',
        startTime: futureDate(2, 11).toISOString(),
        endTime: futureDate(2, 19).toISOString(),
      };

      const response = await authPost(
        app,
        context.users.owner,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('position', 'HOST');
    });

    it('should reject shift creation by worker', async () => {
      const shiftData = {
        position: 'SERVER',
        startTime: futureDate(1, 9).toISOString(),
        endTime: futureDate(1, 17).toISOString(),
      };

      await authPost(
        app,
        context.users.worker1,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(403);
    });

    it('should reject shift creation by supervisor', async () => {
      const shiftData = {
        position: 'SERVER',
        startTime: futureDate(1, 9).toISOString(),
        endTime: futureDate(1, 17).toISOString(),
      };

      await authPost(
        app,
        context.users.supervisor,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(403);
    });

    it('should create shift with auto-approve settings', async () => {
      const shiftData = {
        position: 'SERVER',
        startTime: futureDate(1, 9).toISOString(),
        endTime: futureDate(1, 17).toISOString(),
        autoApprove: true,
        minReputationScore: 80,
      };

      const response = await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(201);

      expect(response.body).toHaveProperty('autoApprove', true);
      expect(response.body).toHaveProperty('minReputationScore', 80);
    });

    it('should create shift with hourly rate override', async () => {
      const shiftData = {
        position: 'BARTENDER',
        startTime: futureDate(1, 18).toISOString(),
        endTime: futureDate(1, 23).toISOString(),
        hourlyRateOverride: 25.0,
      };

      const response = await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(201);

      expect(response.body).toHaveProperty('hourlyRateOverride', 25.0);
    });

    it('should reject shift where end time is before start time', async () => {
      const shiftData = {
        position: 'SERVER',
        startTime: futureDate(1, 17).toISOString(),
        endTime: futureDate(1, 9).toISOString(), // End before start
      };

      await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(400);
    });

    it('should require position field', async () => {
      const shiftData = {
        startTime: futureDate(1, 9).toISOString(),
        endTime: futureDate(1, 17).toISOString(),
      };

      await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        shiftData,
      ).expect(400);
    });
  });

  // ==========================================================================
  // BULK CREATE SHIFTS TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/shifts/bulk', () => {
    it('should create multiple shifts at once', async () => {
      const shiftsData = {
        shifts: [
          {
            position: 'SERVER',
            startTime: futureDate(1, 9).toISOString(),
            endTime: futureDate(1, 17).toISOString(),
          },
          {
            position: 'HOST',
            startTime: futureDate(1, 11).toISOString(),
            endTime: futureDate(1, 19).toISOString(),
          },
          {
            position: 'BARTENDER',
            startTime: futureDate(1, 16).toISOString(),
            endTime: futureDate(1, 23).toISOString(),
          },
        ],
      };

      const response = await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/bulk`,
        shiftsData,
      ).expect(201);

      expect(response.body).toHaveProperty('created');
      expect(response.body.created).toHaveLength(3);
    });

    it('should reject bulk create from worker', async () => {
      const shiftsData = {
        shifts: [
          {
            position: 'SERVER',
            startTime: futureDate(1, 9).toISOString(),
            endTime: futureDate(1, 17).toISOString(),
          },
        ],
      };

      await authPost(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/bulk`,
        shiftsData,
      ).expect(403);
    });
  });

  // ==========================================================================
  // LIST SHIFTS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/shifts', () => {
    it('should list shifts for the restaurant', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
      ).expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter shifts by status', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}?status=OPEN`,
      ).expect(200);

      expect(response.body.data.every((s: any) => s.status === 'OPEN')).toBe(true);
    });

    it('should filter shifts by position', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}?position=SERVER`,
      ).expect(200);

      expect(response.body.data.every((s: any) => s.position === 'SERVER')).toBe(true);
    });

    it('should filter shifts by date range', async () => {
      const startDate = futureDate(0).toISOString();
      const endDate = futureDate(3).toISOString();

      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}?startDate=${startDate}&endDate=${endDate}`,
      ).expect(200);

      response.body.data.forEach((shift: any) => {
        const shiftStart = new Date(shift.startTime);
        expect(shiftStart >= new Date(startDate)).toBe(true);
        expect(shiftStart <= new Date(endDate)).toBe(true);
      });
    });

    it('should paginate results', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}?page=1&pageSize=2`,
      ).expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body).toHaveProperty('total');
    });

    it('should allow workers to view shifts', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        baseUrl(context.restaurants.primary.id),
      ).expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // GET SINGLE SHIFT TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/shifts/:id', () => {
    it('should get shift by ID', async () => {
      const shiftId = context.shifts[0].id;

      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shiftId}`,
      ).expect(200);

      expect(response.body).toHaveProperty('id', shiftId);
      expect(response.body).toHaveProperty('position');
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('endTime');
    });

    it('should return 404 for non-existent shift', async () => {
      await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/non-existent-id`,
      ).expect(404);
    });
  });

  // ==========================================================================
  // UPDATE SHIFT TESTS
  // ==========================================================================

  describe('PUT /restaurants/:restaurantId/shifts/:id', () => {
    it('should update shift as manager', async () => {
      const shiftId = context.shifts[0].id;
      const updateData = {
        position: 'BARTENDER',
        notes: 'Updated shift notes',
      };

      const response = await authPut(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shiftId}`,
        updateData,
      ).expect(200);

      expect(response.body).toHaveProperty('position', 'BARTENDER');
      expect(response.body).toHaveProperty('notes', 'Updated shift notes');
    });

    it('should update shift times', async () => {
      const shiftId = context.shifts[0].id;
      const newStartTime = futureDate(3, 10).toISOString();
      const newEndTime = futureDate(3, 18).toISOString();

      const response = await authPut(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shiftId}`,
        {
          startTime: newStartTime,
          endTime: newEndTime,
        },
      ).expect(200);

      expect(new Date(response.body.startTime).toISOString()).toBe(newStartTime);
      expect(new Date(response.body.endTime).toISOString()).toBe(newEndTime);
    });

    it('should reject update from worker', async () => {
      const shiftId = context.shifts[0].id;

      await authPut(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/${shiftId}`,
        { notes: 'Worker update attempt' },
      ).expect(403);
    });

    it('should update break minutes', async () => {
      const shiftId = context.shifts[0].id;

      const response = await authPut(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shiftId}`,
        { breakMinutes: 45 },
      ).expect(200);

      expect(response.body).toHaveProperty('breakMinutes', 45);
    });
  });

  // ==========================================================================
  // PUBLISH SHIFTS TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/shifts/publish', () => {
    it('should publish multiple draft shifts', async () => {
      // First create some draft shifts
      const shift1 = await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        {
          position: 'SERVER',
          startTime: futureDate(4, 9).toISOString(),
          endTime: futureDate(4, 17).toISOString(),
        },
      );

      const shift2 = await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.primary.id),
        {
          position: 'HOST',
          startTime: futureDate(4, 11).toISOString(),
          endTime: futureDate(4, 19).toISOString(),
        },
      );

      // Publish them
      const response = await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/publish`,
        {
          shiftIds: [shift1.body.id, shift2.body.id],
        },
      ).expect(200);

      expect(response.body).toHaveProperty('published');
      expect(response.body.published).toHaveLength(2);

      // Verify status changed
      const publishedShift = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shift1.body.id}`,
      );

      expect(publishedShift.body.status).toBe('OPEN');
    });

    it('should reject publish from worker', async () => {
      const draftShift = context.shifts.find(s => s.status === 'DRAFT');
      if (!draftShift) {
        // Create a draft shift first
        const created = await authPost(
          app,
          context.users.manager,
          baseUrl(context.restaurants.primary.id),
          {
            position: 'SERVER',
            startTime: futureDate(5, 9).toISOString(),
            endTime: futureDate(5, 17).toISOString(),
          },
        );

        await authPost(
          app,
          context.users.worker1,
          `${baseUrl(context.restaurants.primary.id)}/publish`,
          {
            shiftIds: [created.body.id],
          },
        ).expect(403);
      } else {
        await authPost(
          app,
          context.users.worker1,
          `${baseUrl(context.restaurants.primary.id)}/publish`,
          {
            shiftIds: [draftShift.id],
          },
        ).expect(403);
      }
    });
  });

  // ==========================================================================
  // ASSIGN WORKER TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/shifts/:id/assign', () => {
    it('should assign worker to shift as manager', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      const response = await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/assign`,
        {
          workerId: context.users.worker1.workerProfileId,
          notify: true,
        },
      ).expect(200);

      expect(response.body).toHaveProperty('workerId', context.users.worker1.workerProfileId);
      expect(response.body.status).toBe('ASSIGNED');
    });

    it('should reject assignment by worker', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await authPost(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/assign`,
        {
          workerId: context.users.worker2.workerProfileId,
        },
      ).expect(403);
    });

    it('should reject assignment to non-existent worker', async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/assign`,
        {
          workerId: 'non-existent-worker-id',
        },
      ).expect(404);
    });
  });

  // ==========================================================================
  // CANCEL SHIFT TESTS
  // ==========================================================================

  describe('DELETE /restaurants/:restaurantId/shifts/:id', () => {
    it('should cancel shift as manager', async () => {
      const shiftToCancel = context.shifts[0];

      const response = await authDelete(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shiftToCancel.id}`,
      ).expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });

    it('should cancel shift with reason', async () => {
      const response = await request(app.getHttpServer())
        .delete(`${baseUrl(context.restaurants.primary.id)}/${context.shifts[1].id}`)
        .set('Authorization', `Bearer ${context.users.manager.accessToken}`)
        .send({ reason: 'Scheduling conflict' })
        .expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });

    it('should reject cancellation by worker', async () => {
      await authDelete(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/${context.shifts[0].id}`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // CLOCK IN/OUT TESTS
  // ==========================================================================

  describe('POST /restaurants/:restaurantId/shifts/:id/clock-in', () => {
    it('should allow assigned worker to clock in', async () => {
      // First assign worker to shift
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/assign`,
        {
          workerId: context.users.worker1.workerProfileId,
        },
      );

      // Confirm the assignment
      await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/confirm`,
      );

      // Clock in
      const response = await authPost(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/clock-in`,
      ).expect(200);

      expect(response.body.status).toBe('IN_PROGRESS');
      expect(response.body).toHaveProperty('clockInTime');
    });
  });

  describe('POST /restaurants/:restaurantId/shifts/:id/clock-out', () => {
    it('should allow clocked-in worker to clock out', async () => {
      // Setup: assign, confirm, and clock in
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) throw new Error('No open shift found');

      await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/assign`,
        { workerId: context.users.worker1.workerProfileId },
      );

      await authPost(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/confirm`,
      );

      await authPost(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/clock-in`,
      );

      // Clock out
      const response = await authPost(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/${openShift.id}/clock-out`,
      ).expect(200);

      expect(response.body.status).toBe('COMPLETED');
      expect(response.body).toHaveProperty('clockOutTime');
    });
  });

  // ==========================================================================
  // RLS (ROW LEVEL SECURITY) TESTS
  // ==========================================================================

  describe('Row Level Security', () => {
    it('should only show shifts from worker\'s restaurant', async () => {
      // Create shift in secondary restaurant
      const secondaryRestaurantUser = await prisma.user.create({
        data: {
          phone: '+15556667777',
          firstName: 'Secondary',
          lastName: 'Manager',
          phoneVerified: true,
          locale: 'en-US',
          timezone: 'America/New_York',
        },
      });

      await prisma.restaurantMember.create({
        data: {
          userId: secondaryRestaurantUser.id,
          restaurantId: context.restaurants.secondary.id,
          role: 'MANAGER',
          status: 'ACTIVE',
        },
      });

      // Create shift in secondary restaurant
      await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.secondary.id,
          createdById: secondaryRestaurantUser.id,
          position: 'COOK',
          startTime: futureDate(1, 9),
          endTime: futureDate(1, 17),
          status: 'OPEN',
        },
      });

      // Worker from primary restaurant should not see secondary restaurant shifts
      const response = await authGet(
        app,
        context.users.worker1,
        baseUrl(context.restaurants.secondary.id),
      );

      // Should either return 403 or empty array depending on implementation
      if (response.status === 200) {
        expect(response.body.data).toHaveLength(0);
      } else {
        expect(response.status).toBe(403);
      }
    });

    it('should allow owner to view their restaurant shifts only', async () => {
      const response = await authGet(
        app,
        context.users.owner,
        baseUrl(context.restaurants.primary.id),
      ).expect(200);

      // All returned shifts should be from the owner's restaurant
      response.body.data.forEach((shift: any) => {
        expect(shift.restaurantId).toBe(context.restaurants.primary.id);
      });
    });

    it('should prevent manager from creating shifts in other restaurants', async () => {
      const shiftData = {
        position: 'SERVER',
        startTime: futureDate(1, 9).toISOString(),
        endTime: futureDate(1, 17).toISOString(),
      };

      await authPost(
        app,
        context.users.manager,
        baseUrl(context.restaurants.secondary.id), // Wrong restaurant
        shiftData,
      ).expect(403);
    });
  });

  // ==========================================================================
  // WEEKLY SCHEDULE VIEW TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/shifts/week', () => {
    it('should get weekly schedule view', async () => {
      const weekStart = futureDate(0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/week?weekStart=${weekStart.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('weekStart');
      expect(response.body).toHaveProperty('shifts');
    });
  });

  // ==========================================================================
  // COVERAGE GAPS TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/shifts/coverage-gaps', () => {
    it('should identify coverage gaps', async () => {
      const startDate = futureDate(0).toISOString();
      const endDate = futureDate(7).toISOString();

      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/coverage-gaps?startDate=${startDate}&endDate=${endDate}`,
      ).expect(200);

      expect(response.body).toHaveProperty('gaps');
    });

    it('should reject coverage gaps request from worker', async () => {
      const startDate = futureDate(0).toISOString();
      const endDate = futureDate(7).toISOString();

      await authGet(
        app,
        context.users.worker1,
        `${baseUrl(context.restaurants.primary.id)}/coverage-gaps?startDate=${startDate}&endDate=${endDate}`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // SHIFT HISTORY TESTS
  // ==========================================================================

  describe('GET /restaurants/:restaurantId/shifts/:id/history', () => {
    it('should return shift status history', async () => {
      const shiftId = context.shifts[0].id;

      const response = await authGet(
        app,
        context.users.manager,
        `${baseUrl(context.restaurants.primary.id)}/${shiftId}/history`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
