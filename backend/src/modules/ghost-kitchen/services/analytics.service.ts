import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  SessionPnL,
  DateRangeFilter,
  PlatformBreakdown,
  DeliveryPlatform,
  DEFAULT_PLATFORM_FEES,
  GhostModeConfig,
  ForecastOpportunity,
  StaffingRecommendation,
} from '../entities/ghost-kitchen-session.entity';

/**
 * Analytics Service
 *
 * Ghost kitchen analytics and P&L calculations:
 * - Revenue tracking by platform
 * - Cost analysis (labor, supplies, fees)
 * - Performance metrics
 * - Weekly/monthly reporting
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate P&L for a specific session
   */
  async calculateSessionPnL(sessionId: string): Promise<SessionPnL> {
    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
      include: {
        orders: true,
        restaurant: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const config = session.config as unknown as GhostModeConfig;
    const completedOrders = session.orders.filter(
      (o) => o.status === 'PICKED_UP',
    );

    // Calculate revenue
    const revenue = completedOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    );

    // Calculate platform fees
    const platformFees = this.calculatePlatformFees(
      completedOrders,
      config?.platformFees,
    );

    // Calculate labor cost (ghost kitchen shifts during session)
    const laborCost = await this.calculateLaborCost(
      session.restaurantId,
      session.startedAt,
      session.endedAt || new Date(),
    );

    // Calculate supply/packaging cost
    const supplyPackagingCost = config?.supplyPackagingCost || 1.5;
    const supplyCost = completedOrders.length * supplyPackagingCost;

    // Calculate profits
    const grossProfit = revenue - platformFees;
    const netProfit = grossProfit - laborCost - supplyCost;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      sessionId,
      revenue,
      platformFees,
      laborCost,
      supplyCost,
      grossProfit,
      netProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
    };
  }

  /**
   * Get total delivery revenue for a date range
   */
  async getDeliveryRevenue(
    restaurantId: string,
    dateRange: DateRangeFilter,
  ): Promise<{
    total: number;
    byDay: Array<{ date: string; revenue: number; orders: number }>;
    byPlatform: PlatformBreakdown[];
  }> {
    const orders = await this.prisma.ghostKitchenOrder.findMany({
      where: {
        session: {
          restaurantId,
        },
        status: 'PICKED_UP',
        receivedAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      include: {
        session: true,
      },
    });

    // Total revenue
    const total = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    );

    // Revenue by day
    const byDayMap: Map<string, { revenue: number; orders: number }> =
      new Map();
    for (const order of orders) {
      const dateKey = order.receivedAt.toISOString().split('T')[0];
      const existing = byDayMap.get(dateKey) || { revenue: 0, orders: 0 };
      existing.revenue += Number(order.totalAmount);
      existing.orders += 1;
      byDayMap.set(dateKey, existing);
    }

    const byDay = Array.from(byDayMap.entries())
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by platform
    const byPlatform = this.aggregateByPlatform(orders);

    return { total, byDay, byPlatform };
  }

  /**
   * Get total delivery costs for a date range
   */
  async getDeliveryCosts(
    restaurantId: string,
    dateRange: DateRangeFilter,
  ): Promise<{
    labor: number;
    supplies: number;
    platformFees: number;
    total: number;
    breakdown: {
      laborByDay: Array<{ date: string; cost: number; hours: number }>;
      feesByPlatform: Array<{ platform: string; fees: number }>;
    };
  }> {
    // Get sessions in date range
    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      include: {
        orders: {
          where: { status: 'PICKED_UP' },
        },
      },
    });

    // Calculate labor costs
    const laborCost = await this.calculateLaborCost(
      restaurantId,
      dateRange.startDate,
      dateRange.endDate,
    );

    // Calculate supply costs
    let totalOrders = 0;
    for (const session of sessions) {
      totalOrders += session.orders.length;
    }
    const supplyCost = totalOrders * 1.5; // Default packaging cost

    // Calculate platform fees
    const allOrders = sessions.flatMap((s) => s.orders);
    const platformFees = this.calculatePlatformFees(allOrders);

    // Build labor by day breakdown
    const laborByDay = await this.calculateLaborByDay(
      restaurantId,
      dateRange.startDate,
      dateRange.endDate,
    );

    // Build fees by platform breakdown
    const feesByPlatform = this.calculateFeesByPlatform(allOrders);

    return {
      labor: laborCost,
      supplies: supplyCost,
      platformFees,
      total: laborCost + supplyCost + platformFees,
      breakdown: {
        laborByDay,
        feesByPlatform,
      },
    };
  }

  /**
   * Get platform-by-platform revenue breakdown
   */
  async getPlatformBreakdown(
    restaurantId: string,
    dateRange: DateRangeFilter,
  ): Promise<{
    platforms: Array<{
      platform: DeliveryPlatform;
      orders: number;
      revenue: number;
      fees: number;
      netRevenue: number;
      avgOrderValue: number;
      avgPrepTime: number | null;
      percentOfTotal: number;
    }>;
    totals: {
      orders: number;
      revenue: number;
      fees: number;
      netRevenue: number;
    };
  }> {
    const orders = await this.prisma.ghostKitchenOrder.findMany({
      where: {
        session: {
          restaurantId,
        },
        status: 'PICKED_UP',
        receivedAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const platformMap: Map<
      string,
      {
        orders: number;
        revenue: number;
        prepTimes: number[];
      }
    > = new Map();

    for (const order of orders) {
      const platform = order.platform;
      const existing = platformMap.get(platform) || {
        orders: 0,
        revenue: 0,
        prepTimes: [],
      };

      existing.orders += 1;
      existing.revenue += Number(order.totalAmount);

      if (order.prepStartedAt && order.readyAt) {
        const prepTime =
          (order.readyAt.getTime() - order.prepStartedAt.getTime()) / 1000;
        existing.prepTimes.push(prepTime);
      }

      platformMap.set(platform, existing);
    }

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce(
      (sum, o) => sum + Number(o.totalAmount),
      0,
    );

    const platforms = Array.from(platformMap.entries()).map(([platform, data]) => {
      const feeConfig =
        DEFAULT_PLATFORM_FEES[platform as DeliveryPlatform] || {
          commissionPercent: 20,
        };
      const fees = (data.revenue * feeConfig.commissionPercent) / 100;
      const avgPrepTime =
        data.prepTimes.length > 0
          ? data.prepTimes.reduce((a, b) => a + b, 0) / data.prepTimes.length
          : null;

      return {
        platform: platform as DeliveryPlatform,
        orders: data.orders,
        revenue: data.revenue,
        fees,
        netRevenue: data.revenue - fees,
        avgOrderValue: data.orders > 0 ? data.revenue / data.orders : 0,
        avgPrepTime,
        percentOfTotal:
          totalRevenue > 0
            ? Math.round((data.revenue / totalRevenue) * 100)
            : 0,
      };
    });

    const totalFees = platforms.reduce((sum, p) => sum + p.fees, 0);

    return {
      platforms,
      totals: {
        orders: totalOrders,
        revenue: totalRevenue,
        fees: totalFees,
        netRevenue: totalRevenue - totalFees,
      },
    };
  }

  /**
   * Get performance metrics for ghost kitchen operations
   */
  async getPerformanceMetrics(
    restaurantId: string,
    dateRange: DateRangeFilter,
  ): Promise<{
    avgPrepTime: number | null;
    orderAccuracy: number; // Percentage
    avgOrdersPerSession: number;
    avgRevenuePerSession: number;
    avgSessionDuration: number; // Minutes
    peakHours: Array<{ hour: number; orders: number }>;
    completionRate: number; // Percentage
    cancellationRate: number; // Percentage
  }> {
    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        status: 'ENDED',
      },
      include: {
        orders: true,
      },
    });

    if (sessions.length === 0) {
      return {
        avgPrepTime: null,
        orderAccuracy: 100,
        avgOrdersPerSession: 0,
        avgRevenuePerSession: 0,
        avgSessionDuration: 0,
        peakHours: [],
        completionRate: 0,
        cancellationRate: 0,
      };
    }

    const allOrders = sessions.flatMap((s) => s.orders);
    const completedOrders = allOrders.filter((o) => o.status === 'PICKED_UP');
    const cancelledOrders = allOrders.filter((o) => o.status === 'CANCELLED');

    // Average prep time
    const prepTimes = completedOrders
      .filter((o) => o.prepStartedAt && o.readyAt)
      .map(
        (o) => (o.readyAt!.getTime() - o.prepStartedAt!.getTime()) / 1000,
      );
    const avgPrepTime =
      prepTimes.length > 0
        ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length
        : null;

    // Session averages
    const avgOrdersPerSession = allOrders.length / sessions.length;
    const totalRevenue = sessions.reduce(
      (sum, s) => sum + Number(s.totalRevenue),
      0,
    );
    const avgRevenuePerSession = totalRevenue / sessions.length;

    // Session duration
    const durations = sessions
      .filter((s) => s.endedAt)
      .map(
        (s) => (s.endedAt!.getTime() - s.startedAt.getTime()) / 1000 / 60,
      );
    const avgSessionDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    // Peak hours
    const hourCounts: Map<number, number> = new Map();
    for (const order of allOrders) {
      const hour = order.receivedAt.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
    const peakHours = Array.from(hourCounts.entries())
      .map(([hour, orders]) => ({ hour, orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    // Completion and cancellation rates
    const completionRate =
      allOrders.length > 0
        ? (completedOrders.length / allOrders.length) * 100
        : 0;
    const cancellationRate =
      allOrders.length > 0
        ? (cancelledOrders.length / allOrders.length) * 100
        : 0;

    return {
      avgPrepTime,
      orderAccuracy: 100 - cancellationRate, // Simplified accuracy metric
      avgOrdersPerSession: Math.round(avgOrdersPerSession * 10) / 10,
      avgRevenuePerSession: Math.round(avgRevenuePerSession * 100) / 100,
      avgSessionDuration: Math.round(avgSessionDuration),
      peakHours,
      completionRate: Math.round(completionRate * 10) / 10,
      cancellationRate: Math.round(cancellationRate * 10) / 10,
    };
  }

  /**
   * Compare actual session results to forecast
   */
  async compareToForecast(sessionId: string): Promise<{
    actual: SessionPnL;
    forecast: {
      predictedOrders: number;
      predictedRevenue: number;
    } | null;
    variance: {
      ordersVariance: number;
      revenueVariance: number;
      ordersVariancePercent: number;
      revenueVariancePercent: number;
    } | null;
  }> {
    const actual = await this.calculateSessionPnL(sessionId);

    const session = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Get historical average for same day of week and time
    const dayOfWeek = session.startedAt.getDay();
    const hourStart = session.startedAt.getHours();

    const historicalSessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId: session.restaurantId,
        status: 'ENDED',
        id: { not: sessionId },
        startedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        },
      },
      include: {
        orders: true,
      },
    });

    // Filter to same day of week and similar start time
    const similarSessions = historicalSessions.filter((s) => {
      const sessionDayOfWeek = s.startedAt.getDay();
      const sessionHour = s.startedAt.getHours();
      return (
        sessionDayOfWeek === dayOfWeek &&
        Math.abs(sessionHour - hourStart) <= 1
      );
    });

    if (similarSessions.length === 0) {
      return {
        actual,
        forecast: null,
        variance: null,
      };
    }

    // Calculate forecast based on historical average
    const avgOrders =
      similarSessions.reduce((sum, s) => sum + s.totalOrders, 0) /
      similarSessions.length;
    const avgRevenue =
      similarSessions.reduce((sum, s) => sum + Number(s.totalRevenue), 0) /
      similarSessions.length;

    // Get actual session orders count
    const actualSession = await this.prisma.ghostKitchenSession.findUnique({
      where: { id: sessionId },
    });

    const actualOrders = actualSession?.totalOrders || 0;
    const actualRevenue = actual.revenue;

    const ordersVariance = actualOrders - avgOrders;
    const revenueVariance = actualRevenue - avgRevenue;

    return {
      actual,
      forecast: {
        predictedOrders: Math.round(avgOrders),
        predictedRevenue: Math.round(avgRevenue * 100) / 100,
      },
      variance: {
        ordersVariance: Math.round(ordersVariance),
        revenueVariance: Math.round(revenueVariance * 100) / 100,
        ordersVariancePercent:
          avgOrders > 0
            ? Math.round((ordersVariance / avgOrders) * 100)
            : 0,
        revenueVariancePercent:
          avgRevenue > 0
            ? Math.round((revenueVariance / avgRevenue) * 100)
            : 0,
      },
    };
  }

  /**
   * Get weekly report summary
   */
  async getWeeklyReport(
    restaurantId: string,
    weekStartDate?: Date,
  ): Promise<{
    weekStart: Date;
    weekEnd: Date;
    summary: {
      totalSessions: number;
      totalOrders: number;
      totalRevenue: number;
      totalCosts: number;
      netProfit: number;
      profitMargin: number;
    };
    dailyBreakdown: Array<{
      date: string;
      dayOfWeek: string;
      sessions: number;
      orders: number;
      revenue: number;
    }>;
    platformBreakdown: PlatformBreakdown[];
    topPerformingDay: string | null;
    recommendations: string[];
  }> {
    const weekStart = weekStartDate || this.getWeekStart(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const dateRange = { startDate: weekStart, endDate: weekEnd };

    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      include: {
        orders: true,
      },
    });

    // Calculate summary
    let totalOrders = 0;
    let totalRevenue = 0;
    for (const session of sessions) {
      totalOrders += session.totalOrders;
      totalRevenue += Number(session.totalRevenue);
    }

    const costs = await this.getDeliveryCosts(restaurantId, dateRange);
    const netProfit = totalRevenue - costs.total;
    const profitMargin =
      totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Daily breakdown
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyMap: Map<
      string,
      { sessions: number; orders: number; revenue: number }
    > = new Map();

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      dailyMap.set(dateKey, { sessions: 0, orders: 0, revenue: 0 });
    }

    for (const session of sessions) {
      const dateKey = session.startedAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.sessions += 1;
        existing.orders += session.totalOrders;
        existing.revenue += Number(session.totalRevenue);
      }
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(
      ([date, data]) => ({
        date,
        dayOfWeek: dayNames[new Date(date).getDay()],
        ...data,
      }),
    );

    // Platform breakdown
    const allOrders = sessions.flatMap((s) => s.orders);
    const platformBreakdown = this.aggregateByPlatform(
      allOrders.filter((o) => o.status === 'PICKED_UP'),
    );

    // Top performing day
    const topDay = dailyBreakdown.reduce(
      (best, day) =>
        !best || day.revenue > best.revenue ? day : best,
      null as typeof dailyBreakdown[0] | null,
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      totalSessions: sessions.length,
      avgOrdersPerSession:
        sessions.length > 0 ? totalOrders / sessions.length : 0,
      profitMargin,
      dailyBreakdown,
    });

    return {
      weekStart,
      weekEnd,
      summary: {
        totalSessions: sessions.length,
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCosts: Math.round(costs.total * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 10) / 10,
      },
      dailyBreakdown,
      platformBreakdown,
      topPerformingDay: topDay?.dayOfWeek || null,
      recommendations,
    };
  }

  /**
   * Get monthly report with trends
   */
  async getMonthlyReport(
    restaurantId: string,
    year: number,
    month: number,
  ): Promise<{
    month: number;
    year: number;
    summary: {
      totalSessions: number;
      totalOrders: number;
      totalRevenue: number;
      totalCosts: number;
      netProfit: number;
      profitMargin: number;
    };
    weeklyTrend: Array<{
      weekNumber: number;
      orders: number;
      revenue: number;
      profit: number;
    }>;
    comparison: {
      previousMonth: {
        orders: number;
        revenue: number;
        profit: number;
      };
      ordersGrowth: number;
      revenueGrowth: number;
      profitGrowth: number;
    } | null;
    topPlatform: DeliveryPlatform | null;
    avgOrderValue: number;
  }> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    const dateRange = { startDate: monthStart, endDate: monthEnd };

    const sessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        orders: {
          where: { status: 'PICKED_UP' },
        },
      },
    });

    // Calculate summary
    let totalOrders = 0;
    let totalRevenue = 0;
    for (const session of sessions) {
      totalOrders += session.orders.length;
      totalRevenue += session.orders.reduce(
        (sum, o) => sum + Number(o.totalAmount),
        0,
      );
    }

    const costs = await this.getDeliveryCosts(restaurantId, dateRange);
    const netProfit = totalRevenue - costs.total;
    const profitMargin =
      totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Weekly trend
    const weeklyTrend: Array<{
      weekNumber: number;
      orders: number;
      revenue: number;
      profit: number;
    }> = [];

    for (let week = 1; week <= 5; week++) {
      const weekStart = new Date(year, month - 1, (week - 1) * 7 + 1);
      const weekEnd = new Date(year, month - 1, week * 7);

      if (weekStart > monthEnd) break;

      const weekSessions = sessions.filter((s) => {
        const sessionDate = s.startedAt;
        return sessionDate >= weekStart && sessionDate <= weekEnd;
      });

      const weekOrders = weekSessions.reduce(
        (sum, s) => sum + s.orders.length,
        0,
      );
      const weekRevenue = weekSessions.reduce(
        (sum, s) =>
          sum +
          s.orders.reduce((oSum, o) => oSum + Number(o.totalAmount), 0),
        0,
      );

      weeklyTrend.push({
        weekNumber: week,
        orders: weekOrders,
        revenue: Math.round(weekRevenue * 100) / 100,
        profit: Math.round(weekRevenue * 0.2 * 100) / 100, // Simplified profit estimate
      });
    }

    // Previous month comparison
    const prevMonthStart = new Date(year, month - 2, 1);
    const prevMonthEnd = new Date(year, month - 1, 0, 23, 59, 59);

    const prevSessions = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        startedAt: {
          gte: prevMonthStart,
          lte: prevMonthEnd,
        },
      },
      include: {
        orders: {
          where: { status: 'PICKED_UP' },
        },
      },
    });

    let comparison = null;
    if (prevSessions.length > 0) {
      const prevOrders = prevSessions.reduce(
        (sum, s) => sum + s.orders.length,
        0,
      );
      const prevRevenue = prevSessions.reduce(
        (sum, s) =>
          sum +
          s.orders.reduce((oSum, o) => oSum + Number(o.totalAmount), 0),
        0,
      );
      const prevProfit = prevRevenue * 0.2; // Simplified

      comparison = {
        previousMonth: {
          orders: prevOrders,
          revenue: Math.round(prevRevenue * 100) / 100,
          profit: Math.round(prevProfit * 100) / 100,
        },
        ordersGrowth:
          prevOrders > 0
            ? Math.round(((totalOrders - prevOrders) / prevOrders) * 100)
            : 0,
        revenueGrowth:
          prevRevenue > 0
            ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100)
            : 0,
        profitGrowth:
          prevProfit > 0
            ? Math.round(((netProfit - prevProfit) / prevProfit) * 100)
            : 0,
      };
    }

    // Top platform
    const allOrders = sessions.flatMap((s) => s.orders);
    const platformCounts: Map<string, number> = new Map();
    for (const order of allOrders) {
      platformCounts.set(
        order.platform,
        (platformCounts.get(order.platform) || 0) + 1,
      );
    }
    const topPlatform = Array.from(platformCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as DeliveryPlatform | null;

    return {
      month,
      year,
      summary: {
        totalSessions: sessions.length,
        totalOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCosts: Math.round(costs.total * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 10) / 10,
      },
      weeklyTrend,
      comparison,
      topPlatform: topPlatform || null,
      avgOrderValue:
        totalOrders > 0
          ? Math.round((totalRevenue / totalOrders) * 100) / 100
          : 0,
    };
  }

  /**
   * Get demand forecast for upcoming opportunities
   */
  async getDemandForecast(
    restaurantId: string,
    days: number = 7,
  ): Promise<ForecastOpportunity[]> {
    // Get historical data for forecasting
    const historicalData = await this.prisma.ghostKitchenSession.findMany({
      where: {
        restaurantId,
        status: 'ENDED',
        startedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        orders: true,
      },
    });

    // Group by day of week and time slot
    const patterns: Map<
      string,
      { orders: number[]; revenues: number[] }
    > = new Map();

    for (const session of historicalData) {
      const dayOfWeek = session.startedAt.getDay();
      const hour = session.startedAt.getHours();
      const timeSlot = this.getTimeSlot(hour);
      const key = `${dayOfWeek}-${timeSlot}`;

      const existing = patterns.get(key) || { orders: [], revenues: [] };
      existing.orders.push(session.totalOrders);
      existing.revenues.push(Number(session.totalRevenue));
      patterns.set(key, existing);
    }

    // Generate forecasts for upcoming days
    const opportunities: ForecastOpportunity[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();

      // Generate opportunities for each time slot
      for (const timeSlot of ['11:00-15:00', '17:00-21:00', '21:00-24:00']) {
        const key = `${dayOfWeek}-${timeSlot}`;
        const pattern = patterns.get(key);

        if (!pattern || pattern.orders.length < 2) {
          continue; // Not enough data
        }

        const avgOrders =
          pattern.orders.reduce((a, b) => a + b, 0) / pattern.orders.length;
        const avgRevenue =
          pattern.revenues.reduce((a, b) => a + b, 0) /
          pattern.revenues.length;

        // Calculate confidence based on data points
        const confidence = Math.min(
          100,
          Math.round((pattern.orders.length / 12) * 100),
        );

        opportunities.push({
          id: `${date.toISOString().split('T')[0]}-${timeSlot}`,
          date,
          dayOfWeek,
          timeSlot,
          predictedOrders: Math.round(avgOrders),
          predictedRevenue: Math.round(avgRevenue * 100) / 100,
          confidence,
          historicalAverage: avgOrders,
          factors: this.identifyFactors(date, timeSlot),
          staffingRecommendation: this.calculateStaffingRecommendation(
            avgOrders,
            avgRevenue,
          ),
        });
      }
    }

    return opportunities.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ==================== Helper Methods ====================

  private calculatePlatformFees(
    orders: any[],
    customFees?: any[],
  ): number {
    let totalFees = 0;

    for (const order of orders) {
      const platform = order.platform as DeliveryPlatform;
      const feeConfig =
        customFees?.find((f) => f.platform === platform) ||
        DEFAULT_PLATFORM_FEES[platform];

      if (feeConfig) {
        const revenue = Number(order.totalAmount);
        const fee =
          (revenue * feeConfig.commissionPercent) / 100 +
          (feeConfig.flatFee || 0);
        totalFees += fee;
      }
    }

    return Math.round(totalFees * 100) / 100;
  }

  private async calculateLaborCost(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Get ghost kitchen shifts during the period
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        type: 'GHOST_KITCHEN',
        startTime: { gte: startDate },
        endTime: { lte: endDate },
        status: 'COMPLETED',
      },
      include: {
        assignedTo: true,
      },
    });

    let totalLaborCost = 0;

    for (const shift of shifts) {
      const hours =
        (shift.endTime.getTime() - shift.startTime.getTime()) / 1000 / 60 / 60;
      const hourlyRate = shift.assignedTo
        ? Number(shift.assignedTo.hourlyRate)
        : 15; // Default rate
      totalLaborCost += hours * hourlyRate;
    }

    return Math.round(totalLaborCost * 100) / 100;
  }

  private async calculateLaborByDay(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ date: string; cost: number; hours: number }>> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        type: 'GHOST_KITCHEN',
        startTime: { gte: startDate },
        endTime: { lte: endDate },
      },
      include: {
        assignedTo: true,
      },
    });

    const byDay: Map<string, { cost: number; hours: number }> = new Map();

    for (const shift of shifts) {
      const dateKey = shift.startTime.toISOString().split('T')[0];
      const hours =
        (shift.endTime.getTime() - shift.startTime.getTime()) / 1000 / 60 / 60;
      const hourlyRate = shift.assignedTo
        ? Number(shift.assignedTo.hourlyRate)
        : 15;
      const cost = hours * hourlyRate;

      const existing = byDay.get(dateKey) || { cost: 0, hours: 0 };
      existing.cost += cost;
      existing.hours += hours;
      byDay.set(dateKey, existing);
    }

    return Array.from(byDay.entries())
      .map(([date, data]) => ({
        date,
        cost: Math.round(data.cost * 100) / 100,
        hours: Math.round(data.hours * 10) / 10,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private calculateFeesByPlatform(
    orders: any[],
  ): Array<{ platform: string; fees: number }> {
    const byPlatform: Map<string, number> = new Map();

    for (const order of orders) {
      const platform = order.platform;
      const feeConfig =
        DEFAULT_PLATFORM_FEES[platform as DeliveryPlatform] || {
          commissionPercent: 20,
        };
      const fee = (Number(order.totalAmount) * feeConfig.commissionPercent) / 100;

      byPlatform.set(platform, (byPlatform.get(platform) || 0) + fee);
    }

    return Array.from(byPlatform.entries()).map(([platform, fees]) => ({
      platform,
      fees: Math.round(fees * 100) / 100,
    }));
  }

  private aggregateByPlatform(orders: any[]): PlatformBreakdown[] {
    const byPlatform: Map<string, PlatformBreakdown> = new Map();

    for (const order of orders) {
      const platform = order.platform as DeliveryPlatform;
      const existing = byPlatform.get(platform) || {
        platform,
        orders: 0,
        revenue: 0,
        fees: 0,
      };

      existing.orders += 1;
      existing.revenue += Number(order.totalAmount);

      const feeConfig = DEFAULT_PLATFORM_FEES[platform] || {
        commissionPercent: 20,
      };
      existing.fees +=
        (Number(order.totalAmount) * feeConfig.commissionPercent) / 100;

      byPlatform.set(platform, existing);
    }

    return Array.from(byPlatform.values());
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  private getTimeSlot(hour: number): string {
    if (hour >= 11 && hour < 15) return '11:00-15:00';
    if (hour >= 17 && hour < 21) return '17:00-21:00';
    if (hour >= 21) return '21:00-24:00';
    return 'other';
  }

  private identifyFactors(date: Date, timeSlot: string): string[] {
    const factors: string[] = [];
    const dayOfWeek = date.getDay();

    if (dayOfWeek === 5 || dayOfWeek === 6) {
      factors.push('weekend');
    }

    if (timeSlot === '17:00-21:00') {
      factors.push('dinner_rush');
    }

    if (timeSlot === '21:00-24:00') {
      factors.push('late_night');
    }

    return factors;
  }

  private calculateStaffingRecommendation(
    predictedOrders: number,
    predictedRevenue: number,
  ): StaffingRecommendation {
    // Simple staffing calculation: 1 worker per 5 orders capacity
    const minWorkers = Math.max(1, Math.ceil(predictedOrders / 8));
    const optimalWorkers = Math.max(1, Math.ceil(predictedOrders / 5));

    const avgHourlyRate = 15;
    const hoursPerShift = 4;
    const estimatedLaborCost = optimalWorkers * avgHourlyRate * hoursPerShift;

    return {
      minWorkers,
      optimalWorkers,
      positions: ['LINE_COOK', 'EXPEDITOR'],
      estimatedLaborCost,
      estimatedRevenuePerWorker:
        optimalWorkers > 0 ? predictedRevenue / optimalWorkers : 0,
    };
  }

  private generateRecommendations(data: {
    totalSessions: number;
    avgOrdersPerSession: number;
    profitMargin: number;
    dailyBreakdown: any[];
  }): string[] {
    const recommendations: string[] = [];

    if (data.totalSessions < 5) {
      recommendations.push(
        'Consider running more ghost kitchen sessions to increase revenue opportunities.',
      );
    }

    if (data.profitMargin < 15) {
      recommendations.push(
        'Profit margin is below target. Review labor scheduling and platform fee negotiations.',
      );
    }

    if (data.avgOrdersPerSession < 10) {
      recommendations.push(
        'Order volume per session is low. Consider extending session hours or improving visibility on platforms.',
      );
    }

    // Find slow days
    const slowDays = data.dailyBreakdown.filter(
      (d) => d.sessions === 0 || d.orders < 5,
    );
    if (slowDays.length > 2) {
      recommendations.push(
        `Consider running promotions on slower days: ${slowDays.map((d) => d.dayOfWeek).join(', ')}.`,
      );
    }

    return recommendations;
  }
}
