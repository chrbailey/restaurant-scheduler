import { IsString, IsPhoneNumber, Length, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+14155551234',
  })
  @IsPhoneNumber()
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+14155551234',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    description: 'Unique device identifier for token binding',
    example: 'device-uuid-12345',
  })
  @IsString()
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Human-readable device name',
    example: 'iPhone 15 Pro',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token from previous authentication',
  })
  @IsString()
  refreshToken: string;

  @ApiProperty({
    description: 'Device ID that was used during original authentication',
  })
  @IsString()
  deviceId: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({
    description: 'Access token expiration time (ISO 8601)',
  })
  expiresAt: string;

  @ApiProperty()
  user: UserResponseDto;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty()
  phoneVerified: boolean;

  @ApiProperty()
  locale: string;

  @ApiProperty()
  timezone: string;
}

export class RegisterUserDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+14155551234',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    example: 'John',
  })
  @IsString()
  firstName: string;

  @ApiProperty({
    example: 'Doe',
  })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateFcmTokenDto {
  @ApiProperty({
    description: 'FCM registration token for push notifications',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'Device identifier',
  })
  @IsString()
  deviceId: string;
}

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token to revoke',
  })
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({
    description: 'If true, revokes all refresh tokens for this user',
    default: false,
  })
  @IsOptional()
  allDevices?: boolean;
}
