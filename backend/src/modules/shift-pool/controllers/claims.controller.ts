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
import { ClaimsService } from '../services/claims.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, CurrentProfile } from '@/common/decorators/current-user.decorator';

@ApiTags('claims')
@Controller('restaurants/:restaurantId/claims')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Claim an open shift' })
  async claim(
    @CurrentProfile('id') profileId: string,
    @Body() data: { shiftId: string; notes?: string },
  ) {
    return this.claimsService.claim(data.shiftId, profileId, data.notes);
  }

  @Get('pending')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get pending claims for restaurant' })
  async getPendingClaims(@Param('restaurantId') restaurantId: string) {
    return this.claimsService.getPendingClaimsForRestaurant(restaurantId);
  }

  @Get('mine')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get my claims' })
  async getMyClaims(
    @CurrentProfile('id') profileId: string,
    @Query('status') status?: string,
  ) {
    return this.claimsService.getClaimsByWorker(profileId, status);
  }

  @Get('shift/:shiftId')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get claims for a specific shift' })
  async getClaimsForShift(@Param('shiftId') shiftId: string) {
    return this.claimsService.getClaimsForShift(shiftId);
  }

  @Post(':id/approve')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Approve a claim' })
  async approve(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.claimsService.approveClaim(id, userId);
  }

  @Post(':id/reject')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Reject a claim' })
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data?: { reason?: string },
  ) {
    return this.claimsService.rejectClaim(id, userId, data?.reason);
  }

  @Delete(':id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Withdraw a claim' })
  async withdraw(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.claimsService.withdrawClaim(id, profileId);
  }
}
