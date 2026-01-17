import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== Common DTOs ====================

/**
 * Date range query DTO
 */
export class DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Start date (ISO 8601). Defaults to 30 days ago.',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (ISO 8601). Defaults to today.',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;
}

// ==================== Worker Suggestion DTOs ====================

/**
 * Scoring factor breakdown
 */
export class ScoringFactorsDto {
  @ApiProperty({ description: 'Whether worker is qualified for position' })
  positionMatch: boolean;

  @ApiProperty({ description: 'Whether worker is available' })
  isAvailable: boolean;

  @ApiProperty({ description: 'Performance score (0-100)' })
  performanceScore: number;

  @ApiProperty({ description: 'Reliability score (0-100)' })
  reliabilityScore: number;

  @ApiProperty({ description: 'Distance score (0-100)' })
  distanceScore: number;

  @ApiProperty({ description: 'Overtime risk score (0-100)' })
  overtimeRiskScore: number;

  @ApiProperty({ description: 'Preference match score (0-100)' })
  preferenceScore: number;

  @ApiProperty({ description: 'Team synergy score (0-100)' })
  teamSynergyScore: number;

  @ApiProperty({ description: 'Cost efficiency score (0-100)' })
  costEfficiencyScore: number;
}

/**
 * Worker suggestion response DTO
 */
export class WorkerSuggestionDto {
  @ApiProperty({ description: 'User ID of the worker' })
  workerId: string;

  @ApiProperty({ description: 'Worker profile ID' })
  workerProfileId: string;

  @ApiProperty({ description: 'Worker full name' })
  workerName: string;

  @ApiPropertyOptional({ description: 'Worker avatar URL' })
  avatarUrl: string | null;

  @ApiProperty({ description: 'Total match score (0-100)' })
  totalScore: number;

  @ApiProperty({ description: 'Whether worker is qualified for the position' })
  isQualified: boolean;

  @ApiProperty({ description: 'Whether worker is available for the shift' })
  isAvailable: boolean;

  @ApiProperty({ description: 'Score breakdown by factor', type: ScoringFactorsDto })
  factors: ScoringFactorsDto;

  @ApiProperty({ description: 'Positive explanations for the suggestion', type: [String] })
  explanation: string[];

  @ApiProperty({ description: 'Warnings about this worker for this shift', type: [String] })
  warnings: string[];
}

/**
 * Get worker suggestions query DTO
 */
export class GetSuggestionsQueryDto {
  @ApiPropertyOptional({
    description: 'Number of suggestions to return',
    example: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  count?: number;
}

// ==================== Labor Analysis DTOs ====================

/**
 * Daily labor breakdown item
 */
export class DailyLaborBreakdownDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Day of week (0-6)' })
  dayOfWeek: number;

  @ApiProperty({ description: 'Total labor cost for the day' })
  laborCost: number;

  @ApiProperty({ description: 'Total labor hours for the day' })
  laborHours: number;

  @ApiProperty({ description: 'Number of workers who worked' })
  workerCount: number;

  @ApiProperty({ description: 'Overtime cost for the day' })
  overtimeCost: number;

  @ApiPropertyOptional({ description: 'Revenue for the day' })
  revenue?: number;

  @ApiPropertyOptional({ description: 'Labor as percent of revenue' })
  laborPercent?: number;
}

/**
 * Position labor breakdown item
 */
export class PositionLaborBreakdownDto {
  @ApiProperty({ description: 'Position name' })
  position: string;

  @ApiProperty({ description: 'Total labor cost for this position' })
  laborCost: number;

  @ApiProperty({ description: 'Total labor hours for this position' })
  laborHours: number;

  @ApiProperty({ description: 'Number of workers in this position' })
  workerCount: number;

  @ApiProperty({ description: 'Average hourly rate for this position' })
  averageHourlyRate: number;
}

/**
 * Labor analysis summary
 */
export class LaborSummaryDto {
  @ApiProperty({ description: 'Total labor cost' })
  totalLaborCost: number;

  @ApiProperty({ description: 'Total labor hours' })
  totalLaborHours: number;

  @ApiProperty({ description: 'Total overtime cost' })
  totalOvertimeCost: number;

  @ApiProperty({ description: 'Total overtime hours' })
  totalOvertimeHours: number;

  @ApiProperty({ description: 'Average hourly rate' })
  averageHourlyRate: number;

  @ApiProperty({ description: 'Labor cost per hour' })
  laborCostPerHour: number;

  @ApiPropertyOptional({ description: 'Estimated revenue' })
  estimatedRevenue?: number;

  @ApiPropertyOptional({ description: 'Labor as percentage of revenue' })
  laborAsPercentOfRevenue?: number;
}

/**
 * Full labor analysis response DTO
 */
export class LaborAnalysisDto {
  @ApiProperty({ description: 'Restaurant ID' })
  restaurantId: string;

