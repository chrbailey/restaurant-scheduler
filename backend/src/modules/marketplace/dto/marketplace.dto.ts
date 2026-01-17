import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsDateString,
  ValidateNested,
  Min,
  Max,
  IsInt,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeOfferStatus } from '../entities/trade-offer.entity';
import { TradeMatchStatus } from '../entities/trade-match.entity';

/**
 * Time slot preference DTO
 */
export class TimeSlotPreferenceDto {
  @ApiPropertyOptional({ description: 'Preferred start time (HH:MM format)' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'Preferred end time (HH:MM format)' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Minimum shift duration in hours' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  minDuration?: number;

  @ApiPropertyOptional({ description: 'Maximum shift duration in hours' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  maxDuration?: number;
}

/**
 * Trade preferences DTO
 */
export class TradePreferencesDto {
  @ApiProperty({ description: 'Preferred days of week (0=Sunday, 6=Saturday)', example: [1, 2, 3, 4, 5] })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[];

  @ApiProperty({ description: 'Preferred time slots', type: [TimeSlotPreferenceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotPreferenceDto)
  timeSlots: TimeSlotPreferenceDto[];

  @ApiProperty({ description: 'Acceptable positions for trade', example: ['SERVER', 'HOST'] })
  @IsArray()
  @IsString({ each: true })
  positions: string[];

  @ApiProperty({ description: 'Whether flexible on dates', default: false })
  @IsBoolean()
  flexibleDates: boolean;

  @ApiPropertyOptional({ description: 'Preferred date range start' })
  @IsOptional()
  @IsDateString()
  preferredDateFrom?: string;

  @ApiPropertyOptional({ description: 'Preferred date range end' })
  @IsOptional()
  @IsDateString()
  preferredDateTo?: string;

  @ApiPropertyOptional({ description: 'Allow cross-restaurant trades', default: true })
  @IsOptional()
  @IsBoolean()
  allowCrossRestaurant?: boolean;

  @ApiPropertyOptional({ description: 'Maximum distance in miles for cross-restaurant', default: 25 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxDistanceMiles?: number;

  @ApiPropertyOptional({ description: 'Additional notes about preferences' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Create Trade Offer DTO
 */
export class CreateTradeOfferDto {
  @ApiProperty({ description: 'ID of the shift to offer for trade' })
  @IsUUID()
  shiftId: string;

  @ApiProperty({ description: 'Trade preferences', type: TradePreferencesDto })
  @ValidateNested()
  @Type(() => TradePreferencesDto)
  preferences: TradePreferencesDto;

  @ApiPropertyOptional({ description: 'Hours until the offer expires', default: 72 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(168) // 1 week max
  expiresInHours?: number;
}

/**
 * Search Trade Offers DTO
 */
export class SearchTradeOffersDto {
  @ApiPropertyOptional({ description: 'Filter by positions', example: ['SERVER', 'BARTENDER'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positions?: string[];

  @ApiPropertyOptional({ description: 'Filter by days of week (0=Sunday)', example: [1, 2, 3] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ description: 'Date range start' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Date range end' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Filter by restaurant ID' })
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @ApiPropertyOptional({ description: 'Include cross-restaurant offers', default: true })
  @IsOptional()
  @IsBoolean()
  includeCrossRestaurant?: boolean;

  @ApiPropertyOptional({ description: 'Maximum distance for cross-restaurant', default: 25 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxDistanceMiles?: number;

  @ApiPropertyOptional({ description: 'Filter by status', enum: TradeOfferStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TradeOfferStatus, { each: true })
  status?: TradeOfferStatus[];

  @ApiPropertyOptional({ description: 'Number of results to return', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: 'Sort by field', enum: ['createdAt', 'expiresAt', 'viewCount', 'interestCount'] })
  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'expiresAt' | 'viewCount' | 'interestCount';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

/**
 * Propose Trade DTO
 */
export class ProposeTradeDto {
  @ApiProperty({ description: 'ID of the trade offer to respond to' })
  @IsUUID()
  offerId: string;

  @ApiProperty({ description: 'ID of the shift being offered in exchange' })
  @IsUUID()
  acceptorShiftId: string;

  @ApiPropertyOptional({ description: 'Message to the offer owner' })
  @IsOptional()
  @IsString()
  message?: string;
}

/**
 * Reject Trade DTO
 */
export class RejectTradeDto {
  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Counter Offer DTO
 */
export class CounterOfferDto {
  @ApiPropertyOptional({ description: 'New shift 1 ID' })
  @IsOptional()
  @IsUUID()
  shift1Id?: string;

  @ApiPropertyOptional({ description: 'New shift 2 ID' })
  @IsOptional()
  @IsUUID()
  shift2Id?: string;

  @ApiPropertyOptional({ description: 'Compensation type', enum: ['NONE', 'CASH', 'FUTURE_FAVOR'] })
  @IsOptional()
  @IsString()
  compensationType?: 'NONE' | 'CASH' | 'FUTURE_FAVOR';

  @ApiPropertyOptional({ description: 'Compensation amount if applicable' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compensationAmount?: number;

  @ApiPropertyOptional({ description: 'Compensation description' })
  @IsOptional()
  @IsString()
  compensationDescription?: string;

  @ApiPropertyOptional({ description: 'Additional conditions' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @ApiPropertyOptional({ description: 'Proposed effective date' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiProperty({ description: 'Message explaining the counter-offer' })
  @IsString()
  message: string;
}

/**
 * Trade Offer Response DTO
 */
export class TradeOfferResponseDto {
  @ApiProperty({ description: 'Trade offer ID' })
  id: string;

  @ApiProperty({ description: 'Worker ID' })
  workerId: string;

  @ApiProperty({ description: 'Shift ID' })
  shiftId: string;

  @ApiProperty({ description: 'Offer status', enum: TradeOfferStatus })
  status: TradeOfferStatus;

  @ApiProperty({ description: 'Trade preferences' })
  preferences: TradePreferencesDto;

  @ApiProperty({ description: 'When the offer expires' })
  expiresAt: Date;

  @ApiProperty({ description: 'Number of views' })
  viewCount: number;

  @ApiProperty({ description: 'Number of interested workers' })
  interestCount: number;

  @ApiProperty({ description: 'Number of potential matches' })
  matchCount: number;

  @ApiProperty({ description: 'Worker details' })
  worker: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    reliabilityScore: number;
  };

  @ApiProperty({ description: 'Shift details' })
  shift: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    restaurantId: string;
    restaurantName: string;
  };

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt: Date;
}

/**
 * Trade Match Response DTO
 */
export class TradeMatchResponseDto {
  @ApiProperty({ description: 'Trade match ID' })
  id: string;

  @ApiProperty({ description: 'Trade offer ID' })
  offerId: string;

  @ApiProperty({ description: 'Match status', enum: TradeMatchStatus })
  status: TradeMatchStatus;

  @ApiProperty({ description: 'Compatibility score (0-100)' })
  compatibilityScore: number;

  @ApiProperty({ description: 'Offerer details' })
  offerer: {
    id: string;
    firstName: string;
    lastName: string;
    shift: {
      id: string;
      position: string;
      startTime: Date;
      endTime: Date;
      restaurantName: string;
    };
  };

  @ApiProperty({ description: 'Acceptor details' })
  acceptor: {
    id: string;
    firstName: string;
    lastName: string;
    shift: {
      id: string;
      position: string;
      startTime: Date;
      endTime: Date;
      restaurantName: string;
    };
  };

  @ApiProperty({ description: 'Whether manager approval is required' })
  requiresManagerApproval: boolean;

  @ApiProperty({ description: 'Whether manager has approved' })
  managerApproved?: boolean;

  @ApiProperty({ description: 'When proposed' })
  proposedAt: Date;

  @ApiProperty({ description: 'When expires' })
  expiresAt: Date;
}

/**
 * Negotiation Response DTO
 */
export class NegotiationResponseDto {
  @ApiProperty({ description: 'Negotiation ID' })
  id: string;

  @ApiProperty({ description: 'Current status' })
  status: string;

  @ApiProperty({ description: 'Current terms' })
  currentTerms: {
    shift1Id: string;
    shift2Id: string;
    compensation?: {
      type: string;
      amount?: number;
      description?: string;
    };
    conditions?: string[];
  };

  @ApiProperty({ description: 'Message history' })
  messages: {
    id: string;
    type: string;
    senderId?: string;
    content: string;
    sentAt: Date;
    read: boolean;
  }[];

  @ApiProperty({ description: 'Participant 1 details' })
  participant1: {
    id: string;
    firstName: string;
    lastName: string;
    shiftDetails: any;
  };

  @ApiProperty({ description: 'Participant 2 details' })
  participant2: {
    id: string;
    firstName: string;
    lastName: string;
    shiftDetails: any;
  };

  @ApiProperty({ description: 'Who needs to respond next' })
  pendingResponseFrom?: string;

  @ApiProperty({ description: 'Unread message count' })
  unreadCount: number;

  @ApiProperty({ description: 'When the negotiation expires' })
  expiresAt: Date;
}

/**
 * Recommended Trade DTO
 */
export class RecommendedTradeDto {
  @ApiProperty({ description: 'Trade offer' })
  offer: TradeOfferResponseDto;

  @ApiProperty({ description: 'Compatibility score (0-100)' })
  compatibilityScore: number;

  @ApiProperty({ description: 'Reason for recommendation' })
  reason: string;

  @ApiProperty({ description: 'Matching criteria met' })
  matchingCriteria: {
    positionMatch: boolean;
    timeSlotMatch: boolean;
    dayOfWeekMatch: boolean;
    distanceAcceptable: boolean;
    reputationSufficient: boolean;
  };

  @ApiProperty({ description: 'Your shifts that could work for this trade' })
  compatibleShifts: {
    id: string;
    position: string;
    startTime: Date;
    endTime: Date;
    compatibilityScore: number;
  }[];
}
