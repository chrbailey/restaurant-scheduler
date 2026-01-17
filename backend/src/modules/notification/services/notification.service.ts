import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import * as admin from 'firebase-admin';
import {
  NotificationType,
  NotificationUrgency,
  NotificationChannel,
  NOTIFICATION_CONFIG,
} from '@restaurant-scheduler/shared';

/**
 * Notification Service
 *
 * Multi-channel notification delivery with fatigue prevention:
 * - Push via Firebase Cloud Messaging
 * - SMS via Twilio (for critical alerts)
 * - Quiet hours respect (configurable per user)
 * - Rate limiting to prevent notification spam
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const serviceAccountPath = this.configService.get<string>(
      'notification.firebase.serviceAccountPath',
    );

    if (serviceAccountPath && !admin.apps.length) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.firebaseInitialized = true;
        this.logger.log('Firebase Admin initialized');
      } catch (error) {
        this.logger.warn('Firebase Admin not initialized: ' + error.message);
      }
    }
  }

  /**
   * Send a notification to a user
   */
  async send(
    userId: string,
    type: NotificationType,
    data: Record<string, string>,
  ) {
    const config = NOTIFICATION_CONFIG[type];
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPrefs: true },
    });

    if (!user) {
      this.logger.warn(`User not found: ${userId}`);
      return;
    }

    // Check notification preferences
    const prefs = user.notificationPrefs;
    if (prefs) {
      const typePrefs = (prefs.typePreferences as any)?.[type];
      if (typePrefs?.enabled === false) {
        this.logger.debug(`Notification disabled for type: ${type}`);
        return;
      }
    }

    // Check quiet hours (unless critical)
    if (
      config.urgency !== NotificationUrgency.CRITICAL &&
      config.urgency !== NotificationUrgency.HIGH &&
      prefs?.quietHoursEnabled
    ) {
      if (this.isQuietHours(user.timezone, prefs.quietHoursStart, prefs.quietHoursEnd)) {
        if (config.urgency === NotificationUrgency.LOW && prefs.batchLowUrgency) {
          // Queue for batching
          await this.queueForBatch(userId, type, data);
          return;
        }
        this.logger.debug(`Skipping notification during quiet hours: ${type}`);
        return;
      }
    }

    // Check rate limiting
    if (prefs?.maxPerHour) {
      const isAllowed = await this.redis.checkRateLimit(
        `notif:rate:${userId}`,
        prefs.maxPerHour,
        3600,
      );
      if (!isAllowed) {
        this.logger.warn(`Rate limit exceeded for user: ${userId}`);
        return;
      }
    }

    // Check deduplication
    const entityId = data.shiftId || data.swapId || data.claimId || 'general';
    const alreadySent = await this.redis.wasNotificationSent(userId, type, entityId);
    if (alreadySent) {
      this.logger.debug(`Duplicate notification prevented: ${type}/${entityId}`);
      return;
    }

    // Interpolate templates
    const title = this.interpolate(config.titleTemplate, data);
    const body = this.interpolate(config.bodyTemplate, data);

    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        urgency: config.urgency,
        title,
        body,
        data,
      },
    });

    // Send via configured channels
    const channels = prefs
      ? (prefs.typePreferences as any)?.[type]?.channels || config.channels
      : config.channels;

    for (const channel of channels) {
      await this.deliver(notification.id, userId, channel, title, body, data);
    }

    // Mark as sent for deduplication
    await this.redis.markNotificationSent(userId, type, entityId);

    return notification;
  }

  /**
   * Deliver notification via specific channel
   */
  private async deliver(
    notificationId: string,
    userId: string,
    channel: NotificationChannel,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    try {
      switch (channel) {
        case NotificationChannel.PUSH:
          await this.sendPush(userId, title, body, data);
          break;
        case NotificationChannel.SMS:
          await this.sendSms(userId, body);
          break;
        case NotificationChannel.EMAIL:
          await this.sendEmail(userId, title, body);
          break;
      }

      await this.prisma.notificationDelivery.create({
        data: {
          notificationId,
          channel,
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to deliver notification: ${error.message}`);
      await this.prisma.notificationDelivery.create({
        data: {
          notificationId,
          channel,
          status: 'FAILED',
          error: error.message,
        },
      });
    }
  }

  /**
   * Send push notification via FCM
   */
  private async sendPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    if (!this.firebaseInitialized) {
      this.logger.warn('Firebase not initialized, skipping push');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmTokens: true },
    });

    if (!user?.fcmTokens?.length) {
      this.logger.debug(`No FCM tokens for user: ${userId}`);
      return;
    }

    const message = {
      notification: { title, body },
      data,
      tokens: user.fcmTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Remove invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(user.fcmTokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            fcmTokens: user.fcmTokens.filter((t) => !invalidTokens.includes(t)),
          },
        });
      }
    }

    this.logger.debug(`Push sent to ${userId}: ${response.successCount} success`);
  }

  /**
   * Send SMS (stub - implement with Twilio)
   */
  private async sendSms(userId: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user?.phone) {
      return;
    }

    // TODO: Implement Twilio SMS sending
    this.logger.debug(`SMS would be sent to ${user.phone}: ${body}`);
  }

  /**
   * Send email (stub - implement with SendGrid or similar)
   */
  private async sendEmail(userId: string, subject: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      return;
    }

    // TODO: Implement email sending
    this.logger.debug(`Email would be sent to ${user.email}: ${subject}`);
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly && { read: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  /**
   * Queue notification for batching
   */
  private async queueForBatch(
    userId: string,
    type: NotificationType,
    data: Record<string, string>,
  ) {
    const key = `notif:batch:${userId}`;
    const existing = (await this.redis.getJson<any[]>(key)) || [];
    existing.push({ type, data, timestamp: Date.now() });
    await this.redis.setJson(key, existing, 3600); // 1 hour TTL
  }

  /**
   * Check if current time is in quiet hours
   */
  private isQuietHours(timezone: string, start: string, end: string): boolean {
    try {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
      };
      const currentTime = new Intl.DateTimeFormat('en-US', options).format(now);

      // Simple string comparison (assumes HH:MM format)
      if (start < end) {
        // Same day range (e.g., 09:00 - 17:00)
        return currentTime >= start && currentTime < end;
      } else {
        // Overnight range (e.g., 23:00 - 07:00)
        return currentTime >= start || currentTime < end;
      }
    } catch {
      return false;
    }
  }

  /**
   * Interpolate template variables
   */
  private interpolate(template: string, data: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  }
}
