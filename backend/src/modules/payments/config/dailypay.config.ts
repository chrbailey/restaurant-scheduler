import { registerAs } from '@nestjs/config';

/**
 * DailyPay Configuration
 *
 * Configuration for the DailyPay earned wage access integration.
 * DailyPay provides workers with instant access to earned wages before payday.
 */
export const dailypayConfig = registerAs('dailypay', () => ({
  // API Configuration
  api: {
    baseUrl: process.env.DAILYPAY_BASE_URL || 'https://api.dailypay.com/v2',
    clientId: process.env.DAILYPAY_CLIENT_ID,
    clientSecret: process.env.DAILYPAY_CLIENT_SECRET,
    timeout: parseInt(process.env.DAILYPAY_TIMEOUT || '30000', 10),
  },

  // Webhook Configuration
  webhook: {
    secret: process.env.DAILYPAY_WEBHOOK_SECRET,
    signatureHeader: 'x-dailypay-signature',
    timestampHeader: 'x-dailypay-timestamp',
    toleranceSeconds: parseInt(process.env.DAILYPAY_WEBHOOK_TOLERANCE || '300', 10),
  },

  // Transfer Settings
  transfer: {
    // Minimum transfer amount in dollars
    minAmount: parseFloat(process.env.DAILYPAY_MIN_TRANSFER || '5'),
    // Maximum transfer per day in dollars
    maxPerDay: parseFloat(process.env.DAILYPAY_MAX_PER_DAY || '500'),
    // Maximum transfer per week in dollars
    maxPerWeek: parseFloat(process.env.DAILYPAY_MAX_PER_WEEK || '1000'),
    // Percentage of earned wages available for transfer (0-100)
    availablePercentage: parseInt(process.env.DAILYPAY_AVAILABLE_PERCENTAGE || '80', 10),
  },

  // Fee Structure
  fees: {
    // Fee type: FLAT or PERCENTAGE
    type: (process.env.DAILYPAY_FEE_TYPE || 'FLAT') as 'FLAT' | 'PERCENTAGE',
    // Flat fee amount in dollars (if type is FLAT)
    flatAmount: parseFloat(process.env.DAILYPAY_FEE_FLAT || '2.99'),
    // Percentage fee (if type is PERCENTAGE), e.g., 2.5 for 2.5%
    percentage: parseFloat(process.env.DAILYPAY_FEE_PERCENTAGE || '2.5'),
    // Minimum fee (when using percentage)
    minFee: parseFloat(process.env.DAILYPAY_FEE_MIN || '1'),
    // Maximum fee (when using percentage)
    maxFee: parseFloat(process.env.DAILYPAY_FEE_MAX || '10'),
    // Who pays the fee: WORKER or EMPLOYER
    paidBy: (process.env.DAILYPAY_FEE_PAID_BY || 'WORKER') as 'WORKER' | 'EMPLOYER',
  },

  // Enrollment Settings
  enrollment: {
    // Require bank account verification
    requireBankVerification: process.env.DAILYPAY_REQUIRE_BANK_VERIFICATION !== 'false',
    // Minimum shifts completed before eligible
    minShiftsForEligibility: parseInt(process.env.DAILYPAY_MIN_SHIFTS || '1', 10),
    // Minimum days employed before eligible
    minDaysEmployed: parseInt(process.env.DAILYPAY_MIN_DAYS_EMPLOYED || '0', 10),
  },

  // Sync Settings
  sync: {
    // How often to sync earnings (in minutes)
    intervalMinutes: parseInt(process.env.DAILYPAY_SYNC_INTERVAL || '15', 10),
    // Batch size for sync operations
    batchSize: parseInt(process.env.DAILYPAY_SYNC_BATCH_SIZE || '100', 10),
  },

  // Cache Settings
  cache: {
    balanceTtlSeconds: parseInt(process.env.DAILYPAY_BALANCE_CACHE_TTL || '60', 10),
    transferHistoryTtlSeconds: parseInt(process.env.DAILYPAY_HISTORY_CACHE_TTL || '300', 10),
  },

  // Retry Settings
  retry: {
    maxAttempts: parseInt(process.env.DAILYPAY_RETRY_MAX_ATTEMPTS || '3', 10),
    initialDelayMs: parseInt(process.env.DAILYPAY_RETRY_INITIAL_DELAY || '1000', 10),
    maxDelayMs: parseInt(process.env.DAILYPAY_RETRY_MAX_DELAY || '10000', 10),
  },
}));

/**
 * Transfer status enum
 */
export enum TransferStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Payout method enum
 */
export enum PayoutMethod {
  INSTANT = 'INSTANT',
  REGULAR = 'REGULAR',
}

/**
 * Fee type enum
 */
export enum FeeType {
  FLAT = 'FLAT',
  PERCENTAGE = 'PERCENTAGE',
}

/**
 * Fee payer enum
 */
export enum FeePayer {
  WORKER = 'WORKER',
  EMPLOYER = 'EMPLOYER',
}

/**
 * Default configuration values for reference
 */
export const DAILYPAY_DEFAULTS = {
  API_TIMEOUT_MS: 30000,
  WEBHOOK_TOLERANCE_SECONDS: 300,
  MIN_TRANSFER_AMOUNT: 5,
  MAX_TRANSFER_PER_DAY: 500,
  MAX_TRANSFER_PER_WEEK: 1000,
  AVAILABLE_PERCENTAGE: 80,
  FLAT_FEE: 2.99,
  MIN_SHIFTS_FOR_ELIGIBILITY: 1,
  SYNC_INTERVAL_MINUTES: 15,
  BALANCE_CACHE_TTL_SECONDS: 60,
  RETRY_MAX_ATTEMPTS: 3,
};
