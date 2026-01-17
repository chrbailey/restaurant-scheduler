import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ShiftsService } from '../services/shifts.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, CurrentProfile } from '@/common/decorators/current-user.decorator';

@ApiTags('shifts')
@Controller('restaurants/:restaurantId/shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Create a new shift' })
  async create(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
    @Body() data: {
      position: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      notes?: string;
      autoApprove?: boolean;
      minReputationScore?: number;
      hourlyRateOverride?: number;
      type?: string;
    },
  ) {
    return this.shiftsService.create(userId, {
      restaurantId,
      position: data.position,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      breakMinutes: data.breakMinutes,
      notes: data.notes,
      autoApprove: data.autoApprove,
      minReputationScore: data.minReputationScore,
      hourlyRateOverride: data.hourlyRateOverride,
      type: data.type,
    });
  }

  @Post('bulk')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Create multiple shifts at once' })
  async createBulk(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
    @Body() data: {
      shifts: {
        position: string;
        startTime: string;
        endTime: string;
        breakMinutes?: number;
        notes?: string;
        autoApprove?: boolean;
        minReputationScore?: number;
        hourlyRateOverride?: number;
        type?: string;
      }[];
    },
  ) {
    const shifts = data.shifts.map((s) => ({
      restaurantId,
      position: s.position,
      startTime: new Date(s.startTime),
      endTime: new Date(s.endTime),
      breakMinutes: s.breakMinutes,
      notes: s.notes,
      autoApprove: s.autoApprove,
      minReputationScore: s.minReputationScore,
      hourlyRateOverride: s.hourlyRateOverride,
      type: s.type,
    }));

    return this.shiftsService.createBulk(userId, restaurantId, shifts);
  }

  @Get()
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'List shifts with filtering' })
  @ApiQuery({ name: 'status', required: false, type: [String] })
  @ApiQuery({ name: 'position', required: false, type: [String] })
  @ApiQuery({ name: 'workerId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async list(
    @Param('restaurantId') restaurantId: string,
    @Query('status') status?: string | string[],
    @Query('position') position?: string | string[],
    @Query('workerId') workerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.shiftsService.findMany({
      restaurantId,
      status: Array.isArray(status) ? status : status ? [status] : undefined,
      position: Array.isArray(position) ? position : position ? [position] : undefined,
      workerId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      pageSize,
    });
  }

  @Get('week')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get weekly schedule view' })
  @ApiQuery({ name: 'weekStart', required: true, description: 'ISO date of week start' })
  @ApiQuery({ name: 'includeNetwork', required: false, type: Boolean })
  async getWeekSchedule(
    @Param('restaurantId') restaurantId: string,
    @Query('weekStart') weekStart: string,
    @Query('includeNetwork') includeNetwork?: boolean,
  ) {
    return this.shiftsService.getWeekSchedule(
      restaurantId,
      new Date(weekStart),
      includeNetwork,
    );
  }

  @Get('coverage-gaps')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get coverage gaps (open shifts)' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  async getCoverageGaps(
    @Param('restaurantId') restaurantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.shiftsService.getCoverageGaps(
      restaurantId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get shift details' })
  async getShift(@Param('id') id: string) {
    return this.shiftsService.findById(id);
  }

  @Get(':id/history')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get shift status history' })
  async getShiftHistory(@Param('id') id: string) {
    return this.shiftsService.getHistory(id);
  }

  @Put(':id')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Update a shift' })
  async update(
    @Param('id') id: string,
    @Body() data: {
      position?: string;
      startTime?: string;
      endTime?: string;
      breakMinutes?: number;
      notes?: string;
      autoApprove?: boolean;
      minReputationScore?: number;
      hourlyRateOverride?: number;
    },
  ) {
    return this.shiftsService.update(id, {
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
    });
  }

  @Post('publish')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Publish multiple shifts' })
  async publish(
    @CurrentUser('id') userId: string,
    @Body() data: { shiftIds: string[] },
  ) {
    return this.shiftsService.publishMany(data.shiftIds, userId);
  }

  @Post(':id/assign')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Assign a worker to a shift' })
  async assign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data: { workerId: string; notify?: boolean },
  ) {
    return this.shiftsService.assignWorker(id, data.workerId, userId, data.notify);
  }

  @Post(':id/confirm')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Confirm a claimed shift' })
  async confirm(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.shiftsService.confirm(id, userId);
  }

  @Post(':id/release')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Release shift back to pool' })
  async release(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data?: { reason?: string },
  ) {
    return this.shiftsService.releaseToPool(id, userId, data?.reason);
  }

  @Post(':id/clock-in')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Clock in to start shift' })
  async clockIn(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.shiftsService.clockIn(id, profileId);
  }

  @Post(':id/clock-out')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Clock out to end shift' })
  async clockOut(
    @Param('id') id: string,
    @CurrentProfile('id') profileId: string,
  ) {
    return this.shiftsService.clockOut(id, profileId);
  }

  @Post(':id/no-show')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Mark shift as no-show' })
  async markNoShow(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.shiftsService.markNoShow(id, userId);
  }

  @Delete(':id')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Cancel a shift' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() data?: { reason?: string },
  ) {
    return this.shiftsService.cancel(id, userId, data?.reason);
  }
}
