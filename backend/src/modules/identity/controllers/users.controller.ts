import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      timezone?: string;
      avatarUrl?: string;
    },
  ) {
    return this.usersService.updateProfile(userId, data);
  }

  @Get('me/restaurants')
  @ApiOperation({ summary: 'Get restaurants where user is a member' })
  async getRestaurants(@CurrentUser('id') userId: string) {
    return this.usersService.getRestaurantMemberships(userId);
  }

  @Get('me/notification-preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getNotificationPreferences(@CurrentUser('id') userId: string) {
    return this.usersService.getNotificationPreferences(userId);
  }

  @Put('me/notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updateNotificationPreferences(
    @CurrentUser('id') userId: string,
    @Body() data: {
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      maxPerHour?: number;
      batchLowUrgency?: boolean;
      positionFilter?: string[];
      maxDistanceMiles?: number;
    },
  ) {
    return this.usersService.updateNotificationPreferences(userId, data);
  }
}
