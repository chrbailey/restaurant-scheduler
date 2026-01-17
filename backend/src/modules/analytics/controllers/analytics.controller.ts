import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

// Services
import { IntelligentMatcherService } from '../services/intelligent-matcher.service';
import { LaborOptimizerService } from '../services/labor-optimizer.service';
import { ForecastAccuracyService } from '../services/forecast-accuracy.service';
import { WorkerAnalyticsService } from '../services/worker-analytics.service';
import { DashboardAggregatorService } from '../services/dashboard-aggregator.service';

// DTOs
import {
  DateRangeQueryDto,
  GetSuggestionsQueryDto,
  WorkerSuggestionDto,
  LaborAnalysisDto,
  ForecastAccuracyDto,
  ExecutiveSummaryDto,
  DashboardAlertDto,
  WorkerReportQueryDto,
  ExportReportQueryDto,
  ExportFormat,
  ComparisonQueryDto,
  RestaurantComparisonDto,
} from '../dto/analytics.dto';

/**
 * Analytics Controller
 *
 * REST API endpoints for analytics and intelligent worker matching:
 * - Worker suggestions for open shifts
 * - Labor cost analysis
 * - Forecast accuracy metrics
 * - Worker performance reports
 * - Executive dashboard data
 * - Report exports
 */
