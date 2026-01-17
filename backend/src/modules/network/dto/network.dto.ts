import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole, MembershipStatus } from '../entities/network-membership.entity';

/**
 * Network Settings DTO
 */
export class NetworkSettingsDto {
  @ApiPropertyOptional({
    description: 'Enable shift sharing across network restaurants',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  shiftSharingEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum reliability score for auto-approval',
    default: 4.0,
    minimum: 1.0,
    maximum: 5.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(5.0)
  autoApproveThreshold?: number;

  @ApiPropertyOptional({
    description: 'Hours before shifts become visible to network workers',
    default: 2,
    minimum: 0,
    maximum: 168,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(168)
  visibilityDelayHours?: number;

  @ApiPropertyOptional({
    description: 'Maximum distance (miles) for network shift visibility',
    default: 25,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxDistanceMiles?: number;

  @ApiPropertyOptional({
    description: 'Require cross-training certification for network shifts',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  requireCrossTraining?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum number of shifts completed at home restaurant',
    default: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minHomeShifts?: number;
}

/**
 * Create Network DTO
 */
export class CreateNetworkDto {
  @ApiProperty({
    description: 'Network name',
    example: 'Downtown Restaurant Group',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Network description',
    example: 'A group of restaurants in the downtown area sharing staff resources',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Network settings',
    type: NetworkSettingsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NetworkSettingsDto)
  settings?: NetworkSettingsDto;
}

/**
 * Update Network DTO
 */
export class UpdateNetworkDto {
  @ApiPropertyOptional({
    description: 'Network name',
    example: 'Downtown Restaurant Group',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Network description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Network settings',
    type: NetworkSettingsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NetworkSettingsDto)
  settings?: NetworkSettingsDto;
}

/**
 * Invite Restaurant DTO
 */
export class InviteRestaurantDto {
  @ApiProperty({
    description: 'ID of the restaurant to invite',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Role to assign to the invited restaurant',
    enum: MembershipRole,
    default: MembershipRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @ApiPropertyOptional({
    description: 'Optional message to include with invitation',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

/**
 * Respond to Invitation DTO
 */
export class RespondInvitationDto {
  @ApiProperty({
    description: 'Whether to accept or decline the invitation',
  })
  @IsBoolean()
  accept: boolean;

  @ApiPropertyOptional({
    description: 'Optional message with the response',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

/**
 * Update Membership DTO
 */
export class UpdateMembershipDto {
  @ApiPropertyOptional({
    description: 'New role for the member',
    enum: MembershipRole,
  })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @ApiPropertyOptional({
    description: 'New status for the member',
    enum: MembershipStatus,
  })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

/**
 * Network Response DTO
 */
export class NetworkResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  settings: NetworkSettingsDto;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * Network Membership Response DTO
 */
export class MembershipResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  networkId: string;

  @ApiProperty()
  restaurantId: string;

  @ApiProperty({ enum: MembershipRole })
  role: MembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status: MembershipStatus;

  @ApiProperty()
  joinedAt: Date;

  @ApiPropertyOptional()
  restaurant?: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
}
