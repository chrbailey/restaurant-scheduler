import { registerAs } from '@nestjs/config';

/**
 * Authentication Configuration
 *
 * Uses phone-based OTP for worker authentication (no passwords to manage).
 * JWTs contain minimal claims; full permissions loaded from database.
 *
 * Device binding prevents token theft - each refresh token is tied to
 * a specific device ID, and suspicious usage patterns trigger re-auth.
 */
export const authConfig = registerAs('auth', () => ({
  jwt: {
    secret: process.env.JWT_SECRET,
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  otp: {
    /** OTP expiry in seconds */
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10),
    /** OTP length */
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
    /** Max OTP attempts before lockout */
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    /** Lockout duration in seconds */
    lockoutSeconds: parseInt(process.env.OTP_LOCKOUT_SECONDS || '900', 10),
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },

  /** Require device binding for refresh tokens */
  deviceBindingEnabled: process.env.DEVICE_BINDING_ENABLED !== 'false',

  /** Allowed email domains for manager accounts (empty = all allowed) */
  allowedEmailDomains: process.env.ALLOWED_EMAIL_DOMAINS?.split(',') || [],
}));
