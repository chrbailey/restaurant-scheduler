import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryPlatform,
  SessionEndReason,
} from '../entities/ghost-kitchen-session.entity';

/**
 * Enable Ghost Mode DTO
 */
export class EnableGhostModeDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Maximum concurrent orders',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxOrders?: number;

  @ApiPropertyOptional({
    description: 'Scheduled end time (ISO 8601)',
    example: '2024-01-15T22:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Delivery platforms to enable',
    enum: DeliveryPlatform,
    isArray: true,
    example: ['DOORDASH', 'UBEREATS'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DeliveryPlatform, { each: true })
  platforms?: DeliveryPlatform[];

  @ApiPropertyOptional({
    description: 'Auto-accept incoming orders',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoAccept?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum prep time to quote (minutes)',
    example: 15,
    minimum: 5,
    maximum: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(60)
  minPrepTime?: number;

  @ApiPropertyOptional({
    description: 'Supply/packaging cost per order',
    example: 1.5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  supplyPackagingCost?: number;
}

/**
 * Disable Ghost Mode DTO
 */
export class DisableGhostModeDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Reason for disabling',
    enum: SessionEndReason,
    example: 'MANUAL',
  })
  @IsOptional()
  @IsEnum(SessionEndReason)
  reason?: SessionEndReason;
}

/**
 * Pause Ghost Mode DTO
 */
export class PauseGhostModeDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Duration to pause (minutes). If not set, pause is indefinite.',
    example: 30,
    minimum: 1,
    maximum: 480,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(480)
  duration?: number;

  @ApiPropertyOptional({
    description: 'Reason for pausing',
    example: 'Kitchen equipment maintenance',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Session History Query DTO
 */
export class SessionHistoryQueryDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Start date filter (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO 8601)',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Number of results to return',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  offset?: number;
}

/**
 * Analytics Query DTO
 */
export class AnalyticsQueryDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

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
}

/**
 * P&L Query DTO
 */
export class PnLQueryDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Session ID for single session P&L',
    example: 'uuid-of-session',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Start date for date range P&L (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for date range P&L (ISO 8601)',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * Forecast Query DTO
 */
export class ForecastQueryDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Number of days to forecast',
    example: 7,
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(30)
  days?: number;
}

/**
 * Accept/Decline Opportunity DTO
 */
export class OpportunityActionDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Notes or reason for the action',
    example: 'Accepting to capitalize on weekend demand',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
