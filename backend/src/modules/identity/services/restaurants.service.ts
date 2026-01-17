import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createdByUserId: string,
    data: {
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
    // Create restaurant
    const restaurant = await this.prisma.restaurant.create({
      data: {
        name: data.name,
        street: data.street,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        country: data.country || 'US',
        lat: data.lat,
        lng: data.lng,
        timezone: data.timezone,
        phone: data.phone,
        email: data.email,
      },
    });

    // Create owner profile for the creator
    await this.prisma.workerProfile.create({
      data: {
        userId: createdByUserId,
        restaurantId: restaurant.id,
        role: 'OWNER',
        status: 'ACTIVE',
        tier: 'PRIMARY',
        positions: ['MANAGER'],
        hourlyRate: 0,
      },
    });

    // Create default operating hours (9 AM - 10 PM)
    const defaultHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      restaurantId: restaurant.id,
      dayOfWeek: day,
      openTime: '09:00',
      closeTime: '22:00',
      isClosed: false,
    }));

    await this.prisma.operatingHours.createMany({
      data: defaultHours,
    });

    return restaurant;
  }

  async findById(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        operatingHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
        network: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            workerProfiles: { where: { status: 'ACTIVE' } },
            shifts: { where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } },
          },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      timezone?: string;
    },
  ) {
    return this.prisma.restaurant.update({
      where: { id },
      data,
    });
  }

  async updateShiftSettings(
    id: string,
    settings: {
      requireClaimApproval?: boolean;
      autoApproveThreshold?: number;
      networkVisibilityHours?: number;
      minReputationScore?: number;
      allowCrossRestaurantSwaps?: boolean;
    },
  ) {
    return this.prisma.restaurant.update({
      where: { id },
      data: settings,
    });
  }

  async updateGhostKitchenConfig(
    id: string,
    config: {
      ghostKitchenEnabled?: boolean;
      aggregatorIntegrationId?: string;
      maxConcurrentOrders?: number;
      enabledPlatforms?: string[];
      autoDisableThreshold?: number;
    },
  ) {
    return this.prisma.restaurant.update({
      where: { id },
      data: config,
    });
  }

  async updateOperatingHours(
    restaurantId: string,
    hours: {
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
      isClosed: boolean;
    }[],
  ) {
    // Delete existing hours and recreate
    await this.prisma.operatingHours.deleteMany({
      where: { restaurantId },
    });

    await this.prisma.operatingHours.createMany({
      data: hours.map((h) => ({
        restaurantId,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
    });

    return this.prisma.operatingHours.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  // Network management

  async createNetwork(ownerRestaurantId: string, name: string, description?: string) {
    const restaurant = await this.findById(ownerRestaurantId);

    if (restaurant.networkId) {
      throw new ConflictException('Restaurant is already part of a network');
    }

    const network = await this.prisma.restaurantNetwork.create({
      data: {
        name,
        description,
      },
    });

    await this.prisma.restaurant.update({
      where: { id: ownerRestaurantId },
      data: { networkId: network.id },
    });

    return network;
  }

  async inviteToNetwork(networkId: string, restaurantId: string) {
    const restaurant = await this.findById(restaurantId);

    if (restaurant.networkId) {
      throw new ConflictException('Restaurant is already part of a network');
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { networkId },
    });

    return this.findById(restaurantId);
  }

  async leaveNetwork(restaurantId: string) {
    const restaurant = await this.findById(restaurantId);

    if (!restaurant.networkId) {
      throw new ConflictException('Restaurant is not part of a network');
    }

    // Check if this is the last restaurant in the network
    const networkRestaurants = await this.prisma.restaurant.count({
      where: { networkId: restaurant.networkId },
    });

    if (networkRestaurants <= 1) {
      throw new ConflictException(
        'Cannot leave network as the only member. Delete the network instead.',
      );
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { networkId: null },
    });

    return this.findById(restaurantId);
  }

  async getNetworkRestaurants(networkId: string) {
    return this.prisma.restaurant.findMany({
      where: { networkId },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        lat: true,
        lng: true,
        timezone: true,
        _count: {
          select: {
            workerProfiles: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
  }

  async updateNetworkSettings(
    networkId: string,
    settings: {
      enableCrossRestaurantShifts?: boolean;
      requireCrossRestaurantApproval?: boolean;
      maxDistanceMiles?: number;
      minNetworkReputationScore?: number;
    },
  ) {
    return this.prisma.restaurantNetwork.update({
      where: { id: networkId },
      data: settings,
    });
  }
}