@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly intelligentMatcher: IntelligentMatcherService,
    private readonly laborOptimizer: LaborOptimizerService,
    private readonly forecastAccuracy: ForecastAccuracyService,
    private readonly workerAnalytics: WorkerAnalyticsService,
    private readonly dashboardAggregator: DashboardAggregatorService,
  ) {}

  // ==================== Worker Suggestions ====================

  @Get('suggestions/:shiftId')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get worker suggestions for a shift',
    description: 'Returns ranked list of workers best suited for an open shift based on multiple scoring factors.',
  })
  @ApiParam({ name: 'shiftId', description: 'Shift ID' })
  @ApiResponse({
    status: 200,
    description: 'List of worker suggestions with scores',
    type: [WorkerSuggestionDto],
  })
  async getWorkerSuggestions(
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Query() query: GetSuggestionsQueryDto,
  ): Promise<WorkerSuggestionDto[]> {
    const count = query.count || 10;
    return this.intelligentMatcher.suggestWorkersForShift(shiftId, count);
  }

  @Get('suggestions/:shiftId/explain/:workerProfileId')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Explain why a worker was suggested',
    description: 'Provides detailed breakdown of scoring factors for a specific worker-shift match.',
  })
  @ApiParam({ name: 'shiftId', description: 'Shift ID' })
  @ApiParam({ name: 'workerProfileId', description: 'Worker Profile ID' })
  @ApiResponse({ status: 200, description: 'Detailed explanation of the suggestion' })
  async explainSuggestion(
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Param('workerProfileId', ParseUUIDPipe) workerProfileId: string,
  ) {
    return this.intelligentMatcher.explainSuggestion(workerProfileId, shiftId);
  }

  @Post('suggestions/bulk')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get suggestions for multiple shifts',
    description: 'Returns worker suggestions for multiple shifts in a single request.',
  })
  @ApiResponse({ status: 200, description: 'Map of shift IDs to worker suggestions' })
  async getBulkSuggestions(
    @Query('shiftIds') shiftIdsParam: string,
    @Query() query: GetSuggestionsQueryDto,
  ): Promise<Record<string, WorkerSuggestionDto[]>> {
    const shiftIds = shiftIdsParam.split(',').map(id => id.trim());
    const count = query.count || 5;
    const results = await this.intelligentMatcher.getBulkSuggestions(shiftIds, count);

    // Convert Map to object for JSON serialization
    const response: Record<string, WorkerSuggestionDto[]> = {};
    results.forEach((suggestions, shiftId) => {
      response[shiftId] = suggestions;
    });

    return response;
  }

  // ==================== Labor Analysis ====================

  @Get('labor')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Analyze labor costs',
    description: 'Provides comprehensive labor cost breakdown by day, position, and hour.',
  })
  @ApiResponse({ status: 200, description: 'Labor cost analysis', type: LaborAnalysisDto })
  async analyzeLaborCosts(@Query() query: DateRangeQueryDto): Promise<LaborAnalysisDto> {
    const dateRange = this.parseDateRange(query);
    const analysis = await this.laborOptimizer.analyzeLaborCosts(query.restaurantId, dateRange);

    return {
      restaurantId: analysis.restaurantId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      summary: analysis.summary,
      dailyBreakdown: analysis.dailyBreakdown,
      positionBreakdown: analysis.positionBreakdown,
    };
  }

  @Get('labor/overstaffing')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Identify overstaffed periods',
    description: 'Analyzes staffing levels against demand to find overstaffed periods.',
  })
  @ApiResponse({ status: 200, description: 'Overstaffing analysis' })
  async identifyOverstaffing(@Query() query: DateRangeQueryDto) {
    const dateRange = this.parseDateRange(query);
    return this.laborOptimizer.identifyOverstaffing(query.restaurantId, dateRange);
  }

  @Get('labor/understaffing')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Identify coverage gaps',
    description: 'Analyzes staffing levels against demand to find understaffed periods.',
  })
  @ApiResponse({ status: 200, description: 'Understaffing analysis' })
  async identifyUnderstaffing(@Query() query: DateRangeQueryDto) {
    const dateRange = this.parseDateRange(query);
    return this.laborOptimizer.identifyUnderstaffing(query.restaurantId, dateRange);
  }

  @Get('labor/optimal-schedule')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get optimal schedule suggestion',
    description: 'Generates AI-suggested optimal schedule for a specific date.',
  })
  @ApiQuery({ name: 'restaurantId', required: true })
  @ApiQuery({ name: 'date', required: true, description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Optimal schedule suggestion' })
  async getOptimalSchedule(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('date') dateStr: string,
  ) {
    const date = new Date(dateStr);
    return this.laborOptimizer.getOptimalSchedule(restaurantId, date);
  }

  @Get('labor/savings')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Calculate savings opportunities',
    description: 'Identifies potential labor cost savings opportunities.',
  })
  @ApiQuery({ name: 'restaurantId', required: true })
  @ApiResponse({ status: 200, description: 'Savings opportunity analysis' })
  async calculateSavingsOpportunity(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.laborOptimizer.calculateSavingsOpportunity(restaurantId);
  }

  @Get('labor/benchmarks')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Compare to industry benchmarks',
    description: 'Compares restaurant labor metrics to industry averages.',
  })
  @ApiQuery({ name: 'restaurantId', required: true })
  @ApiQuery({ name: 'estimatedMonthlyRevenue', required: false })
  @ApiResponse({ status: 200, description: 'Industry benchmark comparison' })
  async compareToIndustryBenchmarks(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('estimatedMonthlyRevenue') revenueStr?: string,
  ) {
    const revenue = revenueStr ? parseFloat(revenueStr) : undefined;
    return this.laborOptimizer.compareToIndustryBenchmarks(restaurantId, revenue);
  }

  // ==================== Forecast Accuracy ====================

  @Get('forecast-accuracy')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Measure forecast accuracy',
    description: 'Compares predicted vs actual values to measure forecast performance.',
  })
  @ApiResponse({ status: 200, description: 'Forecast accuracy metrics', type: ForecastAccuracyDto })
  async measureForecastAccuracy(@Query() query: DateRangeQueryDto): Promise<ForecastAccuracyDto> {
    const dateRange = this.parseDateRange(query);
    const accuracy = await this.forecastAccuracy.measureAccuracy(query.restaurantId, dateRange);
    const trend = await this.forecastAccuracy.getAccuracyTrend(query.restaurantId);

    return {
      restaurantId: accuracy.restaurantId,
      overallAccuracy: accuracy.overallAccuracy,
      dineInAccuracy: accuracy.dineInAccuracy,
      deliveryAccuracy: accuracy.deliveryAccuracy,
      combinedAccuracy: accuracy.combinedAccuracy,
      trend: trend.trend,
      trendPercent: trend.trendPercent,
    };
  }

  @Get('forecast-accuracy/trend')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get accuracy trend over time',
    description: 'Shows how forecast accuracy has changed over recent periods.',
  })
  @ApiQuery({ name: 'restaurantId', required: true })
  @ApiQuery({ name: 'periods', required: false, description: 'Number of periods to analyze' })
  @ApiResponse({ status: 200, description: 'Accuracy trend data' })
  async getAccuracyTrend(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('periods') periodsStr?: string,
  ) {
    const periods = periodsStr ? parseInt(periodsStr, 10) : 6;
    return this.forecastAccuracy.getAccuracyTrend(restaurantId, periods);
  }

  @Get('forecast-accuracy/weak-points')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Identify forecast weak points',
    description: 'Identifies time periods, conditions, or factors where forecasts fail.',
  })
  @ApiResponse({ status: 200, description: 'List of weak points' })
  async identifyWeakPoints(@Query() query: DateRangeQueryDto) {
    const dateRange = this.parseDateRange(query);
    return this.forecastAccuracy.identifyWeakPoints(query.restaurantId, dateRange);
  }

  @Get('forecast-accuracy/report')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Generate accuracy report',
    description: 'Generates comprehensive forecast accuracy report.',
  })
  @ApiResponse({ status: 200, description: 'Detailed accuracy report' })
  async generateAccuracyReport(@Query() query: DateRangeQueryDto) {
    const dateRange = this.parseDateRange(query);
    return this.forecastAccuracy.generateAccuracyReport(query.restaurantId, dateRange);
  }

  // ==================== Worker Reports ====================

  @Get('workers/:id/report')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get worker performance report',
    description: 'Generates comprehensive performance report for an individual worker.',
  })
  @ApiParam({ name: 'id', description: 'Worker Profile ID' })
  @ApiResponse({ status: 200, description: 'Worker performance report' })
  async getWorkerPerformanceReport(
    @Param('id', ParseUUIDPipe) workerProfileId: string,
    @Query() query: WorkerReportQueryDto,
  ) {
    const report = await this.workerAnalytics.getWorkerPerformanceReport(workerProfileId);

    const result: any = { ...report };

    if (query.includeChurnRisk !== false) {
      result.churnRisk = await this.workerAnalytics.predictChurnRisk(workerProfileId);
    }

    if (query.includeEngagement !== false) {
      result.engagement = await this.workerAnalytics.getEngagementScore(workerProfileId);
    }

    if (query.includeTeamComparison !== false) {
      result.teamComparison = await this.workerAnalytics.compareToTeam(workerProfileId);
    }

    return result;
  }

  @Get('workers/:id/churn-risk')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Predict worker churn risk',
    description: 'Predicts likelihood that a worker will leave based on behavioral indicators.',
  })
  @ApiParam({ name: 'id', description: 'Worker Profile ID' })
  @ApiResponse({ status: 200, description: 'Churn risk assessment' })
  async predictChurnRisk(@Param('id', ParseUUIDPipe) workerProfileId: string) {
    return this.workerAnalytics.predictChurnRisk(workerProfileId);
  }

  @Get('workers/:id/engagement')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get worker engagement score',
    description: 'Calculates engagement score based on availability, responsiveness, and activity.',
  })
  @ApiParam({ name: 'id', description: 'Worker Profile ID' })
  @ApiResponse({ status: 200, description: 'Engagement score breakdown' })
  async getEngagementScore(@Param('id', ParseUUIDPipe) workerProfileId: string) {
    return this.workerAnalytics.getEngagementScore(workerProfileId);
  }

  @Get('workers/:id/retention-actions')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get retention action suggestions',
    description: 'Suggests actions to retain an at-risk worker.',
  })
  @ApiParam({ name: 'id', description: 'Worker Profile ID' })
  @ApiResponse({ status: 200, description: 'List of suggested retention actions' })
  async getRetentionActions(@Param('id', ParseUUIDPipe) workerProfileId: string) {
    return this.workerAnalytics.suggestRetentionActions(workerProfileId);
  }

  @Get('workers/:id/team-comparison')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Compare worker to team',
    description: 'Compares worker performance metrics against team averages.',
  })
  @ApiParam({ name: 'id', description: 'Worker Profile ID' })
  @ApiResponse({ status: 200, description: 'Team comparison metrics' })
  async compareWorkerToTeam(@Param('id', ParseUUIDPipe) workerProfileId: string) {
    return this.workerAnalytics.compareToTeam(workerProfileId);
  }

  // ==================== Dashboard ====================

  @Get('dashboard')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get executive dashboard',
    description: 'Returns high-level summary metrics, trends, and alerts for dashboard display.',
  })
  @ApiResponse({ status: 200, description: 'Executive summary', type: ExecutiveSummaryDto })
  async getDashboard(@Query() query: DateRangeQueryDto): Promise<ExecutiveSummaryDto> {
    const dateRange = this.parseDateRange(query);
    return this.dashboardAggregator.getExecutiveSummary(query.restaurantId, dateRange);
  }

  @Get('dashboard/metrics')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get key metrics with trends',
    description: 'Returns KPIs with trend indicators for dashboard widgets.',
  })
  @ApiQuery({ name: 'restaurantId', required: true })
  @ApiResponse({ status: 200, description: 'List of key metrics' })
  async getKeyMetrics(@Query('restaurantId', ParseUUIDPipe) restaurantId: string) {
    return this.dashboardAggregator.getKeyMetrics(restaurantId);
  }

  @Get('dashboard/alerts')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get dashboard alerts',
    description: 'Returns issues and alerts requiring attention.',
  })
  @ApiQuery({ name: 'restaurantId', required: true })
  @ApiResponse({ status: 200, description: 'List of alerts', type: [DashboardAlertDto] })
  async getAlerts(
    @Query('restaurantId', ParseUUIDPipe) restaurantId: string,
  ): Promise<DashboardAlertDto[]> {
    const alerts = await this.dashboardAggregator.getAlerts(restaurantId);
    return alerts as unknown as DashboardAlertDto[];
  }

  @Get('dashboard/comparison')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Compare restaurants',
    description: 'Compares metrics between two restaurants or against network average.',
  })
  @ApiResponse({ status: 200, description: 'Restaurant comparison', type: RestaurantComparisonDto })
  async getComparison(@Query() query: ComparisonQueryDto): Promise<RestaurantComparisonDto> {
    return this.dashboardAggregator.getComparisons(query.restaurantId, query.compareToId);
  }

  // ==================== Export ====================

  @Get('export')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Export analytics report',
    description: 'Exports analytics data in PDF, Excel, CSV, or JSON format.',
  })
  @ApiResponse({ status: 200, description: 'Downloaded report file' })
  async exportReport(@Query() query: ExportReportQueryDto, @Res() res: Response) {
    const dateRange = this.parseDateRange(query);
    const exportResult = await this.dashboardAggregator.exportReport(
      query.restaurantId,
      query.format,
      dateRange,
    );

    // Set response headers
    res.setHeader('Content-Type', exportResult.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportResult.filename}"`,
    );

    if (query.format === ExportFormat.JSON) {
      res.status(HttpStatus.OK).send(exportResult.data);
    } else {
      // For binary formats (PDF, Excel), would need proper file generation
      // For now, return as text/json representation
      res.status(HttpStatus.OK).send(exportResult.data);
    }
  }

  // ==================== Helper Methods ====================

  private parseDateRange(query: DateRangeQueryDto): { startDate: Date; endDate: Date } {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    return { startDate, endDate };
  }
}
