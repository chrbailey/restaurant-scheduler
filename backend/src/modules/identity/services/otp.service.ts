import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/redis/redis.service';
import { Twilio } from 'twilio';
import { nanoid } from 'nanoid';

/**
 * OTP Service for phone-based authentication
 *
 * Uses Twilio Verify for production OTP delivery.
 * In development, OTPs are logged and can be retrieved via Redis.
 *
 * Security features:
 * - Rate limiting per phone number
 * - Attempt limiting with lockout
 * - Short expiry (5 minutes default)
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly twilioClient: Twilio | null = null;
  private readonly verifyServiceSid: string | undefined;
  private readonly isDevelopment: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';

    const accountSid = this.configService.get<string>('auth.twilio.accountSid');
    const authToken = this.configService.get<string>('auth.twilio.authToken');
    this.verifyServiceSid = this.configService.get<string>('auth.twilio.verifyServiceSid');

    if (accountSid && authToken && !this.isDevelopment) {
      this.twilioClient = new Twilio(accountSid, authToken);
      this.logger.log('Twilio client initialized for OTP delivery');
    } else {
      this.logger.warn('Twilio not configured - OTPs will be logged to console');
    }
  }

  /**
   * Send OTP to phone number
   */
  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    // Rate limit: max 3 OTPs per phone per 10 minutes
    const rateLimitKey = `otp:ratelimit:${phone}`;
    const isAllowed = await this.redisService.checkRateLimit(rateLimitKey, 3, 600);

    if (!isAllowed) {
      throw new HttpException('Too many OTP requests. Please wait before trying again.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Check if locked out due to too many failed attempts
    const lockoutKey = `otp:lockout:${phone}`;
    const isLockedOut = await this.redisService.exists(lockoutKey);

    if (isLockedOut) {
      throw new HttpException(
        'Account temporarily locked due to too many failed attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otpLength = this.configService.get<number>('auth.otp.length', 6);
    const expirySeconds = this.configService.get<number>('auth.otp.expirySeconds', 300);

    // Generate OTP
    const code = this.generateOtp(otpLength);

    // Store OTP in Redis
    await this.redisService.storeOtp(phone, code, expirySeconds);

    // Send via Twilio or log in development
    if (this.twilioClient && this.verifyServiceSid && !this.isDevelopment) {
      try {
        await this.twilioClient.verify.v2
          .services(this.verifyServiceSid)
          .verifications.create({ to: phone, channel: 'sms' });

        this.logger.log(`OTP sent to ${this.maskPhone(phone)}`);
      } catch (error) {
        this.logger.error(`Failed to send OTP: ${error.message}`);
        throw new BadRequestException('Failed to send verification code. Please try again.');
      }
    } else {
      // Development mode - log the OTP
      this.logger.warn(`[DEV] OTP for ${phone}: ${code}`);
      console.log(`\n📱 OTP Code for ${phone}: ${code}\n`);
    }

    return {
      success: true,
      message: 'Verification code sent',
    };
  }

  /**
   * Verify OTP code
   */
  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const maxAttempts = this.configService.get<number>('auth.otp.maxAttempts', 5);
    const lockoutSeconds = this.configService.get<number>('auth.otp.lockoutSeconds', 900);

    // Get stored OTP
    const storedData = await this.redisService.getOtp(phone);

    if (!storedData) {
      this.logger.warn(`OTP not found or expired for ${this.maskPhone(phone)}`);
      return false;
    }

    // Check attempts
    if (storedData.attempts >= maxAttempts) {
      // Lock out the account
      await this.redisService.set(`otp:lockout:${phone}`, '1', lockoutSeconds);
      await this.redisService.deleteOtp(phone);

      this.logger.warn(`Account locked due to too many OTP attempts: ${this.maskPhone(phone)}`);
      throw new HttpException(
        'Too many failed attempts. Account temporarily locked.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Verify code
    const isValid = this.isDevelopment
      ? storedData.code === code
      : await this.verifyWithTwilio(phone, code);

    if (!isValid) {
      // Increment attempts
      await this.redisService.incrementOtpAttempts(phone);
      this.logger.warn(`Invalid OTP attempt for ${this.maskPhone(phone)}`);
      return false;
    }

    // Success - delete OTP
    await this.redisService.deleteOtp(phone);
    this.logger.log(`OTP verified for ${this.maskPhone(phone)}`);

    return true;
  }

  /**
   * Verify OTP via Twilio Verify API
   */
  private async verifyWithTwilio(phone: string, code: string): Promise<boolean> {
    if (!this.twilioClient || !this.verifyServiceSid) {
      return false;
    }

    try {
      const verification = await this.twilioClient.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks.create({ to: phone, code });

      return verification.status === 'approved';
    } catch (error) {
      this.logger.error(`Twilio verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate numeric OTP code
   */
  private generateOtp(length: number): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
  }

  /**
   * Mask phone number for logging
   */
  private maskPhone(phone: string): string {
    if (phone.length < 6) return '***';
    return phone.slice(0, 3) + '***' + phone.slice(-2);
  }
}
