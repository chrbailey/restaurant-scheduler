/**
 * Ghost Kitchen E2E Tests
 *
 * Tests for ghost kitchen/delivery operations endpoints:
 * - POST /ghost-kitchen/enable - Enable ghost mode
 * - GET /ghost-kitchen/status - Check status
 * - POST /webhooks/kitchenhub/order-created - Mock order webhook
 * - PUT /ghost-kitchen/orders/:id/status - Update order
 * - POST /ghost-kitchen/disable - Disable ghost mode
 * - GET /ghost-kitchen/analytics - Get P&L
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
  TestContext,
  generateWebhookSignature,
  MockKitchenHubClient,
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Ghost Kitchen E2E Tests', () => {
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
    ]);

    jest.clearAllMocks();
  });

  const ghostKitchenUrl = '/api/ghost-kitchen';

  // ==========================================================================
  // ENABLE GHOST MODE TESTS
  // ==========================================================================

  describe('POST /api/ghost-kitchen/enable', () => {
    it('should enable ghost mode as manager', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
          maxOrders: 50,
          platforms: ['DOORDASH', 'UBEREATS'],
          autoAccept: true,
        },
      ).expect(201);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('status', 'ACTIVE');
      expect(response.body).toHaveProperty('startedAt');
    });

    it('should enable ghost mode with end time', async () => {
      const endTime = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours from now

      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
          endTime: endTime.toISOString(),
        },
      ).expect(201);

      expect(response.body).toHaveProperty('scheduledEndTime');
    });

    it('should enable ghost mode with supply/packaging cost override', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
          supplyPackagingCost: 2.5, // Per order
        },
      ).expect(201);

      expect(response.body).toHaveProperty('sessionId');
    });

    it('should reject enabling ghost mode when already active', async () => {
      // Enable first
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(201);

      // Try to enable again
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(400);
    });

    it('should reject enabling ghost mode by worker', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(403);
    });

    it('should require restaurantId', async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {},
      ).expect(400);
    });
  });

  // ==========================================================================
  // GET STATUS TESTS
  // ==========================================================================

  describe('GET /api/ghost-kitchen/status', () => {
    it('should return inactive status when ghost mode is not enabled', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('isActive', false);
    });

    it('should return active status with session details', async () => {
      // Enable ghost mode first
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
          maxOrders: 30,
        },
      );

      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('isActive', true);
      expect(response.body).toHaveProperty('session');
      expect(response.body.session).toHaveProperty('maxOrders', 30);
    });

    it('should include real-time metrics when active', async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      );

      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('orderCount');
      expect(response.body.metrics).toHaveProperty('revenue');
    });

    it('should allow supervisor to view status', async () => {
      await authGet(
        app,
        context.users.supervisor,
        `${ghostKitchenUrl}/status?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);
    });
  });

  // ==========================================================================
  // PAUSE/RESUME TESTS
  // ==========================================================================

  describe('POST /api/ghost-kitchen/pause', () => {
    beforeEach(async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      );
    });

    it('should pause ghost mode', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/pause`,
        {
          restaurantId: context.restaurants.primary.id,
          reason: 'Kitchen overwhelmed',
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'PAUSED');
    });

    it('should pause with auto-resume duration', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/pause`,
        {
          restaurantId: context.restaurants.primary.id,
          duration: 30, // 30 minutes
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'PAUSED');
      expect(response.body).toHaveProperty('resumeAt');
    });

    it('should reject pause when not active', async () => {
      // Disable first
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/disable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      );

      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/pause`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(400);
    });
  });

  describe('POST /api/ghost-kitchen/resume', () => {
    beforeEach(async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        { restaurantId: context.restaurants.primary.id },
      );

      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/pause`,
        { restaurantId: context.restaurants.primary.id },
      );
    });

    it('should resume paused ghost mode', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/resume`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'ACTIVE');
    });

    it('should reject resume when not paused', async () => {
      // Resume once
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/resume`,
        { restaurantId: context.restaurants.primary.id },
      );

      // Try to resume again (already active)
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/resume`,
        { restaurantId: context.restaurants.primary.id },
      ).expect(400);
    });
  });

  // ==========================================================================
  // DISABLE GHOST MODE TESTS
  // ==========================================================================

  describe('POST /api/ghost-kitchen/disable', () => {
    beforeEach(async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        { restaurantId: context.restaurants.primary.id },
      );
    });

    it('should disable ghost mode', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/disable`,
        {
          restaurantId: context.restaurants.primary.id,
          reason: 'End of shift',
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'COMPLETED');
      expect(response.body).toHaveProperty('endedAt');
    });

    it('should include session summary when disabling', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/disable`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('totalOrders');
      expect(response.body.summary).toHaveProperty('totalRevenue');
      expect(response.body.summary).toHaveProperty('duration');
    });

    it('should reject disable when not active', async () => {
      // Disable first
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/disable`,
        { restaurantId: context.restaurants.primary.id },
      );

      // Try again
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/disable`,
        { restaurantId: context.restaurants.primary.id },
      ).expect(400);
    });

    it('should reject disable by worker', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${ghostKitchenUrl}/disable`,
        { restaurantId: context.restaurants.primary.id },
      ).expect(403);
    });
  });

  // ==========================================================================
  // WEBHOOK TESTS
  // ==========================================================================

  describe('POST /api/webhooks/kitchenhub/order-created', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        {
          restaurantId: context.restaurants.primary.id,
          autoAccept: true,
        },
      );
      sessionId = response.body.sessionId;
    });

    it('should process incoming order webhook', async () => {
      const orderPayload = {
        eventId: 'evt-123',
        order: {
          externalOrderId: 'DD-12345',
          platform: 'DOORDASH',
          restaurantId: context.restaurants.primary.id,
          customer: {
            name: 'John Doe',
            phone: '+14155551234',
          },
          items: [
            {
              name: 'Burger',
              quantity: 2,
              price: 12.99,
              modifiers: ['No onions'],
            },
            {
              name: 'Fries',
              quantity: 2,
              price: 4.99,
            },
          ],
          subtotal: 35.96,
          tax: 2.88,
          deliveryFee: 3.99,
          tip: 5.0,
          total: 47.83,
          requestedTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          specialInstructions: 'Leave at door',
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(
        JSON.stringify(orderPayload),
        'test-webhook-secret',
        timestamp,
      );

      const response = await request(app.getHttpServer())
        .post('/api/webhooks/kitchenhub/order-created')
        .set('x-kitchenhub-signature', signature)
        .set('x-kitchenhub-timestamp', timestamp.toString())
        .send(orderPayload)
        .expect(200);

      expect(response.body).toHaveProperty('received', true);
      expect(response.body).toHaveProperty('orderId');
    });

    it('should reject order when ghost mode is not active', async () => {
      // Disable ghost mode
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/disable`,
        { restaurantId: context.restaurants.primary.id },
      );

      const orderPayload = {
        eventId: 'evt-456',
        order: {
          externalOrderId: 'DD-99999',
          platform: 'DOORDASH',
          restaurantId: context.restaurants.primary.id,
          items: [{ name: 'Pizza', quantity: 1, price: 15.99 }],
          total: 15.99,
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(
        JSON.stringify(orderPayload),
        'test-webhook-secret',
        timestamp,
      );

      const response = await request(app.getHttpServer())
        .post('/api/webhooks/kitchenhub/order-created')
        .set('x-kitchenhub-signature', signature)
        .set('x-kitchenhub-timestamp', timestamp.toString())
        .send(orderPayload)
        .expect(200);

      expect(response.body).toHaveProperty('received', true);
      expect(response.body.message).toContain('rejected');
    });

    it('should handle duplicate webhook (idempotency)', async () => {
      const orderPayload = {
        eventId: 'evt-duplicate-test',
        order: {
          externalOrderId: 'DD-DUPE',
          platform: 'DOORDASH',
          restaurantId: context.restaurants.primary.id,
          items: [{ name: 'Salad', quantity: 1, price: 9.99 }],
          total: 9.99,
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(
        JSON.stringify(orderPayload),
        'test-webhook-secret',
        timestamp,
      );

      // First request
      await request(app.getHttpServer())
        .post('/api/webhooks/kitchenhub/order-created')
        .set('x-kitchenhub-signature', signature)
        .set('x-kitchenhub-timestamp', timestamp.toString())
        .send(orderPayload)
        .expect(200);

      // Duplicate request (same eventId)
      const dupeResponse = await request(app.getHttpServer())
        .post('/api/webhooks/kitchenhub/order-created')
        .set('x-kitchenhub-signature', signature)
        .set('x-kitchenhub-timestamp', timestamp.toString())
        .send(orderPayload)
        .expect(200);

      expect(dupeResponse.body.message).toContain('Duplicate');
    });
  });

  describe('POST /api/webhooks/kitchenhub/order-cancelled', () => {
    beforeEach(async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        { restaurantId: context.restaurants.primary.id },
      );
    });

    it('should handle order cancellation webhook', async () => {
      const cancelPayload = {
        eventId: 'evt-cancel-123',
        externalOrderId: 'DD-12345',
        platform: 'DOORDASH',
        reason: 'Customer requested cancellation',
        initiatedBy: 'CUSTOMER',
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(
        JSON.stringify(cancelPayload),
        'test-webhook-secret',
        timestamp,
      );

      const response = await request(app.getHttpServer())
        .post('/api/webhooks/kitchenhub/order-cancelled')
        .set('x-kitchenhub-signature', signature)
        .set('x-kitchenhub-timestamp', timestamp.toString())
        .send(cancelPayload)
        .expect(200);

      expect(response.body).toHaveProperty('received', true);
    });
  });

  describe('POST /api/webhooks/kitchenhub/driver-assigned', () => {
    beforeEach(async () => {
      await authPost(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/enable`,
        { restaurantId: context.restaurants.primary.id },
      );
    });

    it('should handle driver assigned webhook', async () => {
      const driverPayload = {
        eventId: 'evt-driver-123',
        externalOrderId: 'DD-12345',
        platform: 'DOORDASH',
        driver: {
          name: 'Mike Driver',
          phone: '+14155559999',
          vehicle: 'Honda Civic',
          licensePlate: 'ABC123',
          estimatedArrival: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(
        JSON.stringify(driverPayload),
        'test-webhook-secret',
        timestamp,
      );

      const response = await request(app.getHttpServer())
        .post('/api/webhooks/kitchenhub/driver-assigned')
        .set('x-kitchenhub-signature', signature)
        .set('x-kitchenhub-timestamp', timestamp.toString())
        .send(driverPayload)
        .expect(200);

      expect(response.body).toHaveProperty('received', true);
    });
  });

  // ==========================================================================
  // SESSIONS HISTORY TESTS
  // ==========================================================================

  describe('GET /api/ghost-kitchen/sessions', () => {
    beforeEach(async () => {
      // Create some historical sessions
      await prisma.ghostKitchenSession.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          startedById: context.users.manager.id,
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          endedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
          totalOrders: 25,
          totalRevenue: 650.0,
        },
      });

      await prisma.ghostKitchenSession.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          startedById: context.users.manager.id,
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          endedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
          totalOrders: 18,
          totalRevenue: 480.0,
        },
      });
    });

    it('should list session history', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/sessions?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      const startDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/sessions?restaurantId=${context.restaurants.primary.id}&startDate=${startDate}&endDate=${endDate}`,
      ).expect(200);

      expect(response.body.sessions.length).toBe(2);
    });

    it('should paginate results', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/sessions?restaurantId=${context.restaurants.primary.id}&limit=1`,
      ).expect(200);

      expect(response.body.sessions.length).toBe(1);
    });
  });

  // ==========================================================================
  // ANALYTICS TESTS
  // ==========================================================================

  describe('GET /api/ghost-kitchen/analytics', () => {
    beforeEach(async () => {
      // Create session with orders
      const session = await prisma.ghostKitchenSession.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          startedById: context.users.manager.id,
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
          totalOrders: 30,
          totalRevenue: 850.0,
          platformFees: 85.0,
          laborCost: 120.0,
        },
      });

      // Create orders for the session
      for (let i = 0; i < 10; i++) {
        await prisma.ghostOrder.create({
          data: {
            sessionId: session.id,
            restaurantId: context.restaurants.primary.id,
            externalOrderId: `DD-${1000 + i}`,
            platform: i % 2 === 0 ? 'DOORDASH' : 'UBEREATS',
            status: 'COMPLETED',
            subtotal: 25.0,
            tax: 2.0,
            deliveryFee: 3.99,
            platformFee: 2.5,
            tip: 3.0,
            total: 33.99,
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + i * 15 * 60 * 1000),
            completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + i * 15 * 60 * 1000 + 20 * 60 * 1000),
          },
        });
      }
    });

    it('should return analytics dashboard data', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('dateRange');
      expect(response.body).toHaveProperty('revenue');
      expect(response.body).toHaveProperty('costs');
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('platformBreakdown');
    });

    it('should filter by date range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics?restaurantId=${context.restaurants.primary.id}&startDate=${startDate}&endDate=${endDate}`,
      ).expect(200);

      expect(response.body.dateRange.startDate).toBeDefined();
      expect(response.body.dateRange.endDate).toBeDefined();
    });
  });

  describe('GET /api/ghost-kitchen/analytics/pnl', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await prisma.ghostKitchenSession.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          startedById: context.users.manager.id,
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          endedAt: new Date(),
          totalOrders: 20,
          totalRevenue: 550.0,
          platformFees: 55.0,
          laborCost: 80.0,
          supplyCost: 30.0,
        },
      });
      sessionId = session.id;
    });

    it('should return P&L for specific session', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics/pnl?sessionId=${sessionId}&restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('pnl');
      expect(response.body.pnl).toHaveProperty('revenue');
      expect(response.body.pnl).toHaveProperty('platformFees');
      expect(response.body.pnl).toHaveProperty('laborCost');
      expect(response.body.pnl).toHaveProperty('netProfit');
      expect(response.body.pnl).toHaveProperty('profitMargin');
    });

    it('should return P&L summary for date range', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics/pnl?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('dateRange');
      expect(response.body).toHaveProperty('pnl');
    });

    it('should reject P&L request from supervisor', async () => {
      // P&L is typically restricted to manager/owner
      // Update if your implementation allows supervisors
      await authGet(
        app,
        context.users.supervisor,
        `${ghostKitchenUrl}/analytics/pnl?restaurantId=${context.restaurants.primary.id}`,
      ).expect(403);
    });
  });

  describe('GET /api/ghost-kitchen/analytics/platform-breakdown', () => {
    it('should return revenue breakdown by platform', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics/platform-breakdown?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('platforms');
      expect(Array.isArray(response.body.platforms) || typeof response.body.platforms === 'object').toBe(true);
    });
  });

  // ==========================================================================
  // WEEKLY/MONTHLY REPORTS TESTS
  // ==========================================================================

  describe('GET /api/ghost-kitchen/analytics/weekly', () => {
    it('should return weekly report', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics/weekly?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('weekStart');
    });
  });

  describe('GET /api/ghost-kitchen/analytics/monthly', () => {
    it('should return monthly report', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${ghostKitchenUrl}/analytics/monthly?restaurantId=${context.restaurants.primary.id}&year=2024&month=1`,
      ).expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
