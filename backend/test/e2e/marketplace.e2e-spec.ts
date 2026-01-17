/**
 * Marketplace E2E Tests
 *
 * Tests for shift trade marketplace endpoints:
 * - POST /marketplace/offers - Create trade offer
 * - GET /marketplace/offers - Search offers
 * - POST /marketplace/trades - Propose trade
 * - POST /marketplace/trades/:id/accept - Accept trade
 * - GET /marketplace/recommendations - AI recommendations
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

describe('Marketplace E2E Tests', () => {
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
      authenticateUser(app, context.users.worker1),
      authenticateUser(app, context.users.worker2),
    ]);
  });

  const marketplaceUrl = '/api/marketplace';

  // Helper to create an assigned shift
  async function createAssignedShift(workerId: string, daysFromNow: number = 3) {
    return prisma.shift.create({
      data: {
        restaurantId: context.restaurants.primary.id,
        createdById: context.users.manager.id,
        workerId,
        position: 'SERVER',
        startTime: futureDate(daysFromNow, 9),
        endTime: futureDate(daysFromNow, 17),
        status: 'CONFIRMED',
      },
    });
  }

  // ==========================================================================
  // CREATE OFFER TESTS
  // ==========================================================================

  describe('POST /api/marketplace/offers', () => {
    it('should create a trade offer for assigned shift', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
        {
          shiftId: shift.id,
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
            timeSlots: ['MORNING', 'AFTERNOON'],
            positions: ['SERVER', 'HOST'],
            flexibleDates: true,
          },
          expiresInHours: 48,
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('shiftId', shift.id);
      expect(response.body).toHaveProperty('status', 'ACTIVE');
      expect(response.body).toHaveProperty('preferences');
    });

    it('should create offer with date range preferences', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
        {
          shiftId: shift.id,
          preferences: {
            preferredDateFrom: futureDate(1).toISOString(),
            preferredDateTo: futureDate(14).toISOString(),
            positions: ['SERVER'],
          },
        },
      ).expect(201);

      expect(response.body.preferences).toHaveProperty('preferredDateFrom');
      expect(response.body.preferences).toHaveProperty('preferredDateTo');
    });

    it('should create offer allowing cross-restaurant trades', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const response = await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
        {
          shiftId: shift.id,
          preferences: {
            allowCrossRestaurant: true,
            maxDistanceMiles: 10,
            positions: ['SERVER'],
          },
        },
      ).expect(201);

      expect(response.body.preferences).toHaveProperty('allowCrossRestaurant', true);
    });

    it('should reject offer for shift not assigned to worker', async () => {
      const otherShift = await createAssignedShift(context.users.worker2.workerProfileId!);

      await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
        {
          shiftId: otherShift.id,
          preferences: { positions: ['SERVER'] },
        },
      ).expect(403);
    });

    it('should reject duplicate offer for same shift', async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      // First offer
      await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
        {
          shiftId: shift.id,
          preferences: { positions: ['SERVER'] },
        },
      ).expect(201);

      // Duplicate offer
      await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
        {
          shiftId: shift.id,
          preferences: { positions: ['SERVER'] },
        },
      ).expect(409);
    });
  });

  // ==========================================================================
  // SEARCH OFFERS TESTS
  // ==========================================================================

  describe('GET /api/marketplace/offers', () => {
    beforeEach(async () => {
      // Create multiple offers
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: {
            daysOfWeek: [1, 2, 3],
            positions: ['SERVER'],
          },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });

      await prisma.tradeOffer.create({
        data: {
          shiftId: shift2.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'ACTIVE',
          preferences: {
            daysOfWeek: [4, 5],
            positions: ['HOST'],
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    });

    it('should search trade offers', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers`,
      ).expect(200);

      expect(response.body).toHaveProperty('offers');
      expect(Array.isArray(response.body.offers)).toBe(true);
      expect(response.body).toHaveProperty('total');
    });

    it('should filter offers by position', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers?positions=SERVER`,
      ).expect(200);

      // All returned offers should match the position
      expect(response.body.offers.length).toBeGreaterThan(0);
    });

    it('should filter offers by day of week', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers?daysOfWeek=1,2,3`,
      ).expect(200);

      expect(response.body).toHaveProperty('offers');
    });

    it('should filter offers by date range', async () => {
      const dateFrom = futureDate(2).toISOString();
      const dateTo = futureDate(5).toISOString();

      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      ).expect(200);

      expect(response.body).toHaveProperty('offers');
    });

    it('should paginate results', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers?limit=1&offset=0`,
      ).expect(200);

      expect(response.body.offers.length).toBeLessThanOrEqual(1);
      expect(response.body).toHaveProperty('total');
    });
  });

  // ==========================================================================
  // GET MY OFFERS TESTS
  // ==========================================================================

  describe('GET /api/marketplace/offers/my', () => {
    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      await prisma.tradeOffer.create({
        data: {
          shiftId: shift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
    });

    it('should list worker\'s own offers', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers/my`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((offer: any) => {
        expect(offer.workerProfileId).toBe(context.users.worker1.workerProfileId);
      });
    });

    it('should return empty array for worker with no offers', async () => {
      const response = await authGet(
        app,
        context.users.worker2,
        `${marketplaceUrl}/offers/my`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ==========================================================================
  // GET OFFER MATCHES TESTS
  // ==========================================================================

  describe('GET /api/marketplace/offers/:id/matches', () => {
    let offerId: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const offer = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5],
            positions: ['SERVER'],
          },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offerId = offer.id;

      // Create a potential match
      await prisma.tradeOffer.create({
        data: {
          shiftId: shift2.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'ACTIVE',
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5],
            positions: ['SERVER'],
          },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
    });

    it('should find potential matches for offer', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers/${offerId}/matches`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should limit number of matches', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers/${offerId}/matches?limit=5`,
      ).expect(200);

      expect(response.body.length).toBeLessThanOrEqual(5);
    });
  });

  // ==========================================================================
  // PROPOSE TRADE TESTS
  // ==========================================================================

  describe('POST /api/marketplace/trades', () => {
    let offerId: string;
    let acceptorShiftId: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);
      acceptorShiftId = shift2.id;

      const offer = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offerId = offer.id;
    });

    it('should propose a trade', async () => {
      const response = await authPost(
        app,
        context.users.worker2,
        `${marketplaceUrl}/trades`,
        {
          offerId,
          acceptorShiftId,
          message: 'I would like to trade shifts with you',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('offerId', offerId);
      expect(response.body).toHaveProperty('status', 'PENDING');
    });

    it('should reject trade proposal from offer owner', async () => {
      const workerShift = await createAssignedShift(context.users.worker1.workerProfileId!, 5);

      // Worker 1 trying to accept their own offer
      await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/trades`,
        {
          offerId,
          acceptorShiftId: workerShift.id,
        },
      ).expect(400);
    });

    it('should reject trade with non-owned shift', async () => {
      const otherShift = await createAssignedShift(context.users.worker1.workerProfileId!, 6);

      // Worker 2 trying to trade with worker 1's shift
      await authPost(
        app,
        context.users.worker2,
        `${marketplaceUrl}/trades`,
        {
          offerId,
          acceptorShiftId: otherShift.id, // Not worker 2's shift
        },
      ).expect(403);
    });
  });

  // ==========================================================================
  // ACCEPT/REJECT TRADE TESTS
  // ==========================================================================

  describe('POST /api/marketplace/trades/:id/accept', () => {
    let tradeId: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const offer = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });

      const trade = await prisma.tradeMatch.create({
        data: {
          offerId: offer.id,
          acceptorProfileId: context.users.worker2.workerProfileId!,
          acceptorShiftId: shift2.id,
          status: 'PENDING',
        },
      });
      tradeId = trade.id;
    });

    it('should accept trade as offer owner', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/trades/${tradeId}/accept`,
      ).expect(200);

      expect(response.body.status).toBe('ACCEPTED');
    });

    it('should reject acceptance from non-owner', async () => {
      await authPost(
        app,
        context.users.worker2,
        `${marketplaceUrl}/trades/${tradeId}/accept`,
      ).expect(403);
    });
  });

  describe('POST /api/marketplace/trades/:id/reject', () => {
    let tradeId: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const offer = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });

      const trade = await prisma.tradeMatch.create({
        data: {
          offerId: offer.id,
          acceptorProfileId: context.users.worker2.workerProfileId!,
          acceptorShiftId: shift2.id,
          status: 'PENDING',
        },
      });
      tradeId = trade.id;
    });

    it('should reject trade with reason', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/trades/${tradeId}/reject`,
        {
          reason: 'Shift times don\'t work for me',
        },
      ).expect(200);

      expect(response.body.status).toBe('REJECTED');
    });
  });

  // ==========================================================================
  // MANAGER APPROVAL TESTS
  // ==========================================================================

  describe('POST /api/marketplace/trades/:id/manager-approve', () => {
    let tradeId: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const offer = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });

      const trade = await prisma.tradeMatch.create({
        data: {
          offerId: offer.id,
          acceptorProfileId: context.users.worker2.workerProfileId!,
          acceptorShiftId: shift2.id,
          status: 'ACCEPTED', // Already accepted by workers
        },
      });
      tradeId = trade.id;
    });

    it('should manager approve accepted trade', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${marketplaceUrl}/trades/${tradeId}/manager-approve`,
      ).expect(200);

      expect(response.body.status).toBe('COMPLETED');
    });

    it('should reject manager approval from worker', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/trades/${tradeId}/manager-approve`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // RECOMMENDATIONS TESTS
  // ==========================================================================

  describe('GET /api/marketplace/recommendations', () => {
    beforeEach(async () => {
      // Create several trade offers
      for (let i = 0; i < 5; i++) {
        const shift = await createAssignedShift(
          context.users.worker2.workerProfileId!,
          i + 2,
        );

        await prisma.tradeOffer.create({
          data: {
            shiftId: shift.id,
            workerProfileId: context.users.worker2.workerProfileId!,
            status: 'ACTIVE',
            preferences: {
              daysOfWeek: [1, 2, 3, 4, 5],
              positions: ['SERVER'],
            },
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        });
      }
    });

    it('should return personalized trade recommendations', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/recommendations`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should limit recommendations', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/recommendations?limit=3`,
      ).expect(200);

      expect(response.body.length).toBeLessThanOrEqual(3);
    });
  });

  // ==========================================================================
  // CANCEL OFFER TESTS
  // ==========================================================================

  describe('DELETE /api/marketplace/offers/:id', () => {
    let offerId: string;

    beforeEach(async () => {
      const shift = await createAssignedShift(context.users.worker1.workerProfileId!);

      const offer = await prisma.tradeOffer.create({
        data: {
          shiftId: shift.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offerId = offer.id;
    });

    it('should cancel own offer', async () => {
      const response = await authDelete(
        app,
        context.users.worker1,
        `${marketplaceUrl}/offers/${offerId}`,
      ).expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });

    it('should reject cancellation of other worker\'s offer', async () => {
      await authDelete(
        app,
        context.users.worker2,
        `${marketplaceUrl}/offers/${offerId}`,
      ).expect(403);
    });
  });

  // ==========================================================================
  // NEGOTIATION TESTS
  // ==========================================================================

  describe('POST /api/marketplace/negotiations', () => {
    let offer1Id: string;
    let offer2Id: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const offer1 = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offer1Id = offer1.id;

      const offer2 = await prisma.tradeOffer.create({
        data: {
          shiftId: shift2.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'ACTIVE',
          preferences: { positions: ['SERVER'] },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offer2Id = offer2.id;
    });

    it('should start a negotiation between two offers', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${marketplaceUrl}/negotiations`,
        {
          offer1Id,
          offer2Id,
          initialMessage: 'Would you be interested in trading?',
          expiresInHours: 24,
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'ACTIVE');
    });
  });

  describe('GET /api/marketplace/negotiations', () => {
    it('should list my negotiations', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/negotiations`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by pending response', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/negotiations?pendingMyResponse=true`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ==========================================================================
  // MATCH SCORING TESTS
  // ==========================================================================

  describe('GET /api/marketplace/score/:offer1Id/:offer2Id', () => {
    let offer1Id: string;
    let offer2Id: string;

    beforeEach(async () => {
      const shift1 = await createAssignedShift(context.users.worker1.workerProfileId!, 3);
      const shift2 = await createAssignedShift(context.users.worker2.workerProfileId!, 4);

      const offer1 = await prisma.tradeOffer.create({
        data: {
          shiftId: shift1.id,
          workerProfileId: context.users.worker1.workerProfileId!,
          status: 'ACTIVE',
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5],
            positions: ['SERVER'],
          },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offer1Id = offer1.id;

      const offer2 = await prisma.tradeOffer.create({
        data: {
          shiftId: shift2.id,
          workerProfileId: context.users.worker2.workerProfileId!,
          status: 'ACTIVE',
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5],
            positions: ['SERVER'],
          },
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      offer2Id = offer2.id;
    });

    it('should return compatibility score between two offers', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${marketplaceUrl}/score/${offer1Id}/${offer2Id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('score');
      expect(typeof response.body.score).toBe('number');
      expect(response.body.score).toBeGreaterThanOrEqual(0);
      expect(response.body.score).toBeLessThanOrEqual(100);
    });
  });
});
