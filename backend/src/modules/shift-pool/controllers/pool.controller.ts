import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ShiftMatcherService } from '../services/shift-matcher.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentProfile } from '@/common/decorators/current-user.decorator';

@ApiTags('shift-pool')
@Controller('pool')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PoolController {
  constructor(private readonly matcher: ShiftMatcherService) {}

  @Get('available')
  @ApiOperation({ summary: 'Get available shifts for the current worker' })
  @ApiQuery({ name: 'position', required: false, type: [String] })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'includeNetwork', required: false, type: Boolean })
  async getAvailableShifts(
    @CurrentProfile('id') profileId: string,
    @Query('position') position?: string | string[],
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('includeNetwork') includeNetwork?: boolean,
  ) {
    return this.matcher.getAvailableShifts(profileId, {
      position: Array.isArray(position) ? position : position ? [position] : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      includeNetwork,
    });
  }
}

// Worker-specific pool endpoint (requires restaurant context)
@ApiTags('shift-pool')
@Controller('restaurants/:restaurantId/pool')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RestaurantPoolController {
  constructor(private readonly matcher: ShiftMatcherService) {}

  @Get('candidates/:shiftId')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Find best candidates for an open shift' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeNetwork', required: false, type: Boolean })
  async findCandidates(
    @Query('shiftId') shiftId: string,
    @Query('limit') limit?: number,
    @Query('includeNetwork') includeNetwork?: boolean,
  ) {
    return this.matcher.findCandidates(shiftId, { limit, includeNetwork });
  }
}
