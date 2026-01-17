import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CrossTrainingStatus } from '../entities/cross-training.entity';

/**
 * Create Cross-Training Request DTO
 */
export class CreateCrossTrainingDto {
  @ApiProperty({
    description: 'ID of the worker profile requesting cross-training',
    example: 'uuid-of-worker-profile',
  })
  @IsUUID()
  workerProfileId: string;

  @ApiProperty({
    description: 'ID of the target restaurant to be trained at',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  targetRestaurantId: string;

  @ApiProperty({
    description: 'Positions the worker wants to be certified for',
    example: ['SERVER', 'BARTENDER'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  positions: string[];

  @ApiPropertyOptional({
    description: 'Notes or reason for the cross-training request',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Approve Cross-Training DTO
 */
export class ApproveCrossTrainingDto {
  @ApiPropertyOptional({
    description: 'Positions approved for cross-training (can be subset of requested)',
    example: ['SERVER'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positions?: string[];

  @ApiPropertyOptional({
    description: 'Notes from the certifier',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Revoke Cross-Training DTO
 */
export class RevokeCrossTrainingDto {
  @ApiProperty({
    description: 'Reason for revoking the cross-training',
    example: 'Policy violation during shift',
  })
  @IsString()
  reason: string;
}

/**
 * Update Cross-Training DTO
 */
export class UpdateCrossTrainingDto {
  @ApiPropertyOptional({
    description: 'Updated positions',
    example: ['SERVER', 'HOST'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positions?: string[];

  @ApiPropertyOptional({
    description: 'Updated status',
    enum: CrossTrainingStatus,
  })
  @IsOptional()
  @IsEnum(CrossTrainingStatus)
  status?: CrossTrainingStatus;

  @ApiPropertyOptional({
    description: 'Notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Cross-Training Response DTO
 */
export class CrossTrainingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  workerProfileId: string;

  @ApiProperty()
  targetRestaurantId: string;

  @ApiProperty({ type: [String] })
  positions: string[];

  @ApiProperty({ enum: CrossTrainingStatus })
  status: CrossTrainingStatus;

  @ApiPropertyOptional()
  certifiedAt?: Date;

  @ApiPropertyOptional()
  certifiedBy?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  workerProfile?: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    };
    restaurant: {
      id: string;
      name: string;
    };
    reliabilityScore: number;
    shiftsCompleted: number;
  };

  @ApiPropertyOptional()
  targetRestaurant?: {
    id: string;
    name: string;
  };
}

/**
 * Query Cross-Training DTO
 */
export class QueryCrossTrainingDto {
  @ApiPropertyOptional({
    description: 'Filter by worker profile ID',
  })
  @IsOptional()
  @IsUUID()
  workerProfileId?: string;

  @ApiPropertyOptional({
    description: 'Filter by target restaurant ID',
  })
  @IsOptional()
  @IsUUID()
  targetRestaurantId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: CrossTrainingStatus,
  })
  @IsOptional()
  @IsEnum(CrossTrainingStatus)
  status?: CrossTrainingStatus;
}
