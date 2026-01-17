import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SwapsService } from '../services/swaps.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, CurrentProfile } from '@/common/decorators/current-user.decorator';

@ApiTags('swaps')
@Controller('restaurants/:restaurantId/swaps')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SwapsController {
  constructor(private readonly swapsService: SwapsService) {}

  @Post()
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Create a swap request' })
  async create(
    @CurrentProfile('id') profileId: string,
    @Body() data: {
      shiftId: string;
      targetWorkerId?: string;
      targetShiftId?: string;
      message?: string;
      expiresInHours?: number;
    },
  ) {
    return this.swapsService.createSwap(data.shiftId, profileId, {
      targetWorkerId: data.targetWorkerId,
      targetShiftId: data.targetShiftId,
      message: data.message,
      expiresInHours: data.expiresInHours,
    });
  }

  @Post('drop')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Drop shift to pool' })
  async dropToPool(
    @CurrentProfile('id') profileId: string,
    @Body() data: { shiftId: string; reason?: string },
  ) {
    return this.swapsService.dropToPool(data.shiftId, profileId, data.reason);
  }

  @Get('pending')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get pending swaps requiring approval' })
  async getPendingSwaps(@Param('restaurantId') restaurantId: string) {
    return this.swapsService.getPendingSwapsForRestaurant(restaurantId);
  }

  @Get('mine')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get my swaps' })
  async getMySwaps(
    @CurrentProfile('id') profileId: string,
    @Query('status') status?: string,
  ) {
    return this.swapsService.getSwapsForWorker(profileId, status);
  }

  @Get(':id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get swap details' })
  async getSwap(@Param('id') id: string) {
    return this.swapsService.getSwap(id);
  }

  @Post(':id/respond')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Respond to a swap request' })
  async respond(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
    @Body() data: { accepted: boolean; message?: string },
  ) {
    return this.swapsService.respondToSwap(id, profileId, data.accepted, data.message);
  }

  @Post(':id/approve')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Manager approves a swap' })
  async approve(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.swapsService.approveSwap(id, userId);
  }

  @Post(':id/reject')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Manager rejects a swap' })
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data?: { reason?: string },
  ) {
    return this.swapsService.rejectSwap(id, userId, data?.reason);
  }

  @Delete(':id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Cancel a swap request' })
  async cancel(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.swapsService.cancelSwap(id, profileId);
  }
}