  @ApiProperty({ description: 'Start date of analysis' })
  startDate: Date;

  @ApiProperty({ description: 'End date of analysis' })
  endDate: Date;

  @ApiProperty({ description: 'Summary metrics', type: LaborSummaryDto })
  summary: LaborSummaryDto;

  @ApiProperty({ description: 'Daily breakdown', type: [DailyLaborBreakdownDto] })
  dailyBreakdown: DailyLaborBreakdownDto[];

  @ApiProperty({ description: 'Position breakdown', type: [PositionLaborBreakdownDto] })
  positionBreakdown: PositionLaborBreakdownDto[];
}

// ==================== Forecast Accuracy DTOs ====================

/**
 * Accuracy metrics DTO
 */
export class AccuracyMetricsDto {
  @ApiProperty({ description: 'Mean Absolute Percentage Error' })
  mape: number;

  @ApiProperty({ description: 'Root Mean Square Error' })
  rmse: number;

  @ApiProperty({ description: 'Mean Absolute Error' })
  mae: number;

  @ApiProperty({ description: 'Systematic bias' })
  bias: number;

  @ApiProperty({ description: 'R-squared coefficient' })
  r2: number;

  @ApiProperty({ description: 'Number of samples' })
  sampleCount: number;
}

/**
 * Forecast accuracy response DTO
 */
export class ForecastAccuracyDto {
  @ApiProperty({ description: 'Restaurant ID' })
  restaurantId: string;

  @ApiProperty({ description: 'Overall accuracy score (0-100)' })
  overallAccuracy: number;

  @ApiProperty({ description: 'Dine-in forecast accuracy', type: AccuracyMetricsDto })
  dineInAccuracy: AccuracyMetricsDto;

  @ApiProperty({ description: 'Delivery forecast accuracy', type: AccuracyMetricsDto })
  deliveryAccuracy: AccuracyMetricsDto;

  @ApiProperty({ description: 'Combined accuracy', type: AccuracyMetricsDto })
  combinedAccuracy: AccuracyMetricsDto;

  @ApiProperty({ description: 'Accuracy trend over time' })
  trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';

  @ApiProperty({ description: 'Trend percentage change' })
  trendPercent: number;
}

// ==================== Executive Summary DTOs ====================

/**
 * Dashboard highlights DTO
 */
export class DashboardHighlightsDto {
  @ApiProperty({ description: 'Total labor cost' })
  laborCost: number;

  @ApiProperty({ description: 'Total labor hours' })
  laborHours: number;

  @ApiProperty({ description: 'Labor as percentage of revenue' })
  laborAsPercentOfRevenue: number;

  @ApiProperty({ description: 'Number of shifts completed' })
  shiftsCompleted: number;

  @ApiProperty({ description: 'Forecast accuracy percentage' })
  forecastAccuracy: number;

  @ApiProperty({ description: 'Number of active workers' })
  workerCount: number;

  @ApiProperty({ description: 'Average reliability score' })
  averageReliability: number;
}

/**
 * Dashboard trends DTO
 */
export class DashboardTrendsDto {
  @ApiProperty({ description: 'Labor cost trend percentage' })
  laborCostTrend: number;

  @ApiProperty({ description: 'Labor hours trend percentage' })
  laborHoursTrend: number;

  @ApiProperty({ description: 'Shift completion trend percentage' })
  shiftCompletionTrend: number;

  @ApiProperty({ description: 'Forecast accuracy trend percentage' })
  forecastAccuracyTrend: number;
}

/**
 * Top performer item DTO
 */
export class TopPerformerDto {
  @ApiProperty({ description: 'Worker ID' })
  workerId: string;

  @ApiProperty({ description: 'Worker name' })
  name: string;

  @ApiProperty({ description: 'Performance metric' })
  metric: string;

  @ApiProperty({ description: 'Metric value' })
  value: number;
}

/**
 * Executive summary response DTO
 */
export class ExecutiveSummaryDto {
  @ApiProperty({ description: 'Restaurant ID' })
  restaurantId: string;

  @ApiProperty({ description: 'Restaurant name' })
  restaurantName: string;

  @ApiProperty({ description: 'Report generation timestamp' })
  generatedAt: Date;

  @ApiProperty({ description: 'Key highlights', type: DashboardHighlightsDto })
  highlights: DashboardHighlightsDto;

  @ApiProperty({ description: 'Trend indicators', type: DashboardTrendsDto })
  trends: DashboardTrendsDto;

  @ApiProperty({ description: 'Top performing workers', type: [TopPerformerDto] })
  topPerformers: TopPerformerDto[];

