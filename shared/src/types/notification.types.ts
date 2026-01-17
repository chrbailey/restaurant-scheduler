/**
 * Notification Strategy
 *
 * | Event                   | Urgency  | Channels      | Quiet Hours |
 * |-------------------------|----------|---------------|-------------|
 * | Shift starting (2h)     | High     | Push, SMS     | Override    |
 * | Shift offer received    | High     | Push          | Respect     |
 * | Swap request            | Normal   | Push          | Respect     |
 * | Shift available         | Low      | Push          | Batch       |
 * | Coverage urgent (mgr)   | Critical | Push, SMS     | Override    |
 * | No-show alert (mgr)     | Critical | Push, SMS     | Override    |
 */

export enum NotificationUrgency {
  CRITICAL = 'CRITICAL', // Override quiet hours
  HIGH = 'HIGH', // Override quiet hours
  NORMAL = 'NORMAL', // Respect quiet hours
  LOW = 'LOW', // Can be batched
}

export enum NotificationChannel {
  PUSH = 'PUSH',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
}

export enum NotificationType {
  // Worker notifications
  SHIFT_ASSIGNED = 'SHIFT_ASSIGNED',
  SHIFT_REMINDER = 'SHIFT_REMINDER',
  SHIFT_STARTING_SOON = 'SHIFT_STARTING_SOON',
  SHIFT_OFFER_RECEIVED = 'SHIFT_OFFER_RECEIVED',
  SHIFT_AVAILABLE = 'SHIFT_AVAILABLE',
  SWAP_REQUEST_RECEIVED = 'SWAP_REQUEST_RECEIVED',
  SWAP_REQUEST_APPROVED = 'SWAP_REQUEST_APPROVED',
  SWAP_REQUEST_REJECTED = 'SWAP_REQUEST_REJECTED',
  CLAIM_APPROVED = 'CLAIM_APPROVED',
  CLAIM_REJECTED = 'CLAIM_REJECTED',
  SCHEDULE_UPDATED = 'SCHEDULE_UPDATED',

  // Manager notifications
  COVERAGE_GAP_ALERT = 'COVERAGE_GAP_ALERT',
  COVERAGE_CRITICAL = 'COVERAGE_CRITICAL',
  NO_SHOW_ALERT = 'NO_SHOW_ALERT',
  SWAP_PENDING_APPROVAL = 'SWAP_PENDING_APPROVAL',
  CLAIM_PENDING_APPROVAL = 'CLAIM_PENDING_APPROVAL',
  TIME_OFF_REQUEST = 'TIME_OFF_REQUEST',

  // Ghost kitchen notifications
  GHOST_MODE_ACTIVATED = 'GHOST_MODE_ACTIVATED',
  GHOST_MODE_DEACTIVATED = 'GHOST_MODE_DEACTIVATED',
  ORDER_SURGE_ALERT = 'ORDER_SURGE_ALERT',
  CAPACITY_WARNING = 'CAPACITY_WARNING',
  GHOST_KITCHEN_OPPORTUNITY = 'GHOST_KITCHEN_OPPORTUNITY',

  // Shift pool notifications
  SWAP_ACCEPTED = 'SWAP_ACCEPTED',
  SWAP_REJECTED = 'SWAP_REJECTED',
  SWAP_COMPLETED = 'SWAP_COMPLETED',
  SWAP_EXPIRED = 'SWAP_EXPIRED',
  SWAP_REQUEST = 'SWAP_REQUEST',
  SWAP_CANCELLED = 'SWAP_CANCELLED',
  SWAP_APPROVED = 'SWAP_APPROVED',
  OFFER_ACCEPTED = 'OFFER_ACCEPTED',
  OFFER_EXPIRED = 'OFFER_EXPIRED',
}

/** Notification configuration per type */
export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  {
    urgency: NotificationUrgency;
    channels: NotificationChannel[];
    titleTemplate: string;
    bodyTemplate: string;
  }
