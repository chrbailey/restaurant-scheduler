import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { OtpService } from './otp.service';
import { nanoid } from 'nanoid';
import * as bcrypt from 'bcrypt';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import {
  RequestOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  RegisterUserDto,
  AuthResponseDto,
  LogoutDto,
} from '../dto/auth.dto';

export interface JwtPayload {
  sub: string; // User ID
  phone: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication Service
 *
 * Handles phone-based OTP authentication with device binding.
 * JWT access tokens are short-lived (15 min), refresh tokens last 7 days.
 *
 * Security:
 * - Refresh tokens are hashed in database
 * - Device binding prevents token theft
 * - Suspicious activity triggers re-auth
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Request OTP for phone number
   */
  async requestOtp(dto: RequestOtpDto): Promise<{ success: boolean; isNewUser: boolean }> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    // Send OTP
    await this.otpService.sendOtp(normalizedPhone);

    return {
      success: true,
      isNewUser: !existingUser,
    };
  }

  /**
   * Verify OTP and authenticate user
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponseDto> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Verify OTP
    const isValid = await this.otpService.verifyOtp(normalizedPhone, dto.code);

    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    // Get or create user
    let user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      // Create new user (minimal info - they'll complete profile later)
      user = await this.prisma.user.create({
        data: {
          phone: normalizedPhone,
          phoneVerified: true,
          firstName: '',
          lastName: '',
        },
      });
      this.logger.log(`New user created: ${user.id}`);
    } else {
      // Update phone verified and last login
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerified: true,
          lastLoginAt: new Date(),
        },
      });
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, normalizedPhone, dto.deviceId, dto.deviceName);

    // Cache user session
    await this.redis.cacheUserSession(user.id, {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email || undefined,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl || undefined,
        phoneVerified: user.phoneVerified,
        locale: user.locale,
        timezone: user.timezone,
      },
    };
  }

  /**
   * Register a new user with profile info
   */
  async registerUser(dto: RegisterUserDto): Promise<void> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingUser && existingUser.firstName) {
      throw new ConflictException('User already registered');
    }

    if (existingUser) {
      // Update existing user with profile info
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          timezone: dto.timezone || 'America/New_York',
        },
      });
    } else {
      // Create new user
      await this.prisma.user.create({
        data: {
          phone: normalizedPhone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          timezone: dto.timezone || 'America/New_York',
          phoneVerified: false,
        },
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    // Hash the token to find it in database
    const tokenHash = await bcrypt.hash(dto.refreshToken, 10);

    // Find refresh token with device binding
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        deviceId: dto.deviceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Verify token matches
    const isValid = await bcrypt.compare(dto.refreshToken, storedToken.token);
    if (!isValid) {
      // Possible token theft - revoke all tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { revokedAt: new Date() },
      });

      this.logger.warn(`Possible token theft detected for user ${storedToken.userId}`);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old token (token rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.phone,
      dto.deviceId,
      storedToken.deviceName || undefined,
    );

    return {
      ...tokens,
      user: {
        id: storedToken.user.id,
        phone: storedToken.user.phone,
        email: storedToken.user.email || undefined,
        firstName: storedToken.user.firstName,
        lastName: storedToken.user.lastName,
        avatarUrl: storedToken.user.avatarUrl || undefined,
        phoneVerified: storedToken.user.phoneVerified,
        locale: storedToken.user.locale,
        timezone: storedToken.user.timezone,
      },
    };
  }

  /**
   * Logout - revoke refresh token(s)
   */
  async logout(userId: string, dto: LogoutDto): Promise<void> {
    if (dto.allDevices) {
      // Revoke all tokens
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await this.redis.invalidateUserSession(userId);
      this.logger.log(`All sessions revoked for user ${userId}`);
    } else {
      // Revoke single token
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          token: { contains: dto.refreshToken.slice(-10) }, // Partial match for hashed tokens
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
  }

  /**
   * Update FCM token for push notifications
   */
  async updateFcmToken(userId: string, token: string, deviceId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Add token if not already present
    const tokens = user.fcmTokens || [];
    if (!tokens.includes(token)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          fcmTokens: [...tokens, token],
        },
      });
    }
  }

  /**
   * Validate JWT payload and return user
   */
  async validateJwt(payload: JwtPayload): Promise<any> {
    // Try cache first
    const cached = await this.redis.getUserSession(payload.sub);
    if (cached) {
      return cached;
    }

    // Fall back to database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        platformRole: true,
        timezone: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Cache for future requests
    await this.redis.cacheUserSession(user.id, user);

    return user;
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    phone: string,
    deviceId: string,
    deviceName?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
    const accessExpiry = this.configService.get<string>('auth.jwt.accessTokenExpiry', '15m');
    const refreshExpiry = this.configService.get<string>('auth.jwt.refreshTokenExpiry', '7d');

    // Generate access token
    const payload: JwtPayload = { sub: userId, phone };
    const accessToken = this.jwtService.sign(payload);

    // Calculate expiry times
    const accessExpiresAt = new Date(Date.now() + this.parseExpiry(accessExpiry));
    const refreshExpiresAt = new Date(Date.now() + this.parseExpiry(refreshExpiry));

    // Generate and hash refresh token
    const refreshToken = nanoid(64);
    const hashedRefresh = await bcrypt.hash(refreshToken, 10);

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: hashedRefresh,
        deviceId,
        deviceName,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresAt: accessExpiresAt.toISOString(),
    };
  }

  /**
   * Parse expiry string to milliseconds
   */
  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 15 * 60 * 1000;
    }
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhone(phone: string): string {
    const parsed = parsePhoneNumberFromString(phone, 'US');
    if (!parsed || !parsed.isValid()) {
      throw new UnauthorizedException('Invalid phone number');
    }
    return parsed.format('E.164');
  }
}
