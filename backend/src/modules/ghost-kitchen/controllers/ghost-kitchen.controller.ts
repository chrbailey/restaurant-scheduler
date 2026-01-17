import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GhostKitchenService } from '../services/ghost-kitchen.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('ghost-kitchen')
@Controller('restaurants/:restaurantId/ghost-kitchen')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GhostKitchenController {
  constructor(private readonly ghostKitchenService: GhostKitchenService) {}

  @Get('status')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get ghost mode status' })
  async getStatus(@Param('restaurantId') restaurantId: string) {
    return this.ghostKitchenService.getStatus(restaurantId);
  }

  @Post('enable')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Enable ghost mode' })
  async enable(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
    @Body() data?: {
      endTime?: string;
      platforms?: string[];
      maxOrders?: number;
    },
  ) {
    return this.ghostKitchenService.enableGhostMode(restaurantId, userId, {
      endTime: data?.endTime ? new Date(data.endTime) : undefined,
      platforms: data?.platforms,
      maxOrders: data?.maxOrders,
    });
  }

  @Post('disable')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Disable ghost mode' })
  async disable(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
    @Body() data?: { reason?: string },
  ) {
    return this.ghostKitchenService.disableGhostMode(restaurantId, userId, data?.reason);
  }

  @Put('orders/:orderId/status')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Update order status' })
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() data: {
      status: 'PREPARING' | 'READY' | 'PICKED_UP' | 'CANCELLED';
      cancelReason?: string;
    },
  ) {
    return this.ghostKitchenService.updateOrderStatus(
      orderId,
      data.status,
      data.cancelReason,
    );
  }

  @Get('sessions/:sessionId/analytics')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get session analytics' })
  async getSessionAnalytics(@Param('sessionId') sessionId: string) {
    return this.ghostKitchenService.getSessionAnalytics(sessionId);
  }
}

// Webhook controller for aggregator callbacks
@ApiTags('ghost-kitchen')
@Controller('webhooks/ghost-kitchen')
export class GhostKitchenWebhookController {
  constructor(private readonly ghostKitchenService: GhostKitchenService) {}

  @Public()
  @Post('orders')
  @ApiOperation({ summary: 'Receive incoming order from aggregator' })
  async receiveOrder(
    @Body() data: {
      restaurantId: string;
      externalOrderId: string;
      platform: string;
      totalAmount: number;
      itemCount: number;
    },
  ) {
    // TODO: Validate webhook signature
    return this.ghostKitchenService.handleIncomingOrder(data.restaurantId, data);
  }
}
