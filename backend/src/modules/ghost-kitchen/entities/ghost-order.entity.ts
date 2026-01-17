/**
 * Ghost Kitchen Order Entity
 *
 * Represents an order received from a delivery aggregator platform.
 * Tracks the full lifecycle from receipt to pickup.
 */

import { DeliveryPlatform } from '../config/kitchenhub.config';

/**
 * Order status enum
 */
export enum GhostOrderStatus {
  /** Order received from platform, pending acceptance */
  RECEIVED = 'RECEIVED',
  /** Order accepted by restaurant */
  ACCEPTED = 'ACCEPTED',
  /** Kitchen has started preparing the order */
  PREPARING = 'PREPARING',
  /** Order is ready for driver pickup */
  READY = 'READY',
  /** Driver has picked up the order */
  PICKED_UP = 'PICKED_UP',
  /** Order successfully completed (delivered) */
  COMPLETED = 'COMPLETED',
  /** Order was cancelled */
  CANCELLED = 'CANCELLED',
  /** Order was rejected by restaurant */
  REJECTED = 'REJECTED',
}

/**
 * Cancellation/rejection reason codes
 */
export enum OrderCancellationReason {
  // Customer-initiated
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  CUSTOMER_NO_SHOW = 'CUSTOMER_NO_SHOW',

  // Restaurant-initiated
  ITEM_UNAVAILABLE = 'ITEM_UNAVAILABLE',
  KITCHEN_BUSY = 'KITCHEN_BUSY',
  KITCHEN_CLOSED = 'KITCHEN_CLOSED',
  UNABLE_TO_FULFILL = 'UNABLE_TO_FULFILL',
  PREP_TIME_TOO_LONG = 'PREP_TIME_TOO_LONG',

  // Platform-initiated
  DRIVER_UNAVAILABLE = 'DRIVER_UNAVAILABLE',
  PLATFORM_CANCELLED = 'PLATFORM_CANCELLED',

  // System
  TIMEOUT = 'TIMEOUT',
  CAPACITY_EXCEEDED = 'CAPACITY_EXCEEDED',
  OTHER = 'OTHER',
}

/**
 * Order item entity
 */
export interface GhostOrderItem {
  externalId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers?: GhostOrderItemModifier[];
  specialInstructions?: string;
}

/**
 * Order item modifier
 */
export interface GhostOrderItemModifier {
  name: string;
  price: number;
  quantity?: number;
}

/**
 * Customer information
 */
export interface GhostOrderCustomer {
  name: string;
  phone?: string;
  instructions?: string;
}

/**
 * Driver information
 */
export interface GhostOrderDriver {
  name: string;
  phone?: string;
  vehicle?: string;
  licensePlate?: string;
  photoUrl?: string;
  estimatedArrival?: Date;
  arrivedAt?: Date;
}

/**
 * Ghost Kitchen Order entity
 */
export interface GhostOrder {
  /** Internal order ID (UUID) */
  id: string;

  /** External order ID from KitchenHub/platform */
  externalOrderId: string;

  /** Delivery platform source */
  platform: DeliveryPlatform;

  /** Restaurant ID */
  restaurantId: string;

  /** Ghost kitchen session ID */
  sessionId: string;

  /** Order items */
  items: GhostOrderItem[];

  /** Customer information */
  customer: GhostOrderCustomer;

  /** Order subtotal */
  subtotal: number;

  /** Platform fees */
  platformFee: number;

  /** Tax amount */
  tax?: number;

  /** Tip amount */
  tip?: number;

  /** Total order amount */
  total: number;

  /** Current order status */
  status: GhostOrderStatus;

  // Timestamps
  /** When order was received */
  receivedAt: Date;

  /** When order was accepted */
  acceptedAt?: Date;

  /** When prep started */
  prepStartedAt?: Date;

  /** When order was marked ready */
  readyAt?: Date;

  /** When driver picked up */
  pickedUpAt?: Date;

  /** When order was completed */
  completedAt?: Date;

  /** When order was cancelled */
  cancelledAt?: Date;

  /** Scheduled pickup time (for scheduled orders) */
  scheduledPickupAt?: Date;

  // Prep time tracking
  /** Estimated prep time in seconds */
  prepTimeEstimate?: number;

  /** Actual prep time in seconds (prepStartedAt to readyAt) */
  actualPrepTime?: number;

  // Driver info
  /** Driver information once assigned */
  driverInfo?: GhostOrderDriver;

  // Cancellation
  /** Cancellation reason code */
  cancelReason?: OrderCancellationReason;

  /** Cancellation details */
  cancelDetails?: string;

  // Metadata
  /** Whether this was an auto-accepted order */
  autoAccepted?: boolean;

  /** Platform-specific metadata */
  metadata?: Record<string, any>;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Helper to calculate actual prep time
 */
export function calculatePrepTime(order: GhostOrder): number | null {
  if (!order.prepStartedAt || !order.readyAt) {
    return null;
  }
  return Math.round((order.readyAt.getTime() - order.prepStartedAt.getTime()) / 1000);
}

/**
 * Check if order is in a terminal state
 */
export function isOrderTerminal(status: GhostOrderStatus): boolean {
  return [
    GhostOrderStatus.COMPLETED,
    GhostOrderStatus.CANCELLED,
    GhostOrderStatus.REJECTED,
  ].includes(status);
}

/**
 * Check if order is active (needs attention)
 */
export function isOrderActive(status: GhostOrderStatus): boolean {
  return [
    GhostOrderStatus.RECEIVED,
    GhostOrderStatus.ACCEPTED,
    GhostOrderStatus.PREPARING,
    GhostOrderStatus.READY,
  ].includes(status);
}

/**
 * Valid status transitions
 */
export const ORDER_STATUS_TRANSITIONS: Record<GhostOrderStatus, GhostOrderStatus[]> = {
  [GhostOrderStatus.RECEIVED]: [
    GhostOrderStatus.ACCEPTED,
    GhostOrderStatus.REJECTED,
    GhostOrderStatus.CANCELLED,
  ],
  [GhostOrderStatus.ACCEPTED]: [
    GhostOrderStatus.PREPARING,
    GhostOrderStatus.CANCELLED,
  ],
  [GhostOrderStatus.PREPARING]: [
    GhostOrderStatus.READY,
    GhostOrderStatus.CANCELLED,
  ],
  [GhostOrderStatus.READY]: [
    GhostOrderStatus.PICKED_UP,
    GhostOrderStatus.CANCELLED,
  ],
  [GhostOrderStatus.PICKED_UP]: [
    GhostOrderStatus.COMPLETED,
  ],
  [GhostOrderStatus.COMPLETED]: [],
  [GhostOrderStatus.CANCELLED]: [],
  [GhostOrderStatus.REJECTED]: [],
};

/**
 * Check if status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: GhostOrderStatus,
  newStatus: GhostOrderStatus,
): boolean {
  return ORDER_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}
