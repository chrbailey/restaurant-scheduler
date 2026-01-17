import { registerAs } from '@nestjs/config';

/**
 * Notification Configuration
 *
 * Multi-channel notification delivery with fatigue prevention:
 * - Push via Firebase Cloud Messaging
 * - SMS via Twilio (for critical alerts)
 * - Quiet hours respect (configurable per user)
 * - Rate limiting to prevent notification spam
 */
export const notificationConfig = registerAs('notification', () => ({
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    /** Path to service account JSON file */
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  },

  /** Global notification settings */
  defaults: {
    /** Default max notifications per hour */
    maxPerHour: parseInt(process.env.NOTIFICATION_MAX_PER_HOUR || '20', 10),
    /** Batch delay for low-urgency notifications (ms) */
    batchDelayMs: parseInt(process.env.NOTIFICATION_BATCH_DELAY || '300000', 10), // 5 min
    /** Default quiet hours (UTC) */
    quietHoursStart: process.env.QUIET_HOURS_START || '23:00',
    quietHoursEnd: process.env.QUIET_HOURS_END || '07:00',
  },

  /** Shift reminder timing */
  reminders: {
    /** Hours before shift to send reminder */
    hoursBeforeShift: parseInt(process.env.REMINDER_HOURS_BEFORE || '24', 10),
    /** Minutes before shift for "starting soon" alert */
    minutesBeforeStart: parseInt(process.env.REMINDER_MINUTES_BEFORE || '120', 10),
  },
}));
