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
import { RestaurantsService } from '../services/restaurants.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('restaurants')
@Controller('restaurants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new restaurant' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() data: {
      name: string;
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country?: string;
      lat: number;
      lng: number;
      timezone: string;
      phone: string;
      email: string;
    },
  ) {
    return this.restaurantsService.create(userId, data);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get restaurant details' })
  async getRestaurant(@Param('id') id: string) {
    return this.restaurantsService.findById(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Update restaurant details' })
  async update(
    @Param('id') id: string,
    @Body() data: {
      name?: string;
      phone?: string;
      email?: string;
      timezone?: string;
    },
  ) {
    return this.restaurantsService.update(id, data);
  }

  @Put(':id/shift-settings')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update shift claiming settings' })
  async updateShiftSettings(
    @Param('id') id: string,
    @Body() settings: {
      requireClaimApproval?: boolean;
      autoApproveThreshold?: number;
      networkVisibilityHours?: number;
      minReputationScore?: number;
      allowCrossRestaurantSwaps?: boolean;
    },
  ) {
    return this.restaurantsService.updateShiftSettings(id, settings);
  }

  @Put(':id/ghost-kitchen')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update ghost kitchen configuration' })
  async updateGhostKitchenConfig(
    @Param('id') id: string,
    @Body() config: {
      ghostKitchenEnabled?: boolean;
      aggregatorIntegrationId?: string;
      maxConcurrentOrders?: number;
      enabledPlatforms?: string[];
      autoDisableThreshold?: number;
    },
  ) {
    return this.restaurantsService.updateGhostKitchenConfig(id, config);
  }

  @Put(':id/operating-hours')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Update operating hours' })
  async updateOperatingHours(
    @Param('id') id: string,
    @Body() hours: {
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
      isClosed: boolean;
    }[],
  ) {
    return this.restaurantsService.updateOperatingHours(id, hours);
  }

  // Network management

  @Post(':id/network')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Create a new restaurant network' })
  async createNetwork(
    @Param('id') id: string,
    @Body() data: { name: string; description?: string },
  ) {
    return this.restaurantsService.createNetwork(id, data.name, data.description);
  }

  @Post(':id/network/invite')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Invite another restaurant to network' })
  async inviteToNetwork(
    @Param('id') id: string,
    @Body() data: { restaurantId: string },
  ) {
    // Get the network ID from the current restaurant
    const restaurant = await this.restaurantsService.findById(id);
    if (!restaurant.networkId) {
      throw new Error('Restaurant is not part of a network');
    }
    return this.restaurantsService.inviteToNetwork(restaurant.networkId, data.restaurantId);
  }

  @Post(':id/network/leave')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Leave the current network' })
  async leaveNetwork(@Param('id') id: string) {
    return this.restaurantsService.leaveNetwork(id);
  }

  @Get(':id/network/restaurants')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get all restaurants in the network' })
  async getNetworkRestaurants(@Param('id') id: string) {
    const restaurant = await this.restaurantsService.findById(id);
    if (!restaurant.networkId) {
      return [];
    }
    return this.restaurantsService.getNetworkRestaurants(restaurant.networkId);
  }

  @Put(':id/network/settings')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update network settings' })
  async updateNetworkSettings(
    @Param('id') id: string,
    @Body() settings: {
      enableCrossRestaurantShifts?: boolean;
      requireCrossRestaurantApproval?: boolean;
      maxDistanceMiles?: number;
      minNetworkReputationScore?: number;
    },
  ) {
    const restaurant = await this.restaurantsService.findById(id);
    if (!restaurant.networkId) {
      throw new Error('Restaurant is not part of a network');
    }
    return this.restaurantsService.updateNetworkSettings(restaurant.networkId, settings);
  }
}
