/**
 * Full Workflow E2E Tests
 *
 * Complete workflow scenarios testing end-to-end user journeys:
 *
 * Scenario 1: New worker onboarding -> first shift -> completion -> payment
 * Scenario 2: Shift created -> published -> claimed -> swapped -> completed
 * Scenario 3: Ghost kitchen session with multiple orders -> P&L
 * Scenario 4: Cross-restaurant worker claims network shift
 * Scenario 5: Trade marketplace complete trade flow
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
  TestUser,
  futureDate,
  generateWebhookSignature,
} from '../setup';
import { PrismaService } from '../../../src/common/prisma/prisma.service';

describe('Full Workflow E2E Scenarios', () => {
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

  // ==========================================================================
  // SCENARIO 1: New Worker Onboarding -> First Shift -> Completion -> Payment
  // ==========================================================================

  describe('Scenario 1: Worker Onboarding to Payment', () => {
    it('should complete full worker journey from registration to payment', async () => {
      // Step 1: New user registers
      const newPhone = '+15559998877';
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          phone: newPhone,
          firstName: 'New',
          lastName: 'Employee',
          email: 'newemployee@example.com',
        })
        .expect(201);

      expect(registerResponse.body.success).toBe(true);

      // Step 2: Verify phone and login
      await request(app.getHttpServer())
        .post('/api/auth/otp/request')
        .send({ phone: newPhone })
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/otp/verify')
        .send({
          phone: newPhone,
          code: '123456',
          deviceId: 'new-device-123',
        })
        .expect(200);

      const newUserToken = loginResponse.body.accessToken;
      const newUserId = loginResponse.body.user.id;

      // Step 3: Manager adds worker to restaurant
      // (In a real scenario, manager would invite or approve the worker)
      const workerProfile = await prisma.workerProfile.create({
        data: {
          userId: newUserId,
          restaurantId: context.restaurants.primary.id,
          positions: ['SERVER', 'HOST'],
          status: 'ACTIVE',
          hourlyRate: 18.0,
          maxHoursPerWeek: 40,
        },
      });

      await prisma.restaurantMember.create({
        data: {
          userId: newUserId,
          restaurantId: context.restaurants.primary.id,
          role: 'WORKER',
          status: 'ACTIVE',
        },
      });

      // Step 4: Manager creates and publishes a shift
      const shiftResponse = await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts`,
        {
          position: 'SERVER',
          startTime: futureDate(1, 9).toISOString(),
          endTime: futureDate(1, 17).toISOString(),
          breakMinutes: 30,
        },
      ).expect(201);

      const shiftId = shiftResponse.body.id;

      // Publish the shift
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/publish`,
        { shiftIds: [shiftId] },
      ).expect(200);

      // Step 5: Worker claims the shift
      const newWorker: TestUser = {
        id: newUserId,
        phone: newPhone,
        firstName: 'New',
        lastName: 'Employee',
        role: 'WORKER',
        restaurantId: context.restaurants.primary.id,
        workerProfileId: workerProfile.id,
        accessToken: newUserToken,
      };

      const claimResponse = await authPost(
        app,
        newWorker,
        `/api/restaurants/${context.restaurants.primary.id}/claims`,
        { shiftId },
      ).expect(201);

      // Step 6: Manager approves the claim
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/claims/${claimResponse.body.id}/approve`,
      ).expect(200);

      // Step 7: Worker enrolls in instant pay
      await authPost(
        app,
        newWorker,
        '/api/payments/instant-pay/enroll',
        {
          email: 'newemployee@example.com',
          dateOfBirth: '1995-05-15',
          ssnLast4: '5678',
          bankAccount: {
            routingNumber: '021000021',
            accountNumber: '987654321',
            accountType: 'CHECKING',
          },
          address: {
            street: '456 New St',
            city: 'New York',
            state: 'NY',
            zipCode: '10002',
          },
        },
      ).expect(201);

      // Step 8: Verify shift is confirmed
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shiftId}/confirm`,
      ).expect(200);

      // Step 9: Worker clocks in
      await authPost(
        app,
        newWorker,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shiftId}/clock-in`,
      ).expect(200);

      // Step 10: Worker clocks out (simulating shift completion)
      await authPost(
        app,
        newWorker,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shiftId}/clock-out`,
      ).expect(200);

      // Step 11: Check balance is available
      const balanceResponse = await authGet(
        app,
        newWorker,
        '/api/payments/instant-pay/balance',
      ).expect(200);

      expect(balanceResponse.body).toHaveProperty('availableAmount');

      // Step 12: Request instant pay transfer
      await authPost(
        app,
        newWorker,
        '/api/payments/instant-pay/transfer',
        {
          amount: 50.0,
          method: 'INSTANT',
        },
      ).expect(201);

      // Verify the complete journey
      const finalShift = await prisma.shift.findUnique({ where: { id: shiftId } });
      expect(finalShift?.status).toBe('COMPLETED');
      expect(finalShift?.workerId).toBe(workerProfile.id);
    });
  });

  // ==========================================================================
  // SCENARIO 2: Shift Created -> Published -> Claimed -> Swapped -> Completed
  // ==========================================================================

  describe('Scenario 2: Shift Lifecycle with Swap', () => {
    it('should handle complete shift lifecycle including swap', async () => {
      // Step 1: Manager creates multiple shifts
      const shift1Response = await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts`,
        {
          position: 'SERVER',
          startTime: futureDate(3, 9).toISOString(),
          endTime: futureDate(3, 17).toISOString(),
        },
      ).expect(201);

      const shift2Response = await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts`,
        {
          position: 'HOST',
          startTime: futureDate(4, 11).toISOString(),
          endTime: futureDate(4, 19).toISOString(),
        },
      ).expect(201);

      const shift1Id = shift1Response.body.id;
      const shift2Id = shift2Response.body.id;

      // Step 2: Publish shifts
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/publish`,
        { shiftIds: [shift1Id, shift2Id] },
      ).expect(200);

      // Step 3: Worker 1 claims shift 1
      const claim1Response = await authPost(
        app,
        context.users.worker1,
        `/api/restaurants/${context.restaurants.primary.id}/claims`,
        { shiftId: shift1Id },
      ).expect(201);

      // Step 4: Worker 2 claims shift 2
      const claim2Response = await authPost(
        app,
        context.users.worker2,
        `/api/restaurants/${context.restaurants.primary.id}/claims`,
        { shiftId: shift2Id },
      ).expect(201);

      // Step 5: Manager approves both claims
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/claims/${claim1Response.body.id}/approve`,
      ).expect(200);

      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/claims/${claim2Response.body.id}/approve`,
      ).expect(200);

      // Confirm both shifts
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shift1Id}/confirm`,
      ).expect(200);

      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shift2Id}/confirm`,
      ).expect(200);

      // Step 6: Worker 1 requests to swap with Worker 2
      const swapResponse = await authPost(
        app,
        context.users.worker1,
        `/api/restaurants/${context.restaurants.primary.id}/swaps`,
        {
          shiftId: shift1Id,
          targetWorkerId: context.users.worker2.workerProfileId,
          targetShiftId: shift2Id,
          message: 'Would you like to swap shifts?',
        },
      ).expect(201);

      const swapId = swapResponse.body.id;

      // Step 7: Worker 2 accepts the swap
      await authPost(
        app,
        context.users.worker2,
        `/api/restaurants/${context.restaurants.primary.id}/swaps/${swapId}/respond`,
        { accepted: true },
      ).expect(200);

      // Step 8: Manager approves the swap
      await authPost(
        app,
        context.users.manager,
        `/api/restaurants/${context.restaurants.primary.id}/swaps/${swapId}/approve`,
      ).expect(200);

      // Step 9: Verify shifts are swapped
      const updatedShift1 = await prisma.shift.findUnique({ where: { id: shift1Id } });
      const updatedShift2 = await prisma.shift.findUnique({ where: { id: shift2Id } });

      // Workers should be swapped
      expect(updatedShift1?.workerId).toBe(context.users.worker2.workerProfileId);
      expect(updatedShift2?.workerId).toBe(context.users.worker1.workerProfileId);

      // Step 10: Worker 2 (now assigned to shift 1) clocks in and out
      await authPost(
        app,
        context.users.worker2,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shift1Id}/clock-in`,
      ).expect(200);

      await authPost(
        app,
        context.users.worker2,
        `/api/restaurants/${context.restaurants.primary.id}/shifts/${shift1Id}/clock-out`,
      ).expect(200);

      // Verify completion
      const completedShift = await prisma.shift.findUnique({ where: { id: shift1Id } });
      expect(completedShift?.status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // SCENARIO 3: Ghost Kitchen Session with Orders and P&L
  // ==========================================================================

  describe('Scenario 3: Ghost Kitchen Complete Session', () => {
    it('should complete ghost kitchen session with orders and generate P&L', async () => {
      // Step 1: Manager enables ghost mode
      const enableResponse = await authPost(
        app,
        context.users.manager,
        '/api/ghost-kitchen/enable',
        {
          restaurantId: context.restaurants.primary.id,
          maxOrders: 50,
          platforms: ['DOORDASH', 'UBEREATS'],
          autoAccept: true,
        },
      ).expect(201);

      const sessionId = enableResponse.body.sessionId;
      expect(enableResponse.body.status).toBe('ACTIVE');

      // Step 2: Verify status shows active
      const statusResponse = await authGet(
        app,
        context.users.manager,
        `/api/ghost-kitchen/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(statusResponse.body.isActive).toBe(true);

      // Step 3: Simulate incoming orders via webhook
      const orders = [
        {
          eventId: 'evt-order-1',
          order: {
            externalOrderId: 'DD-10001',
            platform: 'DOORDASH',
            restaurantId: context.restaurants.primary.id,
            customer: { name: 'Customer 1', phone: '+14155551001' },
            items: [
              { name: 'Burger', quantity: 2, price: 12.99 },
              { name: 'Fries', quantity: 2, price: 4.99 },
            ],
            subtotal: 35.96,
            tax: 2.88,
            deliveryFee: 3.99,
            tip: 5.0,
            total: 47.83,
            requestedTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
        {
          eventId: 'evt-order-2',
          order: {
            externalOrderId: 'UE-20002',
            platform: 'UBEREATS',
            restaurantId: context.restaurants.primary.id,
            customer: { name: 'Customer 2', phone: '+14155551002' },
            items: [
              { name: 'Pizza', quantity: 1, price: 18.99 },
              { name: 'Salad', quantity: 1, price: 8.99 },
            ],
            subtotal: 27.98,
            tax: 2.24,
            deliveryFee: 2.99,
            tip: 4.0,
            total: 37.21,
            requestedTime: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
          },
        },
        {
          eventId: 'evt-order-3',
          order: {
            externalOrderId: 'DD-10003',
            platform: 'DOORDASH',
            restaurantId: context.restaurants.primary.id,
            customer: { name: 'Customer 3', phone: '+14155551003' },
            items: [
              { name: 'Tacos', quantity: 3, price: 4.99 },
              { name: 'Burrito', quantity: 1, price: 11.99 },
            ],
            subtotal: 26.96,
            tax: 2.16,
            deliveryFee: 3.99,
            tip: 3.0,
            total: 36.11,
            requestedTime: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
          },
        },
      ];

      for (const orderPayload of orders) {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = generateWebhookSignature(
          JSON.stringify(orderPayload),
          'test-webhook-secret',
          timestamp,
        );

        await request(app.getHttpServer())
          .post('/api/webhooks/kitchenhub/order-created')
          .set('x-kitchenhub-signature', signature)
          .set('x-kitchenhub-timestamp', timestamp.toString())
          .send(orderPayload)
          .expect(200);
      }

      // Step 4: Check updated metrics
      const metricsResponse = await authGet(
        app,
        context.users.manager,
        `/api/ghost-kitchen/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(metricsResponse.body.metrics.orderCount).toBeGreaterThan(0);

      // Step 5: Pause and resume (simulating kitchen overwhelmed)
      await authPost(
        app,
        context.users.manager,
        '/api/ghost-kitchen/pause',
        {
          restaurantId: context.restaurants.primary.id,
          reason: 'Caught up on orders',
          duration: 10, // 10 minute pause
        },
      ).expect(200);

      const pausedStatus = await authGet(
        app,
        context.users.manager,
        `/api/ghost-kitchen/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(pausedStatus.body.session.status).toBe('PAUSED');

      // Resume operations
      await authPost(
        app,
        context.users.manager,
        '/api/ghost-kitchen/resume',
        { restaurantId: context.restaurants.primary.id },
      ).expect(200);

      // Step 6: Disable ghost mode (end of session)
      const disableResponse = await authPost(
        app,
        context.users.manager,
        '/api/ghost-kitchen/disable',
        {
          restaurantId: context.restaurants.primary.id,
          reason: 'End of shift',
        },
      ).expect(200);

      expect(disableResponse.body.status).toBe('COMPLETED');
      expect(disableResponse.body.summary).toHaveProperty('totalOrders');
      expect(disableResponse.body.summary).toHaveProperty('totalRevenue');

      // Step 7: Get P&L report for the session
      const pnlResponse = await authGet(
        app,
        context.users.manager,
        `/api/ghost-kitchen/analytics/pnl?sessionId=${sessionId}&restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(pnlResponse.body).toHaveProperty('pnl');
      expect(pnlResponse.body.pnl).toHaveProperty('revenue');
      expect(pnlResponse.body.pnl).toHaveProperty('netProfit');
      expect(pnlResponse.body.pnl).toHaveProperty('profitMargin');

      // Step 8: Get platform breakdown
      const platformResponse = await authGet(
        app,
        context.users.manager,
        `/api/ghost-kitchen/analytics/platform-breakdown?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(platformResponse.body).toHaveProperty('platforms');
    });
  });

  // ==========================================================================
  // SCENARIO 4: Cross-Restaurant Worker Claims Network Shift
  // ==========================================================================

  describe('Scenario 4: Cross-Restaurant Network Shift', () => {
    it('should allow cross-trained worker to claim and complete network shift', async () => {
      // Create owner for secondary restaurant
      const secOwnerUser = await prisma.user.create({
        data: {
          phone: '+15559990001',
          firstName: 'Secondary',
          lastName: 'Owner',
          phoneVerified: true,
          locale: 'en-US',
          timezone: 'America/New_York',
        },
      });

      await prisma.restaurantMember.create({
        data: {
          userId: secOwnerUser.id,
          restaurantId: context.restaurants.secondary.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      const secondaryOwner: TestUser = {
        id: secOwnerUser.id,
        phone: secOwnerUser.phone,
        firstName: 'Secondary',
        lastName: 'Owner',
        role: 'OWNER',
        restaurantId: context.restaurants.secondary.id,
      };

      await authenticateUser(app, secondaryOwner);

      // Step 1: Primary owner creates a network
      const networkResponse = await authPost(
        app,
        context.users.owner,
        `/api/networks?restaurantId=${context.restaurants.primary.id}`,
        {
          name: 'Downtown Alliance',
          description: 'Collaborative network for downtown restaurants',
          settings: {
            allowCrossShifts: true,
            requireCrossTraining: true,
          },
        },
      ).expect(201);

      const networkId = networkResponse.body.id;

      // Step 2: Invite secondary restaurant
      const inviteResponse = await authPost(
        app,
        context.users.owner,
        `/api/networks/${networkId}/invite?restaurantId=${context.restaurants.primary.id}`,
        {
          targetRestaurantId: context.restaurants.secondary.id,
          message: 'Join our network!',
        },
      ).expect(201);

      // Step 3: Secondary owner accepts invitation
      await authPost(
        app,
        secondaryOwner,
        `/api/networks/invitations/${inviteResponse.body.id}/respond?restaurantId=${context.restaurants.secondary.id}`,
        { accepted: true },
      ).expect(200);

      // Step 4: Worker 1 requests cross-training at secondary restaurant
      const crossTrainingResponse = await authPost(
        app,
        context.users.worker1,
        '/api/networks/cross-training',
        {
          workerProfileId: context.users.worker1.workerProfileId,
          targetRestaurantId: context.restaurants.secondary.id,
          positions: ['SERVER'],
          notes: 'Interested in picking up extra shifts',
        },
      ).expect(201);

      // Step 5: Secondary owner approves cross-training
      await authPost(
        app,
        secondaryOwner,
        `/api/networks/cross-training/${crossTrainingResponse.body.id}/approve?restaurantId=${context.restaurants.secondary.id}`,
        {
          approvedPositions: ['SERVER'],
          maxHoursPerWeek: 20,
        },
      ).expect(200);

      // Step 6: Secondary restaurant creates a network shift
      const networkShift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.secondary.id,
          createdById: secOwnerUser.id,
          position: 'SERVER',
          startTime: futureDate(5, 9),
          endTime: futureDate(5, 17),
          status: 'OPEN',
          publishedAt: new Date(),
          isNetworkShift: true,
        },
      });

      // Step 7: Worker 1 views available network shifts
      const availableShiftsResponse = await authGet(
        app,
        context.users.worker1,
        `/api/networks/worker/${context.users.worker1.workerProfileId}/shifts/available`,
      ).expect(200);

      expect(availableShiftsResponse.body.length).toBeGreaterThan(0);

      // Step 8: Worker 1 claims the network shift
      const claimNetworkResponse = await authPost(
        app,
        context.users.worker1,
        `/api/networks/shifts/${networkShift.id}/claim`,
        {
          workerProfileId: context.users.worker1.workerProfileId,
          notes: 'Available to work this shift',
        },
      ).expect(201);

      expect(claimNetworkResponse.body.shiftId).toBe(networkShift.id);

      // Step 9: Secondary manager approves the claim
      const secManagerUser = await prisma.user.create({
        data: {
          phone: '+15559990002',
          firstName: 'Secondary',
          lastName: 'Manager',
          phoneVerified: true,
          locale: 'en-US',
          timezone: 'America/New_York',
        },
      });

      await prisma.restaurantMember.create({
        data: {
          userId: secManagerUser.id,
          restaurantId: context.restaurants.secondary.id,
          role: 'MANAGER',
          status: 'ACTIVE',
        },
      });

      const secManager: TestUser = {
        id: secManagerUser.id,
        phone: secManagerUser.phone,
        firstName: 'Secondary',
        lastName: 'Manager',
        role: 'MANAGER',
        restaurantId: context.restaurants.secondary.id,
      };

      await authenticateUser(app, secManager);

      // Approve the claim
      await authPost(
        app,
        secManager,
        `/api/restaurants/${context.restaurants.secondary.id}/claims/${claimNetworkResponse.body.id}/approve`,
      ).expect(200);

      // Step 10: Verify shift is assigned
      const updatedNetworkShift = await prisma.shift.findUnique({
        where: { id: networkShift.id },
      });

      expect(updatedNetworkShift?.workerId).toBe(context.users.worker1.workerProfileId);

      // Step 11: Check network shift statistics
      const statsResponse = await authGet(
        app,
        secManager,
        `/api/networks/restaurant/${context.restaurants.secondary.id}/shifts/stats`,
      ).expect(200);

      expect(statsResponse.body).toHaveProperty('totalNetworkShifts');
    });
  });

  // ==========================================================================
  // SCENARIO 5: Trade Marketplace Complete Flow
  // ==========================================================================

  describe('Scenario 5: Marketplace Trade Complete Flow', () => {
    it('should complete full trade marketplace workflow', async () => {
      // Step 1: Create assigned shifts for both workers
      const shift1 = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          workerId: context.users.worker1.workerProfileId,
          position: 'SERVER',
          startTime: futureDate(5, 9),
          endTime: futureDate(5, 17),
          status: 'CONFIRMED',
        },
      });

      const shift2 = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          workerId: context.users.worker2.workerProfileId,
          position: 'HOST',
          startTime: futureDate(6, 11),
          endTime: futureDate(6, 19),
          status: 'CONFIRMED',
        },
      });

      // Step 2: Worker 1 creates a trade offer
      const offerResponse = await authPost(
        app,
        context.users.worker1,
        '/api/marketplace/offers',
        {
          shiftId: shift1.id,
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5],
            timeSlots: ['AFTERNOON', 'EVENING'],
            positions: ['SERVER', 'HOST'],
            flexibleDates: true,
            notes: 'Need to swap due to appointment',
          },
          expiresInHours: 72,
        },
      ).expect(201);

      const offerId = offerResponse.body.id;

      // Step 3: Worker 2 searches for trade offers
      const searchResponse = await authGet(
        app,
        context.users.worker2,
        '/api/marketplace/offers?positions=SERVER',
      ).expect(200);

      expect(searchResponse.body.offers.length).toBeGreaterThan(0);

      // Step 4: Worker 2 checks potential matches for their shift
      const matchesResponse = await authGet(
        app,
        context.users.worker2,
        `/api/marketplace/shifts/${shift2.id}/matching-offers`,
      ).expect(200);

      // Step 5: Worker 2 also creates an offer (for mutual matching)
      const offer2Response = await authPost(
        app,
        context.users.worker2,
        '/api/marketplace/offers',
        {
          shiftId: shift2.id,
          preferences: {
            daysOfWeek: [1, 2, 3, 4, 5],
            timeSlots: ['MORNING', 'AFTERNOON'],
            positions: ['SERVER', 'HOST'],
          },
          expiresInHours: 72,
        },
      ).expect(201);

      // Step 6: Check mutual matches
      const mutualMatchesResponse = await authGet(
        app,
        context.users.worker1,
        `/api/marketplace/offers/${offerId}/mutual-matches`,
      ).expect(200);

      // Step 7: Worker 2 proposes a trade to Worker 1's offer
      const tradeResponse = await authPost(
        app,
        context.users.worker2,
        '/api/marketplace/trades',
        {
          offerId,
          acceptorShiftId: shift2.id,
          message: 'I would love to trade shifts with you!',
        },
      ).expect(201);

      const tradeId = tradeResponse.body.id;

      // Step 8: Worker 1 checks incoming trade proposals
      const incomingTrades = await authGet(
        app,
        context.users.worker1,
        `/api/marketplace/offers/${offerId}/matches`,
      ).expect(200);

      // Step 9: Worker 1 accepts the trade
      await authPost(
        app,
        context.users.worker1,
        `/api/marketplace/trades/${tradeId}/accept`,
      ).expect(200);

      // Step 10: Manager reviews and approves the trade
      await authPost(
        app,
        context.users.manager,
        `/api/marketplace/trades/${tradeId}/manager-approve`,
      ).expect(200);

      // Step 11: Verify the trade is completed and shifts are swapped
      const completedTrade = await prisma.tradeMatch.findUnique({
        where: { id: tradeId },
      });
      expect(completedTrade?.status).toBe('COMPLETED');

      const updatedShift1 = await prisma.shift.findUnique({ where: { id: shift1.id } });
      const updatedShift2 = await prisma.shift.findUnique({ where: { id: shift2.id } });

      // Workers should be swapped
      expect(updatedShift1?.workerId).toBe(context.users.worker2.workerProfileId);
      expect(updatedShift2?.workerId).toBe(context.users.worker1.workerProfileId);

      // Step 12: Check recommendations are updated
      const recommendationsResponse = await authGet(
        app,
        context.users.worker1,
        '/api/marketplace/recommendations',
      ).expect(200);

      expect(Array.isArray(recommendationsResponse.body)).toBe(true);

      // Step 13: Verify original offers are now closed/completed
      const originalOffer = await prisma.tradeOffer.findUnique({
        where: { id: offerId },
      });
      expect(['COMPLETED', 'TRADED']).toContain(originalOffer?.status);
    });
  });

  // ==========================================================================
  // SCENARIO 6: Manager Dashboard Analysis Workflow
  // ==========================================================================

  describe('Scenario 6: Manager Dashboard and Analytics', () => {
    it('should complete manager analytics workflow', async () => {
      // Step 1: Manager views executive dashboard
      const dashboardResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/dashboard?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(dashboardResponse.body).toHaveProperty('summary');
      expect(dashboardResponse.body).toHaveProperty('kpis');

      // Step 2: Check for alerts
      const alertsResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/dashboard/alerts?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(Array.isArray(alertsResponse.body)).toBe(true);

      // Step 3: Analyze labor costs
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);

      const laborResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/labor?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(laborResponse.body).toHaveProperty('summary');
      expect(laborResponse.body).toHaveProperty('dailyBreakdown');

      // Step 4: Check for overstaffing
      const overstaffingResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/labor/overstaffing?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(overstaffingResponse.body).toHaveProperty('overstaffedPeriods');

      // Step 5: Get forecast accuracy
      const forecastResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/forecast-accuracy?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(forecastResponse.body).toHaveProperty('overallAccuracy');

      // Step 6: Review worker performance
      const workerReportResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/workers/${context.users.worker1.workerProfileId}/report`,
      ).expect(200);

      expect(workerReportResponse.body).toHaveProperty('workerId');
      expect(workerReportResponse.body).toHaveProperty('punctuality');

      // Step 7: Get optimal schedule suggestion
      const targetDate = futureDate(7);
      const optimalResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/labor/optimal-schedule?restaurantId=${context.restaurants.primary.id}&date=${targetDate.toISOString().split('T')[0]}`,
      ).expect(200);

      expect(optimalResponse.body).toHaveProperty('suggestedShifts');

      // Step 8: Generate payroll report
      const payPeriodStart = new Date();
      payPeriodStart.setDate(payPeriodStart.getDate() - 14);
      const payPeriodEnd = new Date();

      const payrollResponse = await authGet(
        app,
        context.users.manager,
        `/api/payments/payroll/report/${context.restaurants.primary.id}?startDate=${payPeriodStart.toISOString()}&endDate=${payPeriodEnd.toISOString()}`,
      ).expect(200);

      expect(payrollResponse.body).toHaveProperty('payPeriod');
      expect(payrollResponse.body).toHaveProperty('workers');
      expect(payrollResponse.body).toHaveProperty('totals');

      // Step 9: Export analytics report
      const exportResponse = await authGet(
        app,
        context.users.manager,
        `/api/analytics/export?restaurantId=${context.restaurants.primary.id}&format=json&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(exportResponse.headers['content-type']).toContain('application/json');
    });
  });
});
