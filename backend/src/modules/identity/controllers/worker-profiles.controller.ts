import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorkerProfilesService } from '../services/worker-profiles.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, CurrentProfile } from '@/common/decorators/current-user.decorator';

@ApiTags('worker-profiles')
@Controller('restaurants/:restaurantId/workers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WorkerProfilesController {
  constructor(private readonly workersService: WorkerProfilesService) {}

  @Get()
  @Roles('MANAGER', 'OWNER', 'SUPERVISOR')
  @ApiOperation({ summary: 'List workers for a restaurant' })
  async listWorkers(
    @Param('restaurantId') restaurantId: string,
    @Query('status') status?: string,
    @Query('position') position?: string,
    @Query('tier') tier?: string,
  ) {
    return this.workersService.findByRestaurant(restaurantId, {
      status,
      position,
      tier,
      includeUser: true,
    });
  }

  @Get(':id')
  @Roles('MANAGER', 'OWNER', 'SUPERVISOR')
  @ApiOperation({ summary: 'Get worker profile details' })
  async getWorker(@Param('id') id: string) {
    return this.workersService.findById(id);
  }

  @Post('invite')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Invite a new worker' })
  async inviteWorker(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
    @Body() data: {
      phone: string;
      firstName: string;
      lastName: string;
      email?: string;
      role: string;
      positions: string[];
      hourlyRate: number;
      tier?: string;
    },
  ) {
    return this.workersService.inviteWorker(restaurantId, userId, data);
  }

  @Put(':id')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Update worker profile' })
  async updateWorker(
    @Param('id') id: string,
    @Body() data: {
      role?: string;
      positions?: string[];
      hourlyRate?: number;
      tier?: string;
      status?: string;
    },
  ) {
    return this.workersService.updateProfile(id, data);
  }

  @Get(':id/availability')
  @Roles('MANAGER', 'OWNER', 'SUPERVISOR', 'WORKER')
  @ApiOperation({ summary: 'Get worker availability' })
  async getAvailability(@Param('id') id: string) {
    return this.workersService.getAvailability(id);
  }

  @Put(':id/availability')
  @Roles('MANAGER', 'OWNER', 'WORKER')
  @ApiOperation({ summary: 'Set worker availability' })
  async setAvailability(
    @Param('id') id: string,
    @Body() data: {
      availability: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isPreferred: boolean;
      }[];
      effectiveFrom: string;
      effectiveUntil?: string;
    },
  ) {
    return this.workersService.setAvailability(
      id,
      data.availability,
      new Date(data.effectiveFrom),
      data.effectiveUntil ? new Date(data.effectiveUntil) : undefined,
    );
  }

  @Post(':id/time-off')
  @Roles('MANAGER', 'OWNER', 'WORKER')
  @ApiOperation({ summary: 'Request time off' })
  async requestTimeOff(
    @Param('id') id: string,
    @Body() data: {
      startDate: string;
      endDate: string;
      allDay?: boolean;
      startTime?: string;
      endTime?: string;
      reason?: string;
    },
  ) {
    return this.workersService.requestTimeOff(id, {
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      allDay: data.allDay,
      startTime: data.startTime,
      endTime: data.endTime,
      reason: data.reason,
    });
  }

  @Put('time-off/:requestId')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Approve or reject time off request' })
  async resolveTimeOff(
    @Param('requestId') requestId: string,
    @CurrentUser('id') userId: string,
    @Body() data: { approved: boolean; notes?: string },
  ) {
    return this.workersService.resolveTimeOffRequest(
      requestId,
      userId,
      data.approved,
      data.notes,
    );
  }

  @Post(':id/certifications')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Add certification to worker' })
  async addCertification(
    @Param('id') id: string,
    @Body() data: {
      type: string;
      issuedAt: string;
      expiresAt?: string;
      verificationUrl?: string;
    },
  ) {
    return this.workersService.addCertification(id, {
      type: data.type,
      issuedAt: new Date(data.issuedAt),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      verificationUrl: data.verificationUrl,
    });
  }

  @Get('available')
  @Roles('MANAGER', 'OWNER', 'SUPERVISOR')
  @ApiOperation({ summary: 'Find workers available for a shift' })
  async findAvailable(
    @Param('restaurantId') restaurantId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('position') position: string,
    @Query('minReputation') minReputation?: number,
  ) {
    return this.workersService.findAvailableWorkers(
      restaurantId,
      new Date(start),
      new Date(end),
      position,
      { minReputationScore: minReputation },
    );
  }
}
