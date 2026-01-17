import {
  IsString,
  IsNumber,
  IsArray,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsUUID,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryPlatform } from '../config/kitchenhub.config';

// ==================== Order DTOs ====================

/**
 * Customer information from delivery order
 */
export class OrderCustomerDto {
  @ApiProperty({ description: 'Customer name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Customer phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Special instructions from customer' })
  @IsOptional()
  @IsString()
  instructions?: string;
}

/**
 * Item modifier/customization
 */
export class OrderItemModifierDto {
  @ApiProperty({ description: 'Modifier name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Modifier price adjustment' })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ description: 'Modifier quantity' })
  @IsOptional()
  @IsNumber()
  quantity?: number;
}

/**
 * Individual item in an order
 */
export class OrderItemDto {
  @ApiProperty({ description: 'External item ID from platform' })
  @IsString()
  externalId: string;

  @ApiProperty({ description: 'Item name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Item quantity' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ description: 'Total price for this item' })
  @IsNumber()
  totalPrice: number;

  @ApiPropertyOptional({ description: 'Item modifiers/customizations' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  modifiers?: OrderItemModifierDto[];

  @ApiPropertyOptional({ description: 'Special instructions for this item' })
  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

/**
 * Order from KitchenHub aggregator
 */
export class KitchenHubOrderDto {
  @ApiProperty({ description: 'External order ID from KitchenHub' })
  @IsString()
  externalOrderId: string;

  @ApiProperty({
    description: 'Delivery platform',
    enum: DeliveryPlatform,
  })
  @IsEnum(DeliveryPlatform)
  platform: DeliveryPlatform;

  @ApiProperty({ description: 'Restaurant ID in our system' })
  @IsUUID()
  restaurantId: string;

  @ApiProperty({ description: 'Order items', type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ description: 'Customer information', type: OrderCustomerDto })
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer: OrderCustomerDto;

  @ApiProperty({ description: 'Subtotal before fees and tax' })
  @IsNumber()
  subtotal: number;

  @ApiProperty({ description: 'Platform fees' })
  @IsNumber()
  platformFee: number;

  @ApiPropertyOptional({ description: 'Tax amount' })
  @IsOptional()
  @IsNumber()
  tax?: number;

  @ApiPropertyOptional({ description: 'Tip amount' })
  @IsOptional()
  @IsNumber()
  tip?: number;

  @ApiProperty({ description: 'Total order amount' })
  @IsNumber()
  total: number;

  @ApiProperty({ description: 'Order received timestamp' })
  @IsDateString()
  receivedAt: string;

  @ApiPropertyOptional({ description: 'Requested pickup time' })
  @IsOptional()
  @IsDateString()
  requestedPickupTime?: string;

  @ApiPropertyOptional({ description: 'Estimated prep time in minutes' })
  @IsOptional()
  @IsNumber()
  estimatedPrepTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Whether order is scheduled for later' })
  @IsOptional()
  @IsBoolean()
  isScheduled?: boolean;

  @ApiPropertyOptional({ description: 'Platform-specific metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

// ==================== Order Status DTOs ====================

/**
 * Order status values
 */
export enum OrderStatus {
  RECEIVED = 'RECEIVED',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  PICKED_UP = 'PICKED_UP',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/**
 * Order status update payload
 */
export class OrderStatusUpdateDto {
  @ApiProperty({
    description: 'New order status',
    enum: OrderStatus,
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Estimated prep time in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  prepTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Reason for status change (required for cancellation/rejection)' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Order rejection payload
 */
export class OrderRejectionDto {
  @ApiProperty({ description: 'Rejection reason code' })
  @IsString()
  reasonCode: string;

  @ApiPropertyOptional({ description: 'Additional details' })
  @IsOptional()
  @IsString()
  details?: string;
}

// ==================== Menu DTOs ====================

/**
 * Menu item from KitchenHub
 */
export class KitchenHubMenuItemDto {
  @ApiProperty({ description: 'External item ID' })
  @IsString()
  externalId: string;

  @ApiProperty({ description: 'Item name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Item description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Item price' })
  @IsNumber()
  price: number;

  @ApiProperty({ description: 'Item category' })
  @IsString()
  category: string;

  @ApiProperty({ description: 'Whether item is available' })
  @IsBoolean()
  available: boolean;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Platforms this item is listed on' })
  @IsOptional()
  @IsArray()
  @IsEnum(DeliveryPlatform, { each: true })
  platforms?: DeliveryPlatform[];

  @ApiPropertyOptional({ description: 'Item modifiers/options' })
  @IsOptional()
  @IsArray()
  modifierGroups?: MenuModifierGroupDto[];
}

/**
 * Menu modifier group
 */
export class MenuModifierGroupDto {
  @ApiProperty({ description: 'Group ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Group name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Minimum selections required' })
  @IsNumber()
  minSelections: number;

  @ApiProperty({ description: 'Maximum selections allowed' })
  @IsNumber()
  maxSelections: number;

  @ApiProperty({ description: 'Modifier options' })
  @IsArray()
  options: MenuModifierOptionDto[];
}

/**
 * Menu modifier option
 */
export class MenuModifierOptionDto {
  @ApiProperty({ description: 'Option ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Option name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Price adjustment' })
  @IsNumber()
  price: number;

  @ApiProperty({ description: 'Whether option is available' })
  @IsBoolean()
  available: boolean;
}

/**
 * Menu availability update
 */
export class MenuAvailabilityUpdateDto {
  @ApiProperty({ description: 'Item ID' })
  @IsString()
  itemId: string;

  @ApiProperty({ description: 'Whether item is available' })
  @IsBoolean()
  available: boolean;

  @ApiPropertyOptional({ description: 'Platforms to update (all if not specified)' })
  @IsOptional()
  @IsArray()
  @IsEnum(DeliveryPlatform, { each: true })
  platforms?: DeliveryPlatform[];

  @ApiPropertyOptional({ description: 'Duration to 86 item (minutes), indefinite if not set' })
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;
}

// ==================== Delivery Partner DTOs ====================

/**
 * Connected delivery platform info
 */
export class DeliveryPartnerDto {
  @ApiProperty({
    description: 'Platform identifier',
    enum: DeliveryPlatform,
  })
  @IsEnum(DeliveryPlatform)
  platform: DeliveryPlatform;

  @ApiProperty({ description: 'Whether platform is connected' })
  @IsBoolean()
  connected: boolean;

  @ApiProperty({ description: 'Whether currently accepting orders' })
  @IsBoolean()
  acceptingOrders: boolean;

  @ApiPropertyOptional({ description: 'Platform-specific store ID' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Last sync timestamp' })
  @IsOptional()
  @IsDateString()
  lastSyncAt?: string;

  @ApiPropertyOptional({ description: 'Connection status details' })
  @IsOptional()
  @IsString()
  statusMessage?: string;
}

// ==================== Driver DTOs ====================

/**
 * Driver information for order pickup
 */
export class DriverInfoDto {
  @ApiProperty({ description: 'Driver name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Driver phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Vehicle description' })
  @IsOptional()
  @IsString()
  vehicle?: string;

  @ApiPropertyOptional({ description: 'Vehicle license plate' })
  @IsOptional()
  @IsString()
  licensePlate?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival time' })
  @IsOptional()
  @IsDateString()
  estimatedArrival?: string;

  @ApiPropertyOptional({ description: 'Driver photo URL' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

// ==================== Webhook Event DTOs ====================

/**
 * Base webhook event
 */
export class WebhookEventDto {
  @ApiProperty({ description: 'Event type' })
  @IsString()
  eventType: string;

  @ApiProperty({ description: 'Event timestamp' })
  @IsDateString()
  timestamp: string;

  @ApiProperty({ description: 'Event ID for deduplication' })
  @IsString()
  eventId: string;
}

/**
 * Order created webhook event
 */
export class OrderCreatedWebhookDto extends WebhookEventDto {
  @ApiProperty({ description: 'Order data', type: KitchenHubOrderDto })
  @ValidateNested()
  @Type(() => KitchenHubOrderDto)
  order: KitchenHubOrderDto;
}

/**
 * Order cancelled webhook event
 */
export class OrderCancelledWebhookDto extends WebhookEventDto {
  @ApiProperty({ description: 'External order ID' })
  @IsString()
  externalOrderId: string;

  @ApiProperty({ description: 'Platform' })
  @IsEnum(DeliveryPlatform)
  platform: DeliveryPlatform;

  @ApiProperty({ description: 'Cancellation reason' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Who initiated cancellation' })
  @IsOptional()
  @IsString()
  initiatedBy?: string;
}

/**
 * Driver assigned webhook event
 */
export class DriverAssignedWebhookDto extends WebhookEventDto {
  @ApiProperty({ description: 'External order ID' })
  @IsString()
  externalOrderId: string;

  @ApiProperty({ description: 'Platform' })
  @IsEnum(DeliveryPlatform)
  platform: DeliveryPlatform;

  @ApiProperty({ description: 'Driver information', type: DriverInfoDto })
  @ValidateNested()
  @Type(() => DriverInfoDto)
  driver: DriverInfoDto;
}

/**
 * Driver arrived webhook event
 */
export class DriverArrivedWebhookDto extends WebhookEventDto {
  @ApiProperty({ description: 'External order ID' })
  @IsString()
  externalOrderId: string;

  @ApiProperty({ description: 'Platform' })
  @IsEnum(DeliveryPlatform)
  platform: DeliveryPlatform;

  @ApiProperty({ description: 'Arrival timestamp' })
  @IsDateString()
  arrivedAt: string;
}

// ==================== Analytics DTOs ====================

/**
 * Order history query parameters
 */
export class OrderHistoryQueryDto {
  @ApiProperty({ description: 'Start date' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Filter by platform' })
  @IsOptional()
  @IsEnum(DeliveryPlatform)
  platform?: DeliveryPlatform;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  @IsOptional()
  @IsNumber()
  limit?: number;
}

/**
 * Order metrics response
 */
export class OrderMetricsDto {
  @ApiProperty({ description: 'Total orders in period' })
  totalOrders: number;

  @ApiProperty({ description: 'Completed orders' })
  completedOrders: number;

  @ApiProperty({ description: 'Cancelled orders' })
  cancelledOrders: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average order value' })
  averageOrderValue: number;

  @ApiProperty({ description: 'Average prep time in seconds' })
  averagePrepTimeSeconds: number;

  @ApiProperty({ description: 'Orders by platform' })
  byPlatform: Record<string, { orders: number; revenue: number }>;

  @ApiProperty({ description: 'Orders by hour of day' })
  byHour: Record<string, number>;
}
