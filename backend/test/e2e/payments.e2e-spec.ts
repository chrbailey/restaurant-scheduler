/**
 * Payments E2E Tests
 *
 * Tests for instant pay and payroll endpoints:
 * - POST /payments/instant-pay/enroll - Enroll worker
 * - GET /payments/instant-pay/balance - Check balance
 * - POST /payments/instant-pay/transfer - Request transfer
 * - GET /payments/instant-pay/history - Transfer history
 * - GET /payments/payroll/report/:restaurantId - Payroll report
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
  futureDate,
  MockDailyPayClient,
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Payments E2E Tests', () => {
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

    jest.clearAllMocks();
  });

  const paymentsUrl = '/api/payments';

  // ==========================================================================
  // ENROLLMENT TESTS
  // ==========================================================================

  describe('POST /api/payments/instant-pay/enroll', () => {
    it('should enroll worker in instant pay', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/enroll`,
        {
          email: 'worker1@example.com',
          dateOfBirth: '1990-01-15',
          ssnLast4: '1234',
          bankAccount: {
            routingNumber: '021000021',
            accountNumber: '123456789',
            accountType: 'CHECKING',
          },
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
          },
        },
      ).expect(201);

      expect(response.body).toHaveProperty('enrolled', true);
      expect(response.body).toHaveProperty('externalEmployeeId');
      expect(response.body).toHaveProperty('status', 'ACTIVE');
      expect(response.body).toHaveProperty('bankAccountVerified', true);
    });

    it('should require email for enrollment', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/enroll`,
        {
          dateOfBirth: '1990-01-15',
          ssnLast4: '1234',
        },
      ).expect(400);
    });

    it('should require bank account details', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/enroll`,
        {
          email: 'worker1@example.com',
          dateOfBirth: '1990-01-15',
          ssnLast4: '1234',
          // Missing bank account
        },
      ).expect(400);
    });

    it('should reject enrollment without authentication', async () => {
      await request(app.getHttpServer())
        .post(`${paymentsUrl}/instant-pay/enroll`)
        .send({
          email: 'test@example.com',
        })
        .expect(401);
    });
  });

  describe('GET /api/payments/instant-pay/enrollment-status', () => {
    it('should return NOT_ENROLLED for non-enrolled worker', async () => {
      MockDailyPayClient.getEmployee.mockResolvedValueOnce(null);

      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/enrollment-status`,
      ).expect(200);

      expect(response.body).toHaveProperty('enrolled', false);
      expect(response.body).toHaveProperty('status', 'NOT_ENROLLED');
    });

    it('should return enrollment details for enrolled worker', async () => {
      MockDailyPayClient.getEmployee.mockResolvedValueOnce({
        dailypayEmployeeId: 'dp-emp-123',
        status: 'ACTIVE',
        enrolledAt: new Date().toISOString(),
        bankAccountVerified: true,
      });

      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/enrollment-status`,
      ).expect(200);

      expect(response.body).toHaveProperty('enrolled', true);
      expect(response.body).toHaveProperty('status', 'ACTIVE');
      expect(response.body).toHaveProperty('bankAccountVerified', true);
    });
  });

  describe('POST /api/payments/instant-pay/unenroll', () => {
    it('should unenroll worker from instant pay', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/unenroll`,
      ).expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(MockDailyPayClient.unenrollEmployee).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // BALANCE TESTS
  // ==========================================================================

  describe('GET /api/payments/instant-pay/balance', () => {
    beforeEach(async () => {
      // Create some completed shifts with earnings
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          workerId: context.users.worker1.workerProfileId,
          position: 'SERVER',
          startTime: new Date(yesterday.setHours(9, 0, 0, 0)),
          endTime: new Date(yesterday.setHours(17, 0, 0, 0)),
          status: 'COMPLETED',
          clockInTime: new Date(yesterday.setHours(9, 5, 0, 0)),
          clockOutTime: new Date(yesterday.setHours(17, 0, 0, 0)),
        },
      });

      // Create earnings record
      await prisma.workerEarnings.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          restaurantId: context.restaurants.primary.id,
          periodStart: new Date(yesterday.setHours(0, 0, 0, 0)),
          periodEnd: new Date(yesterday.setHours(23, 59, 59, 999)),
          grossEarnings: 144.0, // 8 hours * $18/hr
          netEarnings: 144.0,
          hoursWorked: 8.0,
          status: 'PENDING',
        },
      });
    });

    it('should return available instant pay balance', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/balance`,
      ).expect(200);

      expect(response.body).toHaveProperty('availableAmount');
      expect(response.body).toHaveProperty('pendingAmount');
      expect(response.body).toHaveProperty('totalEarned');
      expect(response.body).toHaveProperty('alreadyTransferred');
    });

    it('should include daily limit info', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/balance`,
      ).expect(200);

      expect(response.body).toHaveProperty('dailyLimit');
      expect(response.body).toHaveProperty('remainingDailyLimit');
    });
  });

  // ==========================================================================
  // TRANSFER TESTS
  // ==========================================================================

  describe('POST /api/payments/instant-pay/transfer', () => {
    beforeEach(async () => {
      // Create earnings for the worker
      await prisma.workerEarnings.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          restaurantId: context.restaurants.primary.id,
          periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
          grossEarnings: 200.0,
          netEarnings: 200.0,
          hoursWorked: 11.0,
          status: 'PENDING',
        },
      });
    });

    it('should request instant pay transfer', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/transfer`,
        {
          amount: 50.0,
          method: 'INSTANT',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('amount', 50.0);
      expect(response.body).toHaveProperty('fee');
      expect(response.body).toHaveProperty('netAmount');
      expect(response.body).toHaveProperty('status');
      expect(MockDailyPayClient.requestTransfer).toHaveBeenCalled();
    });

    it('should reject transfer exceeding available balance', async () => {
      MockDailyPayClient.requestTransfer.mockRejectedValueOnce(
        new Error('Insufficient balance'),
      );

      await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/transfer`,
        {
          amount: 500.0, // More than available
          method: 'INSTANT',
        },
      ).expect(400);
    });

    it('should accept standard (next-day) transfer method', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/transfer`,
        {
          amount: 50.0,
          method: 'STANDARD',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
    });

    it('should require amount', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/transfer`,
        {
          method: 'INSTANT',
        },
      ).expect(400);
    });

    it('should reject negative amount', async () => {
      await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/transfer`,
        {
          amount: -50.0,
          method: 'INSTANT',
        },
      ).expect(400);
    });
  });

  // ==========================================================================
  // TRANSFER HISTORY TESTS
  // ==========================================================================

  describe('GET /api/payments/instant-pay/history', () => {
    beforeEach(async () => {
      // Create some transfer records
      await prisma.instantPayTransfer.createMany({
        data: [
          {
            workerProfileId: context.users.worker1.workerProfileId!,
            externalTransferId: 'ext-transfer-1',
            amount: 50.0,
            fee: 2.99,
            netAmount: 47.01,
            method: 'INSTANT',
            status: 'COMPLETED',
            requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            processedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
          },
          {
            workerProfileId: context.users.worker1.workerProfileId!,
            externalTransferId: 'ext-transfer-2',
            amount: 75.0,
            fee: 2.99,
            netAmount: 72.01,
            method: 'INSTANT',
            status: 'COMPLETED',
            requestedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            processedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 3 * 60 * 1000),
          },
          {
            workerProfileId: context.users.worker1.workerProfileId!,
            externalTransferId: 'ext-transfer-3',
            amount: 100.0,
            fee: 0,
            netAmount: 100.0,
            method: 'STANDARD',
            status: 'PENDING',
            requestedAt: new Date(),
          },
        ],
      });
    });

    it('should return transfer history', async () => {
      MockDailyPayClient.getTransferHistory.mockResolvedValueOnce({
        transfers: [
          {
            transferId: 'ext-transfer-1',
            amount: 50.0,
            fee: 2.99,
            netAmount: 47.01,
            status: 'COMPLETED',
            requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            processedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
          },
        ],
        total: 3,
        page: 1,
        limit: 20,
      });

      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/history`,
      ).expect(200);

      expect(response.body).toHaveProperty('transfers');
      expect(Array.isArray(response.body.transfers)).toBe(true);
      expect(response.body).toHaveProperty('total');
    });

    it('should filter by date range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      MockDailyPayClient.getTransferHistory.mockResolvedValueOnce({
        transfers: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/history?startDate=${startDate}&endDate=${endDate}`,
      ).expect(200);

      expect(MockDailyPayClient.getTransferHistory).toHaveBeenCalled();
    });

    it('should paginate results', async () => {
      MockDailyPayClient.getTransferHistory.mockResolvedValueOnce({
        transfers: [],
        total: 10,
        page: 2,
        limit: 5,
      });

      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/history?page=2&limit=5`,
      ).expect(200);

      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('hasMore');
    });
  });

  // ==========================================================================
  // PAY HISTORY TESTS
  // ==========================================================================

  describe('GET /api/payments/instant-pay/pay-history', () => {
    it('should return combined pay history', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/instant-pay/pay-history`,
      ).expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('summary');
    });
  });

  // ==========================================================================
  // PAYROLL REPORT TESTS (MANAGER)
  // ==========================================================================

  describe('GET /api/payments/payroll/report/:restaurantId', () => {
    beforeEach(async () => {
      // Create completed shifts for multiple workers
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Worker 1 shifts
      for (let i = 0; i < 5; i++) {
        const shiftDate = new Date(weekAgo);
        shiftDate.setDate(shiftDate.getDate() + i);

        await prisma.shift.create({
          data: {
            restaurantId: context.restaurants.primary.id,
            createdById: context.users.manager.id,
            workerId: context.users.worker1.workerProfileId,
            position: 'SERVER',
            startTime: new Date(shiftDate.setHours(9, 0, 0, 0)),
            endTime: new Date(shiftDate.setHours(17, 0, 0, 0)),
            status: 'COMPLETED',
            clockInTime: new Date(shiftDate.setHours(9, 0, 0, 0)),
            clockOutTime: new Date(shiftDate.setHours(17, 0, 0, 0)),
          },
        });
      }

      // Worker 2 shifts
      for (let i = 0; i < 3; i++) {
        const shiftDate = new Date(weekAgo);
        shiftDate.setDate(shiftDate.getDate() + i);

        await prisma.shift.create({
          data: {
            restaurantId: context.restaurants.primary.id,
            createdById: context.users.manager.id,
            workerId: context.users.worker2.workerProfileId,
            position: 'HOST',
            startTime: new Date(shiftDate.setHours(11, 0, 0, 0)),
            endTime: new Date(shiftDate.setHours(19, 0, 0, 0)),
            status: 'COMPLETED',
            clockInTime: new Date(shiftDate.setHours(11, 5, 0, 0)),
            clockOutTime: new Date(shiftDate.setHours(19, 0, 0, 0)),
          },
        });
      }
    });

    it('should generate payroll report for pay period', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      const response = await authGet(
        app,
        context.users.manager,
        `${paymentsUrl}/payroll/report/${context.restaurants.primary.id}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('payPeriod');
      expect(response.body).toHaveProperty('workers');
      expect(response.body).toHaveProperty('totals');
      expect(Array.isArray(response.body.workers)).toBe(true);
    });

    it('should include worker details in report', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      const response = await authGet(
        app,
        context.users.manager,
        `${paymentsUrl}/payroll/report/${context.restaurants.primary.id}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(200);

      if (response.body.workers.length > 0) {
        const worker = response.body.workers[0];
        expect(worker).toHaveProperty('workerId');
        expect(worker).toHaveProperty('name');
        expect(worker).toHaveProperty('hoursWorked');
        expect(worker).toHaveProperty('grossPay');
      }
    });

    it('should reject payroll report from worker', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      await authGet(
        app,
        context.users.worker1,
        `${paymentsUrl}/payroll/report/${context.restaurants.primary.id}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(403);
    });

    it('should require date range parameters', async () => {
      await authGet(
        app,
        context.users.manager,
        `${paymentsUrl}/payroll/report/${context.restaurants.primary.id}`,
      ).expect(400);
    });
  });

  describe('GET /api/payments/payroll/report/:restaurantId/export', () => {
    it('should export payroll report as CSV', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      const response = await authGet(
        app,
        context.users.manager,
        `${paymentsUrl}/payroll/report/${context.restaurants.primary.id}/export?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
    });
  });

  // ==========================================================================
  // PAY PERIOD SUMMARY TESTS
  // ==========================================================================

  describe('GET /api/payments/payroll/summary/:restaurantId', () => {
    it('should return pay period summary', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      const response = await authGet(
        app,
        context.users.manager,
        `${paymentsUrl}/payroll/summary/${context.restaurants.primary.id}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('payPeriod');
      expect(response.body).toHaveProperty('totalHours');
      expect(response.body).toHaveProperty('totalGrossPay');
      expect(response.body).toHaveProperty('workerCount');
    });

    it('should allow supervisor to view summary', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      await authenticateUser(app, context.users.supervisor);

      await authGet(
        app,
        context.users.supervisor,
        `${paymentsUrl}/payroll/summary/${context.restaurants.primary.id}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(200);
    });
  });

  // ==========================================================================
  // RECONCILIATION TESTS
  // ==========================================================================

  describe('POST /api/payments/payroll/reconcile/:restaurantId', () => {
    it('should reconcile instant pay with regular payroll', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      const response = await authPost(
        app,
        context.users.manager,
        `${paymentsUrl}/payroll/reconcile/${context.restaurants.primary.id}`,
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      ).expect(200);

      expect(response.body).toHaveProperty('reconciled');
    });

    it('should reject reconciliation from worker', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      await authPost(
        app,
        context.users.worker1,
        `${paymentsUrl}/payroll/reconcile/${context.restaurants.primary.id}`,
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      ).expect(403);
    });
  });

  // ==========================================================================
  // SYNC EARNINGS TESTS
  // ==========================================================================

  describe('POST /api/payments/sync/earnings', () => {
    it('should sync completed shifts to earnings', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${paymentsUrl}/sync/earnings`,
        {
          restaurantId: context.restaurants.primary.id,
        },
      ).expect(200);

      expect(response.body).toHaveProperty('synced');
      expect(response.body).toHaveProperty('shiftsProcessed');
    });

    it('should allow syncing specific workers only', async () => {
      const response = await authPost(
        app,
        context.users.manager,
        `${paymentsUrl}/sync/earnings`,
        {
          restaurantId: context.restaurants.primary.id,
          workerIds: [context.users.worker1.workerProfileId],
        },
      ).expect(200);

      expect(response.body).toHaveProperty('synced');
    });
  });

  // ==========================================================================
  // HEALTH CHECK TESTS
  // ==========================================================================

  describe('GET /api/payments/health', () => {
    it('should return DailyPay integration health status', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${paymentsUrl}/health`,
      ).expect(200);

      expect(response.body).toHaveProperty('status');
      expect(MockDailyPayClient.healthCheck).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // WEBHOOK TESTS
  // ==========================================================================

  describe('POST /api/webhooks/payments/dailypay/transfer-status', () => {
    beforeEach(async () => {
      // Create a pending transfer
      await prisma.instantPayTransfer.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          externalTransferId: 'ext-transfer-webhook',
          amount: 50.0,
          fee: 2.99,
          netAmount: 47.01,
          method: 'INSTANT',
          status: 'PENDING',
          requestedAt: new Date(),
        },
      });
    });

    it('should handle transfer status update webhook', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/webhooks/payments/dailypay/transfer-status')
        .send({
          externalTransferId: 'ext-transfer-webhook',
          status: 'COMPLETED',
          processedAt: new Date().toISOString(),
        })
        .expect(200);

      expect(response.body).toHaveProperty('received', true);

      // Verify transfer was updated
      const transfer = await prisma.instantPayTransfer.findFirst({
        where: { externalTransferId: 'ext-transfer-webhook' },
      });
      expect(transfer?.status).toBe('COMPLETED');
    });

    it('should handle failed transfer status', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/webhooks/payments/dailypay/transfer-status')
        .send({
          externalTransferId: 'ext-transfer-webhook',
          status: 'FAILED',
          failureReason: 'Bank account verification failed',
        })
        .expect(200);

      expect(response.body).toHaveProperty('received', true);

      const transfer = await prisma.instantPayTransfer.findFirst({
        where: { externalTransferId: 'ext-transfer-webhook' },
      });
      expect(transfer?.status).toBe('FAILED');
      expect(transfer?.failureReason).toBe('Bank account verification failed');
    });
  });
});
