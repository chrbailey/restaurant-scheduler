import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  RequestOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  RegisterUserDto,
  AuthResponseDto,
  UpdateFcmTokenDto,
  LogoutDto,
} from '../dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP',
    description: 'Sends a one-time password to the provided phone number',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP',
    description: 'Verifies the OTP and returns authentication tokens',
  })
  @ApiResponse({ status: 200, description: 'Authentication successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 429, description: 'Too many failed attempts' })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthResponseDto> {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register user',
    description: 'Registers a new user with profile information',
  })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User already registered' })
  async register(@Body() dto: RegisterUserDto) {
    await this.authService.registerUser(dto);
    return { success: true, message: 'User registered. Please verify your phone.' };
  }

  @Public()
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh token',
    description: 'Exchanges a refresh token for new access and refresh tokens',
  })
  @ApiResponse({ status: 200, description: 'Tokens refreshed', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update FCM token',
    description: 'Registers or updates the FCM token for push notifications',
  })
  @ApiResponse({ status: 200, description: 'FCM token updated' })
  async updateFcmToken(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateFcmTokenDto,
  ) {
    await this.authService.updateFcmToken(userId, dto.token, dto.deviceId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout',
    description: 'Revokes the refresh token and optionally all sessions',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @CurrentUser('id') userId: string,
    @Body() dto: LogoutDto,
  ) {
    await this.authService.logout(userId, dto);
    return { success: true };
  }
}