  @ApiProperty({ description: 'Areas requiring attention', type: [String] })
  areasOfConcern: string[];
}

// ==================== Alert DTOs ====================

/**
 * Alert severity enum
 */
export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Alert category enum
 */
export enum AlertCategory {
  STAFFING = 'STAFFING',
  LABOR_COST = 'LABOR_COST',
  ATTENDANCE = 'ATTENDANCE',
  FORECAST = 'FORECAST',
  WORKER = 'WORKER',
}

/**
 * Dashboard alert DTO
 */
export class DashboardAlertDto {
  @ApiProperty({ description: 'Unique alert ID' })
  id: string;

  @ApiProperty({ description: 'Alert severity', enum: AlertSeverity })
  severity: AlertSeverity;

  @ApiProperty({ description: 'Alert category', enum: AlertCategory })
  category: AlertCategory;

  @ApiProperty({ description: 'Alert title' })
  title: string;

  @ApiProperty({ description: 'Alert description' })
  description: string;

  @ApiPropertyOptional({ description: 'Affected entity ID (worker, shift, etc.)' })
  affectedEntity?: string;

  @ApiProperty({ description: 'Suggested action to resolve' })
  suggestedAction: string;

  @ApiProperty({ description: 'When the alert was created' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When the alert expires' })
  expiresAt?: Date;
}

// ==================== Worker Report DTOs ====================

/**
 * Worker performance report query DTO
 */
export class WorkerReportQueryDto {
  @ApiPropertyOptional({
    description: 'Include churn risk assessment',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeChurnRisk?: boolean;

  @ApiPropertyOptional({
    description: 'Include engagement score',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeEngagement?: boolean;

  @ApiPropertyOptional({
    description: 'Include team comparison',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeTeamComparison?: boolean;
}

/**
 * Churn risk indicator DTO
 */
export class ChurnIndicatorsDto {
  @ApiProperty({ description: 'Shift acceptance decline percentage' })
  shiftAcceptanceDecline: number;

  @ApiProperty({ description: 'Swap request increase percentage' })
  swapRequestIncrease: number;

  @ApiProperty({ description: 'Number of drop requests in last 30 days' })
  dropRequestsLast30Days: number;

  @ApiProperty({ description: 'Hours worked decline percentage' })
  hoursWorkedDecline: number;

  @ApiProperty({ description: 'Number of attendance issues in last 30 days' })
  attendanceIssuesLast30Days: number;

  @ApiProperty({ description: 'Days since last shift' })
  daysSinceLastShift: number;
}

/**
 * Churn risk assessment DTO
 */
export class ChurnRiskDto {
  @ApiProperty({ description: 'Worker profile ID' })
  workerProfileId: string;

  @ApiProperty({ description: 'Risk score (0-100)' })
  riskScore: number;

  @ApiProperty({ description: 'Risk level' })
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({ description: 'Churn indicators', type: ChurnIndicatorsDto })
  indicators: ChurnIndicatorsDto;

  @ApiProperty({ description: 'Predicted days until departure' })
  predictedRetentionDays: number;

  @ApiProperty({ description: 'Confidence in prediction (0-100)' })
  confidence: number;
}

// ==================== Export DTOs ====================

/**
 * Export format enum
 */
export enum ExportFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL',
  CSV = 'CSV',
  JSON = 'JSON',
}

/**
 * Export report query DTO
 */
export class ExportReportQueryDto extends DateRangeQueryDto {
  @ApiProperty({
    description: 'Export format',
    enum: ExportFormat,
    example: 'PDF',
  })
  @IsEnum(ExportFormat)
  format: ExportFormat;
}

// ==================== Comparison DTOs ====================

/**
 * Restaurant comparison query DTO
 */
export class ComparisonQueryDto {
  @ApiProperty({
    description: 'Primary restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Restaurant ID to compare against',
    example: 'uuid-of-other-restaurant',
  })
  @IsOptional()
  @IsUUID()
  compareToId?: string;
}

/**
 * Comparison metric DTO
 */
export class ComparisonMetricDto {
  @ApiProperty({ description: 'Metric name' })
  metric: string;

  @ApiProperty({ description: 'Absolute difference' })
  difference: number;

  @ApiProperty({ description: 'Percentage difference' })
  percentDifference: number;

  @ApiPropertyOptional({ description: 'Which restaurant is better' })
  winner?: string;
}

/**
 * Restaurant comparison response DTO
 */
export class RestaurantComparisonDto {
  @ApiProperty({ description: 'First restaurant data' })
  restaurant1: {
    id: string;
    name: string;
    metrics: Record<string, number>;
  };

  @ApiPropertyOptional({ description: 'Second restaurant data' })
  restaurant2?: {
    id: string;
    name: string;
    metrics: Record<string, number>;
  };

  @ApiProperty({ description: 'Metric differences', type: [ComparisonMetricDto] })
  differences: ComparisonMetricDto[];

  @ApiProperty({ description: 'Comparison insights', type: [String] })
  insights: string[];
}
