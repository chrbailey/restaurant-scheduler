import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { GhostModeService } from '../services/ghost-mode.service';
import { SessionService } from '../services/session.service';
import { AnalyticsService } from '../services/analytics.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  EnableGhostModeDto,
  DisableGhostModeDto,
  PauseGhostModeDto,
  SessionHistoryQueryDto,
  AnalyticsQueryDto,
  PnLQueryDto,
} from '../dto/ghost-mode.dto';

/**
 * Ghost Mode Controller
 *
 * REST API endpoints for controlling ghost kitchen mode:
 * - Enable/disable ghost mode
 * - Pause/resume operations
 * - Get status and session data
 * - Analytics and P&L reports
 */
@ApiTags('ghost-kitchen')
@Controller('ghost-kitchen')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GhostModeController {
  constructor(
    private readonly ghostModeService: GhostModeService,
    private readonly sessionService: SessionService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // ==================== Ghost Mode Control ====================

  @Post('enable')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Enable ghost mode',
    description:
      'Start a ghost kitchen session with optional configuration for max orders, end time, platforms, etc.',
  })
  @ApiResponse({ status: 201, description: 'Ghost mode enabled successfully' })
  @ApiResponse({ status: 400, description: 'Ghost mode already active or not available' })
  async enableGhostMode(
    @Body() dto: EnableGhostModeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ghostModeService.enableGhostMode(dto.restaurantId, userId, {
      maxOrders: dto.maxOrders,
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      platforms: dto.platforms,
      autoAccept: dto.autoAccept,
      minPrepTime: dto.minPrepTime,
      supplyPackagingCost: dto.supplyPackagingCost,
    });
  }

  @Post('disable')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Disable ghost mode',
    description: 'End the current ghost kitchen session and calculate final statistics.',
  })
  @ApiResponse({ status: 200, description: 'Ghost mode disabled successfully' })
  @ApiResponse({ status: 400, description: 'Ghost mode not currently active' })
  async disableGhostMode(
    @Body() dto: DisableGhostModeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ghostModeService.disableGhostMode(
      dto.restaurantId,
      userId,
      dto.reason,
    );
  }

  @Post('pause')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Pause ghost mode temporarily',
    description:
      'Temporarily stop accepting orders. Can specify duration for auto-resume.',
  })
  @ApiResponse({ status: 200, description: 'Ghost mode paused successfully' })
  @ApiResponse({ status: 400, description: 'Ghost mode not currently active' })
  async pauseGhostMode(
    @Body() dto: PauseGhostModeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ghostModeService.pauseGhostMode(dto.restaurantId, userId, {
      duration: dto.duration,
      reason: dto.reason,
    });
  }

  @Post('resume')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Resume ghost mode from pause',
    description: 'Resume accepting orders after a pause.',
  })
  @ApiResponse({ status: 200, description: 'Ghost mode resumed successfully' })
  @ApiResponse({ status: 400, description: 'Ghost mode not currently paused' })
  async resumeGhostMode(
    @Body() dto: { restaurantId: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.ghostModeService.resumeGhostMode(dto.restaurantId, userId);
  }

  @Get('status')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get ghost mode status',
    description:
      'Get current ghost mode status including active session details and real-time metrics.',
  })
  @ApiQuery({ name: 'restaurantId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Current ghost mode status' })
  async getStatus(@Query('restaurantId', ParseUUIDPipe) restaurantId: string) {
    return this.ghostModeService.getGhostModeStatus(restaurantId);
  }

  // ==================== Sessions ====================

  @Get('sessions')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get session history',
    description: 'Get paginated list of past ghost kitchen sessions.',
  })
  @ApiResponse({ status: 200, description: 'Session history list' })
  async getSessions(@Query() query: SessionHistoryQueryDto) {
    const dateRange =
      query.startDate && query.endDate
        ? {
            startDate: new Date(query.startDate),
            endDate: new Date(query.endDate),
          }
        : undefined;

    return this.sessionService.getSessionHistory(query.restaurantId, dateRange, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('sessions/:sessionId')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get session details',
    description: 'Get detailed information about a specific session.',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSessionDetails(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessionService.getSessionById(sessionId);
  }

  @Get('sessions/:sessionId/metrics')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get session metrics',
    description: 'Get detailed performance metrics for a session.',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session metrics' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSessionMetrics(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessionService.getSessionMetrics(sessionId);
  }

  // ==================== Analytics ====================

  @Get('analytics')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get analytics dashboard data',
    description:
      'Get comprehensive analytics including revenue, costs, and performance metrics.',
  })
  @ApiResponse({ status: 200, description: 'Analytics dashboard data' })
  async getAnalytics(@Query() query: AnalyticsQueryDto) {
    const dateRange = {
      startDate: query.startDate
        ? new Date(query.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default 30 days
      endDate: query.endDate ? new Date(query.endDate) : new Date(),
    };

    const [revenue, costs, performance, platformBreakdown] = await Promise.all([
      this.analyticsService.getDeliveryRevenue(query.restaurantId, dateRange),
      this.analyticsService.getDeliveryCosts(query.restaurantId, dateRange),
      this.analyticsService.getPerformanceMetrics(query.restaurantId, dateRange),
      this.analyticsService.getPlatformBreakdown(query.restaurantId, dateRange),
    ]);

    return {
      dateRange,
      revenue,
      costs,
      performance,
      platformBreakdown,
    };
  }

  @Get('analytics/pnl')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get P&L report',
    description:
      'Get profit and loss report for a specific session or date range.',
  })
  @ApiResponse({ status: 200, description: 'P&L report data' })
  async getPnLReport(@Query() query: PnLQueryDto) {
    if (query.sessionId) {
      // Single session P&L
      const pnl = await this.analyticsService.calculateSessionPnL(
        query.sessionId,
      );
      const comparison = await this.analyticsService.compareToForecast(
        query.sessionId,
      );
      return { pnl, comparison };
    }

    // Date range P&L summary
    const dateRange = {
      startDate: query.startDate
        ? new Date(query.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: query.endDate ? new Date(query.endDate) : new Date(),
    };

    const [revenue, costs] = await Promise.all([
      this.analyticsService.getDeliveryRevenue(query.restaurantId, dateRange),
      this.analyticsService.getDeliveryCosts(query.restaurantId, dateRange),
    ]);

    const netProfit = revenue.total - costs.total;
    const profitMargin =
      revenue.total > 0 ? (netProfit / revenue.total) * 100 : 0;

    return {
      dateRange,
      pnl: {
        revenue: revenue.total,
        platformFees: costs.platformFees,
        laborCost: costs.labor,
        supplyCost: costs.supplies,
        totalCosts: costs.total,
        grossProfit: revenue.total - costs.platformFees,
        netProfit,
        profitMargin: Math.round(profitMargin * 10) / 10,
      },
      revenueByDay: revenue.byDay,
      revenueByPlatform: revenue.byPlatform,
      costBreakdown: costs.breakdown,
    };
  }

  @Get('analytics/weekly')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get weekly report',
    description: 'Get weekly summary with daily breakdown and recommendations.',
  })
  @ApiQuery({ name: 'restaurantId', required: true, type: String })
  @ApiQuery({ name: 'weekStart', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Weekly report data' })
  async getWeeklyReport(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('weekStart') weekStart?: string,
  ) {
    return this.analyticsService.getWeeklyReport(
      restaurantId,
      weekStart ? new Date(weekStart) : undefined,
    );
  }

  @Get('analytics/monthly')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get monthly report',
    description: 'Get monthly summary with trends and comparison to previous month.',
  })
  @ApiQuery({ name: 'restaurantId', required: true, type: String })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'month', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'Monthly report data' })
  async getMonthlyReport(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('year') year: number,
    @Query('month') month: number,
  ) {
    return this.analyticsService.getMonthlyReport(
      restaurantId,
      Number(year),
      Number(month),
    );
  }

  @Get('analytics/platform-breakdown')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get platform breakdown',
    description: 'Get detailed revenue and performance breakdown by delivery platform.',
  })
  @ApiResponse({ status: 200, description: 'Platform breakdown data' })
  async getPlatformBreakdown(@Query() query: AnalyticsQueryDto) {
    const dateRange = {
      startDate: query.startDate
        ? new Date(query.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: query.endDate ? new Date(query.endDate) : new Date(),
    };

    return this.analyticsService.getPlatformBreakdown(
      query.restaurantId,
      dateRange,
    );
  }
}
