import { registerAs } from '@nestjs/config';

/**
 * KitchenHub Configuration
 *
 * Configuration for the KitchenHub order aggregator integration.
 * KitchenHub provides a unified API for DoorDash, UberEats, and Grubhub.
 */
export const kitchenhubConfig = registerAs('kitchenhub', () => ({
  // API Configuration
  api: {
    baseUrl: process.env.KITCHENHUB_BASE_URL || 'https://api.trykitchenhub.com/v1',
    apiKey: process.env.KITCHENHUB_API_KEY,
    apiSecret: process.env.KITCHENHUB_API_SECRET,
    timeout: parseInt(process.env.KITCHENHUB_TIMEOUT || '30000', 10),
  },

  // Webhook Configuration
  webhook: {
    secret: process.env.KITCHENHUB_WEBHOOK_SECRET,
    signatureHeader: 'x-kitchenhub-signature',
    timestampHeader: 'x-kitchenhub-timestamp',
    toleranceSeconds: parseInt(process.env.KITCHENHUB_WEBHOOK_TOLERANCE || '300', 10),
  },

  // Default Capacity Settings
  capacity: {
    defaultMaxOrders: parseInt(process.env.KITCHENHUB_DEFAULT_MAX_ORDERS || '20', 10),
    autoDisableThreshold: parseInt(process.env.KITCHENHUB_AUTO_DISABLE_THRESHOLD || '90', 10),
    warningThreshold: parseInt(process.env.KITCHENHUB_WARNING_THRESHOLD || '75', 10),
    capacityCheckIntervalMs: parseInt(process.env.KITCHENHUB_CAPACITY_CHECK_INTERVAL || '30000', 10),
  },

  // Platform-specific Settings
  platforms: {
    doordash: {
      enabled: process.env.KITCHENHUB_DOORDASH_ENABLED !== 'false',
      defaultPrepTimeMinutes: parseInt(process.env.KITCHENHUB_DOORDASH_PREP_TIME || '20', 10),
      autoAccept: process.env.KITCHENHUB_DOORDASH_AUTO_ACCEPT === 'true',
    },
    ubereats: {
      enabled: process.env.KITCHENHUB_UBEREATS_ENABLED !== 'false',
      defaultPrepTimeMinutes: parseInt(process.env.KITCHENHUB_UBEREATS_PREP_TIME || '20', 10),
      autoAccept: process.env.KITCHENHUB_UBEREATS_AUTO_ACCEPT === 'true',
    },
    grubhub: {
      enabled: process.env.KITCHENHUB_GRUBHUB_ENABLED !== 'false',
      defaultPrepTimeMinutes: parseInt(process.env.KITCHENHUB_GRUBHUB_PREP_TIME || '25', 10),
      autoAccept: process.env.KITCHENHUB_GRUBHUB_AUTO_ACCEPT === 'true',
    },
  },

  // Order Settings
  orders: {
    autoAcceptEnabled: process.env.KITCHENHUB_AUTO_ACCEPT_ENABLED === 'true',
    autoAcceptMaxTotal: parseFloat(process.env.KITCHENHUB_AUTO_ACCEPT_MAX_TOTAL || '100'),
    autoAcceptMaxItems: parseInt(process.env.KITCHENHUB_AUTO_ACCEPT_MAX_ITEMS || '10', 10),
    orderExpirationMinutes: parseInt(process.env.KITCHENHUB_ORDER_EXPIRATION || '5', 10),
  },

  // Cache Settings
  cache: {
    ordersTtlSeconds: parseInt(process.env.KITCHENHUB_ORDERS_CACHE_TTL || '60', 10),
    menuTtlSeconds: parseInt(process.env.KITCHENHUB_MENU_CACHE_TTL || '300', 10),
    capacityTtlSeconds: parseInt(process.env.KITCHENHUB_CAPACITY_CACHE_TTL || '30', 10),
  },

  // Retry Settings
  retry: {
    maxAttempts: parseInt(process.env.KITCHENHUB_RETRY_MAX_ATTEMPTS || '3', 10),
    initialDelayMs: parseInt(process.env.KITCHENHUB_RETRY_INITIAL_DELAY || '1000', 10),
    maxDelayMs: parseInt(process.env.KITCHENHUB_RETRY_MAX_DELAY || '10000', 10),
  },
}));

/**
 * Delivery platform identifiers
 */
export enum DeliveryPlatform {
  DOORDASH = 'DOORDASH',
  UBEREATS = 'UBEREATS',
  GRUBHUB = 'GRUBHUB',
}

/**
 * Default configuration values for reference
 */
export const KITCHENHUB_DEFAULTS = {
  API_TIMEOUT_MS: 30000,
  WEBHOOK_TOLERANCE_SECONDS: 300,
  DEFAULT_MAX_ORDERS: 20,
  AUTO_DISABLE_THRESHOLD: 90,
  WARNING_THRESHOLD: 75,
  DEFAULT_PREP_TIME_MINUTES: 20,
  ORDER_EXPIRATION_MINUTES: 5,
  ORDERS_CACHE_TTL_SECONDS: 60,
  MENU_CACHE_TTL_SECONDS: 300,
  RETRY_MAX_ATTEMPTS: 3,
};