> = {
  [NotificationType.SHIFT_ASSIGNED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Shift Assigned',
    bodyTemplate: 'You have been assigned a {{position}} shift on {{date}} at {{time}}',
  },
  [NotificationType.SHIFT_REMINDER]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Shift Reminder',
    bodyTemplate: 'Your {{position}} shift starts tomorrow at {{time}}',
  },
  [NotificationType.SHIFT_STARTING_SOON]: {
    urgency: NotificationUrgency.CRITICAL,
    channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
    titleTemplate: 'Shift Starting Soon',
    bodyTemplate: 'Your shift at {{restaurant}} starts in {{minutesUntil}} minutes',
  },
  [NotificationType.SHIFT_OFFER_RECEIVED]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Shift Offer',
    bodyTemplate: '{{restaurant}} is offering you a {{position}} shift on {{date}}',
  },
  [NotificationType.SHIFT_AVAILABLE]: {
    urgency: NotificationUrgency.LOW,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Shift Available',
    bodyTemplate: '{{count}} new {{position}} shifts available at {{restaurant}}',
  },
  [NotificationType.SWAP_REQUEST_RECEIVED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Request',
    bodyTemplate: '{{workerName}} wants to swap shifts with you',
  },
  [NotificationType.SWAP_REQUEST_APPROVED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Approved',
    bodyTemplate: 'Your shift swap has been approved',
  },
  [NotificationType.SWAP_REQUEST_REJECTED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Rejected',
    bodyTemplate: 'Your shift swap request was not approved',
  },
  [NotificationType.CLAIM_APPROVED]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Shift Confirmed',
    bodyTemplate: 'Your claim for {{position}} on {{date}} has been approved',
  },
  [NotificationType.CLAIM_REJECTED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Claim Not Approved',
    bodyTemplate: 'Your shift claim was not approved: {{reason}}',
  },
  [NotificationType.SCHEDULE_UPDATED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Schedule Updated',
    bodyTemplate: 'Your schedule for {{weekOf}} has been updated',
  },

  // Manager notifications
  [NotificationType.COVERAGE_GAP_ALERT]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Coverage Gap',
    bodyTemplate: '{{position}} shift on {{date}} needs coverage',
  },
  [NotificationType.COVERAGE_CRITICAL]: {
    urgency: NotificationUrgency.CRITICAL,
    channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
    titleTemplate: 'URGENT: Coverage Needed',
    bodyTemplate: '{{shiftCount}} shifts need coverage within {{hours}} hours',
  },
  [NotificationType.NO_SHOW_ALERT]: {
    urgency: NotificationUrgency.CRITICAL,
    channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
    titleTemplate: 'No-Show Alert',
    bodyTemplate: '{{workerName}} has not checked in for their {{position}} shift',
  },
  [NotificationType.SWAP_PENDING_APPROVAL]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Needs Approval',
    bodyTemplate: 'A shift swap between {{worker1}} and {{worker2}} needs your approval',
  },
  [NotificationType.CLAIM_PENDING_APPROVAL]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Claim Needs Approval',
    bodyTemplate: '{{workerName}} wants to claim the {{position}} shift on {{date}}',
  },
  [NotificationType.TIME_OFF_REQUEST]: {
    urgency: NotificationUrgency.LOW,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Time Off Request',
    bodyTemplate: '{{workerName}} requested time off from {{startDate}} to {{endDate}}',
  },

  // Ghost kitchen notifications
  [NotificationType.GHOST_MODE_ACTIVATED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Ghost Mode Active',
    bodyTemplate: 'Ghost kitchen mode has been enabled until {{endTime}}',
  },
  [NotificationType.GHOST_MODE_DEACTIVATED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Ghost Mode Ended',
    bodyTemplate: 'Ghost kitchen mode has been disabled',
  },
  [NotificationType.ORDER_SURGE_ALERT]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Order Surge',
    bodyTemplate: 'Order volume is {{percent}}% above normal. Consider additional staff.',
  },
  [NotificationType.CAPACITY_WARNING]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Capacity Warning',
    bodyTemplate: 'Kitchen at {{percent}}% capacity. Orders may be throttled.',
  },
  [NotificationType.GHOST_KITCHEN_OPPORTUNITY]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Ghost Kitchen Opportunity',
    bodyTemplate: 'Opportunity detected for {{date}} at {{time}}. Potential revenue: {{potentialRevenue}}',
  },
  [NotificationType.SWAP_ACCEPTED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Accepted',
    bodyTemplate: '{{workerName}} has accepted your shift swap request',
  },
  [NotificationType.SWAP_REJECTED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Rejected',
    bodyTemplate: '{{workerName}} has declined your shift swap request',
  },
  [NotificationType.SWAP_COMPLETED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Completed',
    bodyTemplate: 'Your shift swap has been completed successfully',
  },
  [NotificationType.OFFER_ACCEPTED]: {
    urgency: NotificationUrgency.HIGH,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Offer Accepted',
    bodyTemplate: '{{workerName}} has accepted your shift offer for {{position}} on {{date}}',
  },
  [NotificationType.OFFER_EXPIRED]: {
    urgency: NotificationUrgency.LOW,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Offer Expired',
    bodyTemplate: 'Your shift offer for {{position}} on {{date}} has expired',
  },
  [NotificationType.SWAP_EXPIRED]: {
    urgency: NotificationUrgency.LOW,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Request Expired',
    bodyTemplate: 'Your shift swap request has expired',
  },
  [NotificationType.SWAP_REQUEST]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Request',
    bodyTemplate: '{{workerName}} has requested to swap shifts with you',
  },
  [NotificationType.SWAP_CANCELLED]: {
    urgency: NotificationUrgency.LOW,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Cancelled',
    bodyTemplate: 'The shift swap request has been cancelled',
  },
  [NotificationType.SWAP_APPROVED]: {
    urgency: NotificationUrgency.NORMAL,
    channels: [NotificationChannel.PUSH],
    titleTemplate: 'Swap Approved',
    bodyTemplate: 'Your shift swap has been approved',
  },
};

/** Notification record stored in database */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  urgency: NotificationUrgency;

  title: string;
  body: string;

  /** Related entity IDs for deep linking */
  data: {
    shiftId?: string;
    swapId?: string;
    restaurantId?: string;
    workerId?: string;
    [key: string]: string | undefined;
  };

  /** Delivery status per channel */
  deliveryStatus: {
    channel: NotificationChannel;
    status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
    sentAt?: string;
    deliveredAt?: string;
    error?: string;
  }[];

  /** Has user seen this notification */
  read: boolean;
  readAt: string | null;

  createdAt: string;
}

/** User notification preferences */
export interface NotificationPreferences {
  userId: string;

  /** Quiet hours (no non-critical notifications) */
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:MM
  quietHoursEnd: string; // HH:MM

  /** Max notifications per hour (0 = unlimited) */
  maxPerHour: number;

  /** Batch low-urgency notifications */
  batchLowUrgency: boolean;

  /** Per-type preferences */
  typePreferences: {
    [K in NotificationType]?: {
      enabled: boolean;
      channels: NotificationChannel[];
    };
  };

  /** Only notify for these positions (empty = all) */
  positionFilter: string[];

  /** Maximum distance in miles for shift notifications */
  maxDistanceMiles: number | null;
}
