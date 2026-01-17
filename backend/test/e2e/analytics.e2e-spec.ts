/**
 * Analytics E2E Tests
 *
 * Tests for analytics and intelligent matching endpoints:
 * - GET /analytics/suggestions/:shiftId - Worker suggestions
 * - GET /analytics/labor - Labor cost analysis
 * - GET /analytics/forecast-accuracy - Forecast metrics
 * - GET /analytics/dashboard - Executive dashboard
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
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Analytics E2E Tests', () => {
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

    // Create historical data for analytics
    await seedAnalyticsData();
  });

  const analyticsUrl = '/api/analytics';

  async function seedAnalyticsData() {
    // Create completed shifts for labor analysis
    const now = new Date();
    for (let i = 1; i <= 14; i++) {
      const shiftDate = new Date(now);
      shiftDate.setDate(shiftDate.getDate() - i);

      await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          workerId: context.users.worker1.workerProfileId,
          position: i % 3 === 0 ? 'SERVER' : i % 3 === 1 ? 'HOST' : 'BARTENDER',
          startTime: new Date(shiftDate.setHours(9, 0, 0, 0)),
          endTime: new Date(shiftDate.setHours(17, 0, 0, 0)),
          status: 'COMPLETED',
          clockInTime: new Date(shiftDate.setHours(8, 55, 0, 0)),
          clockOutTime: new Date(shiftDate.setHours(17, 5, 0, 0)),
        },
      });
    }

    // Update worker profile with performance data
    await prisma.workerProfile.update({
      where: { id: context.users.worker1.workerProfileId },
      data: {
        reputationScore: 92,
        totalShiftsCompleted: 50,
        noShowCount: 1,
        lateArrivalCount: 3,
      },
    });

    await prisma.workerProfile.update({
      where: { id: context.users.worker2.workerProfileId },
      data: {
        reputationScore: 78,
        totalShiftsCompleted: 25,
        noShowCount: 2,
        lateArrivalCount: 5,
      },
    });
  }

  // ==========================================================================
  // WORKER SUGGESTIONS TESTS
  // ==========================================================================

  describe('GET /api/analytics/suggestions/:shiftId', () => {
    let openShiftId: string;

    beforeEach(async () => {
      const openShift = context.shifts.find(s => s.status === 'OPEN');
      if (!openShift) {
        const shift = await prisma.shift.create({
          data: {
            restaurantId: context.restaurants.primary.id,
            createdById: context.users.manager.id,
            position: 'SERVER',
            startTime: futureDate(2, 9),
            endTime: futureDate(2, 17),
            status: 'OPEN',
            publishedAt: new Date(),
          },
        });
        openShiftId = shift.id;
      } else {
        openShiftId = openShift.id;
      }
    });

    it('should return worker suggestions for open shift', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/suggestions/${openShiftId}`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((suggestion: any) => {
        expect(suggestion).toHaveProperty('workerId');
        expect(suggestion).toHaveProperty('score');
        expect(suggestion).toHaveProperty('reasons');
      });
    });

    it('should limit number of suggestions', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/suggestions/${openShiftId}?count=3`,
      ).expect(200);

      expect(response.body.length).toBeLessThanOrEqual(3);
    });

    it('should rank workers by score descending', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/suggestions/${openShiftId}`,
      ).expect(200);

      for (let i = 1; i < response.body.length; i++) {
        expect(response.body[i - 1].score).toBeGreaterThanOrEqual(response.body[i].score);
      }
    });

    it('should reject suggestions request from worker', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${analyticsUrl}/suggestions/${openShiftId}`,
      ).expect(403);
    });

    it('should allow supervisor to view suggestions', async () => {
      await authGet(
        app,
        context.users.supervisor,
        `${analyticsUrl}/suggestions/${openShiftId}`,
      ).expect(200);
    });
  });

  describe('GET /api/analytics/suggestions/:shiftId/explain/:workerProfileId', () => {
    let openShiftId: string;

    beforeEach(async () => {
      const shift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.primary.id,
          createdById: context.users.manager.id,
          position: 'SERVER',
          startTime: futureDate(3, 9),
          endTime: futureDate(3, 17),
          status: 'OPEN',
          publishedAt: new Date(),
        },
      });
      openShiftId = shift.id;
    });

    it('should explain suggestion scoring', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/suggestions/${openShiftId}/explain/${context.users.worker1.workerProfileId}`,
      ).expect(200);

      expect(response.body).toHaveProperty('worker');
      expect(response.body).toHaveProperty('shift');
      expect(response.body).toHaveProperty('factors');
      expect(response.body).toHaveProperty('totalScore');
    });
  });

  describe('POST /api/analytics/suggestions/bulk', () => {
    it('should get suggestions for multiple shifts', async () => {
      const shiftIds = context.shifts
        .filter(s => s.status === 'OPEN')
        .map(s => s.id)
        .slice(0, 3);

      if (shiftIds.length === 0) {
        // Create some open shifts
        for (let i = 0; i < 3; i++) {
          const shift = await prisma.shift.create({
            data: {
              restaurantId: context.restaurants.primary.id,
              createdById: context.users.manager.id,
              position: 'SERVER',
              startTime: futureDate(i + 2, 9),
              endTime: futureDate(i + 2, 17),
              status: 'OPEN',
              publishedAt: new Date(),
            },
          });
          shiftIds.push(shift.id);
        }
      }

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/suggestions/bulk?shiftIds=${shiftIds.join(',')}`,
      ).expect(200);

      expect(typeof response.body).toBe('object');
      // Each shift ID should have suggestions
      shiftIds.forEach(shiftId => {
        expect(response.body).toHaveProperty(shiftId);
      });
    });
  });

  // ==========================================================================
  // LABOR ANALYSIS TESTS
  // ==========================================================================

  describe('GET /api/analytics/labor', () => {
    it('should return labor cost analysis', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const endDate = new Date();

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('restaurantId');
      expect(response.body).toHaveProperty('startDate');
      expect(response.body).toHaveProperty('endDate');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('dailyBreakdown');
      expect(response.body).toHaveProperty('positionBreakdown');
    });

    it('should include summary metrics', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body.summary).toHaveProperty('totalHours');
      expect(response.body.summary).toHaveProperty('totalCost');
      expect(response.body.summary).toHaveProperty('averageHourlyRate');
    });

    it('should reject labor analysis from worker', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${analyticsUrl}/labor?restaurantId=${context.restaurants.primary.id}`,
      ).expect(403);
    });
  });

  describe('GET /api/analytics/labor/overstaffing', () => {
    it('should identify overstaffed periods', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor/overstaffing?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('overstaffedPeriods');
      expect(Array.isArray(response.body.overstaffedPeriods)).toBe(true);
    });
  });

  describe('GET /api/analytics/labor/understaffing', () => {
    it('should identify coverage gaps', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor/understaffing?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('understaffedPeriods');
      expect(Array.isArray(response.body.understaffedPeriods)).toBe(true);
    });
  });

  describe('GET /api/analytics/labor/optimal-schedule', () => {
    it('should suggest optimal schedule', async () => {
      const targetDate = futureDate(7);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor/optimal-schedule?restaurantId=${context.restaurants.primary.id}&date=${targetDate.toISOString().split('T')[0]}`,
      ).expect(200);

      expect(response.body).toHaveProperty('date');
      expect(response.body).toHaveProperty('suggestedShifts');
    });

    it('should reject optimal schedule from supervisor', async () => {
      const targetDate = futureDate(7);

      await authGet(
        app,
        context.users.supervisor,
        `${analyticsUrl}/labor/optimal-schedule?restaurantId=${context.restaurants.primary.id}&date=${targetDate.toISOString().split('T')[0]}`,
      ).expect(403);
    });
  });

  describe('GET /api/analytics/labor/savings', () => {
    it('should calculate savings opportunities', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor/savings?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('potentialSavings');
      expect(response.body).toHaveProperty('recommendations');
    });
  });

  describe('GET /api/analytics/labor/benchmarks', () => {
    it('should compare to industry benchmarks', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/labor/benchmarks?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('restaurantMetrics');
      expect(response.body).toHaveProperty('industryBenchmarks');
      expect(response.body).toHaveProperty('comparison');
    });
  });

  // ==========================================================================
  // FORECAST ACCURACY TESTS
  // ==========================================================================

  describe('GET /api/analytics/forecast-accuracy', () => {
    it('should return forecast accuracy metrics', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/forecast-accuracy?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('restaurantId');
      expect(response.body).toHaveProperty('overallAccuracy');
      expect(response.body).toHaveProperty('trend');
    });

    it('should include breakdown by channel', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/forecast-accuracy?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('dineInAccuracy');
      expect(response.body).toHaveProperty('deliveryAccuracy');
    });
  });

  describe('GET /api/analytics/forecast-accuracy/trend', () => {
    it('should return accuracy trend over time', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/forecast-accuracy/trend?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('trend');
      expect(response.body).toHaveProperty('periods');
    });

    it('should allow custom period count', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/forecast-accuracy/trend?restaurantId=${context.restaurants.primary.id}&periods=12`,
      ).expect(200);

      expect(response.body).toHaveProperty('periods');
    });
  });

  describe('GET /api/analytics/forecast-accuracy/weak-points', () => {
    it('should identify forecast weak points', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/forecast-accuracy/weak-points?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('weakPoints');
      expect(Array.isArray(response.body.weakPoints)).toBe(true);
    });
  });

  // ==========================================================================
  // WORKER REPORTS TESTS
  // ==========================================================================

  describe('GET /api/analytics/workers/:id/report', () => {
    it('should return worker performance report', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/workers/${context.users.worker1.workerProfileId}/report`,
      ).expect(200);

      expect(response.body).toHaveProperty('workerId');
      expect(response.body).toHaveProperty('shiftsCompleted');
      expect(response.body).toHaveProperty('punctuality');
      expect(response.body).toHaveProperty('reliability');
    });

    it('should include optional sections', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/workers/${context.users.worker1.workerProfileId}/report?includeChurnRisk=true&includeEngagement=true`,
      ).expect(200);

      expect(response.body).toHaveProperty('churnRisk');
      expect(response.body).toHaveProperty('engagement');
    });
  });

  describe('GET /api/analytics/workers/:id/churn-risk', () => {
    it('should predict worker churn risk', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/workers/${context.users.worker1.workerProfileId}/churn-risk`,
      ).expect(200);

      expect(response.body).toHaveProperty('riskLevel');
      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('factors');
    });
  });

  describe('GET /api/analytics/workers/:id/engagement', () => {
    it('should return worker engagement score', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/workers/${context.users.worker1.workerProfileId}/engagement`,
      ).expect(200);

      expect(response.body).toHaveProperty('engagementScore');
      expect(response.body).toHaveProperty('breakdown');
    });
  });

  describe('GET /api/analytics/workers/:id/team-comparison', () => {
    it('should compare worker to team', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/workers/${context.users.worker1.workerProfileId}/team-comparison`,
      ).expect(200);

      expect(response.body).toHaveProperty('worker');
      expect(response.body).toHaveProperty('teamAverage');
      expect(response.body).toHaveProperty('comparison');
    });
  });

  // ==========================================================================
  // DASHBOARD TESTS
  // ==========================================================================

  describe('GET /api/analytics/dashboard', () => {
    it('should return executive dashboard data', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/dashboard?restaurantId=${context.restaurants.primary.id}&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('kpis');
      expect(response.body).toHaveProperty('trends');
    });

    it('should allow supervisor to view dashboard', async () => {
      await authGet(
        app,
        context.users.supervisor,
        `${analyticsUrl}/dashboard?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);
    });
  });

  describe('GET /api/analytics/dashboard/metrics', () => {
    it('should return key metrics with trends', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/dashboard/metrics?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(Array.isArray(response.body.metrics)).toBe(true);
    });
  });

  describe('GET /api/analytics/dashboard/alerts', () => {
    it('should return dashboard alerts', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/dashboard/alerts?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((alert: any) => {
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('message');
      });
    });
  });

  describe('GET /api/analytics/dashboard/comparison', () => {
    it('should compare restaurants', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/dashboard/comparison?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('restaurant');
      expect(response.body).toHaveProperty('comparison');
    });

    it('should compare to specific restaurant', async () => {
      const response = await authGet(
        app,
        context.users.owner,
        `${analyticsUrl}/dashboard/comparison?restaurantId=${context.restaurants.primary.id}&compareToId=${context.restaurants.secondary.id}`,
      ).expect(200);

      expect(response.body).toHaveProperty('restaurant');
      expect(response.body).toHaveProperty('comparedTo');
    });
  });

  // ==========================================================================
  // EXPORT TESTS
  // ==========================================================================

  describe('GET /api/analytics/export', () => {
    it('should export analytics report as JSON', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/export?restaurantId=${context.restaurants.primary.id}&format=json&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should export analytics report as CSV', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const response = await authGet(
        app,
        context.users.manager,
        `${analyticsUrl}/export?restaurantId=${context.restaurants.primary.id}&format=csv&startDate=${startDate.toISOString()}`,
      ).expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should reject export from worker', async () => {
      await authGet(
        app,
        context.users.worker1,
        `${analyticsUrl}/export?restaurantId=${context.restaurants.primary.id}&format=json`,
      ).expect(403);
    });
  });
});
