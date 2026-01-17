import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  CreateNetworkDto,
  UpdateNetworkDto,
  InviteRestaurantDto,
  RespondInvitationDto,
  UpdateMembershipDto,
} from '../dto/network.dto';
import {
  DEFAULT_NETWORK_SETTINGS,
  NetworkSettings,
} from '../entities/restaurant-network.entity';
import {
  MembershipRole,
  MembershipStatus,
  canManageRole,
} from '../entities/network-membership.entity';

/**
 * Network Service
 *
 * Handles CRUD operations for restaurant networks and memberships.
 * Manages invitations, role assignments, and network settings.
 */
@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new restaurant network
   */
  async createNetwork(restaurantId: string, dto: CreateNetworkDto, userId: string) {
    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    // Check if restaurant is already in a network
    const existingMembership = await this.prisma.networkMembership.findFirst({
      where: {
        restaurantId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING] },
      },
    });

    if (existingMembership) {
      throw new ConflictException('Restaurant is already part of a network');
    }

    // Create network with settings
    const settings: NetworkSettings = {
      ...DEFAULT_NETWORK_SETTINGS,
      ...dto.settings,
    };

    const network = await this.prisma.restaurantNetwork.create({
      data: {
        name: dto.name,
        description: dto.description,
        settings: settings as any,
      },
    });

    // Create owner membership
    await this.prisma.networkMembership.create({
      data: {
        networkId: network.id,
        restaurantId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        invitedById: userId,
        respondedAt: new Date(),
      },
    });

    this.logger.log(
      `Network "${network.name}" created by restaurant ${restaurantId}`,
    );

    return this.getNetworkById(network.id);
  }

  /**
   * Get network by ID with member count
   */
  async getNetworkById(id: string) {
    const network = await this.prisma.restaurantNetwork.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!network) {
      throw new NotFoundException('Network not found');
    }

    return {
      ...network,
      memberCount: network._count.memberships,
    };
  }

  /**
   * Update network settings
   */
  async updateNetwork(
    networkId: string,
    dto: UpdateNetworkDto,
    actorRestaurantId: string,
  ) {
    // Verify actor has permission (must be OWNER or ADMIN)
    const membership = await this.getMembershipWithRole(networkId, actorRestaurantId);

    if (
      membership.role !== MembershipRole.OWNER &&
      membership.role !== MembershipRole.ADMIN
    ) {
      throw new ForbiddenException('Only network owners and admins can update settings');
    }

    // Get current network to merge settings
    const currentNetwork = await this.prisma.restaurantNetwork.findUnique({
      where: { id: networkId },
    });

    if (!currentNetwork) {
      throw new NotFoundException('Network not found');
    }

    const currentSettings = (currentNetwork.settings as unknown as NetworkSettings) || DEFAULT_NETWORK_SETTINGS;
    const updatedSettings: NetworkSettings = {
      ...currentSettings,
      ...dto.settings,
    };

    const network = await this.prisma.restaurantNetwork.update({
      where: { id: networkId },
      data: {
        name: dto.name,
        description: dto.description,
        settings: updatedSettings as any,
      },
    });

    this.logger.log(`Network ${networkId} updated by restaurant ${actorRestaurantId}`);

    return this.getNetworkById(network.id);
  }

  /**
   * Delete a network (OWNER only)
   */
  async deleteNetwork(networkId: string, actorRestaurantId: string) {
    const membership = await this.getMembershipWithRole(networkId, actorRestaurantId);

    if (membership.role !== MembershipRole.OWNER) {
      throw new ForbiddenException('Only the network owner can delete the network');
    }

    // Delete all memberships first
    await this.prisma.networkMembership.deleteMany({
      where: { networkId },
    });

    // Delete the network
    await this.prisma.restaurantNetwork.delete({
      where: { id: networkId },
    });

    this.logger.log(`Network ${networkId} deleted by restaurant ${actorRestaurantId}`);

    return { success: true };
  }

  /**
   * Invite a restaurant to the network
   */
  async inviteRestaurant(
    networkId: string,
    dto: InviteRestaurantDto,
    actorRestaurantId: string,
    actorUserId: string,
  ) {
    // Verify actor has permission
    const actorMembership = await this.getMembershipWithRole(networkId, actorRestaurantId);

    if (actorMembership.role === MembershipRole.MEMBER) {
      throw new ForbiddenException('Members cannot invite other restaurants');
    }

    // Cannot assign a role higher than your own
    const requestedRole = dto.role || MembershipRole.MEMBER;
    if (!canManageRole(actorMembership.role, requestedRole) && requestedRole !== MembershipRole.MEMBER) {
      throw new ForbiddenException('Cannot assign a role equal to or higher than your own');
    }

    // Verify target restaurant exists
    const targetRestaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
    });

    if (!targetRestaurant) {
      throw new NotFoundException('Target restaurant not found');
    }

    // Check if already invited or member
    const existingMembership = await this.prisma.networkMembership.findFirst({
      where: {
        networkId,
        restaurantId: dto.restaurantId,
      },
    });

    if (existingMembership) {
      if (existingMembership.status === MembershipStatus.ACTIVE) {
        throw new ConflictException('Restaurant is already a member of this network');
      }
      if (existingMembership.status === MembershipStatus.PENDING) {
        throw new ConflictException('Restaurant has already been invited');
      }
    }

    // Check if restaurant is in another network
    const otherNetworkMembership = await this.prisma.networkMembership.findFirst({
      where: {
        restaurantId: dto.restaurantId,
        networkId: { not: networkId },
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING] },
      },
    });

    if (otherNetworkMembership) {
      throw new ConflictException('Restaurant is already part of another network');
    }

    // Create pending membership (invitation)
    const membership = await this.prisma.networkMembership.create({
      data: {
        networkId,
        restaurantId: dto.restaurantId,
        role: requestedRole,
        status: MembershipStatus.PENDING,
        invitedById: actorUserId,
      },
      include: {
        restaurant: {
          select: { id: true, name: true, city: true, state: true },
        },
      },
    });

    this.logger.log(
      `Restaurant ${dto.restaurantId} invited to network ${networkId} by ${actorRestaurantId}`,
    );

    // TODO: Notify target restaurant of invitation

    return membership;
  }

  /**
   * Respond to a network invitation
   */
  async respondToInvitation(
    membershipId: string,
    dto: RespondInvitationDto,
    restaurantId: string,
  ) {
    const membership = await this.prisma.networkMembership.findUnique({
      where: { id: membershipId },
      include: {
        network: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Invitation not found');
    }

    if (membership.restaurantId !== restaurantId) {
      throw new ForbiddenException('This invitation is not for your restaurant');
    }

    if (membership.status !== MembershipStatus.PENDING) {
      throw new BadRequestException('Invitation has already been responded to');
    }

    if (dto.accept) {
      // Accept invitation
      const updatedMembership = await this.prisma.networkMembership.update({
        where: { id: membershipId },
        data: {
          status: MembershipStatus.ACTIVE,
          respondedAt: new Date(),
        },
        include: {
          network: true,
          restaurant: {
            select: { id: true, name: true, city: true, state: true },
          },
        },
      });

      this.logger.log(
        `Restaurant ${restaurantId} accepted invitation to network ${membership.networkId}`,
      );

      return updatedMembership;
    } else {
      // Decline invitation - delete the membership record
      await this.prisma.networkMembership.delete({
        where: { id: membershipId },
      });

      this.logger.log(
        `Restaurant ${restaurantId} declined invitation to network ${membership.networkId}`,
      );

      return { success: true, message: 'Invitation declined' };
    }
  }

  /**
   * Remove a restaurant from the network
   */
  async removeRestaurant(
    networkId: string,
    targetRestaurantId: string,
    actorRestaurantId: string,
  ) {
    const actorMembership = await this.getMembershipWithRole(networkId, actorRestaurantId);
    const targetMembership = await this.getMembershipWithRole(networkId, targetRestaurantId);

    // Check permissions
    if (targetRestaurantId === actorRestaurantId) {
      // Self-removal (leaving the network)
      if (targetMembership.role === MembershipRole.OWNER) {
        throw new BadRequestException(
          'Owner cannot leave. Transfer ownership or delete the network first.',
        );
      }
    } else {
      // Removing another restaurant
      if (!canManageRole(actorMembership.role, targetMembership.role)) {
        throw new ForbiddenException(
          'You do not have permission to remove this restaurant',
        );
      }
    }

    // Delete cross-training records involving this restaurant
    await this.prisma.crossTraining.deleteMany({
      where: {
        OR: [
          {
            workerProfile: { restaurantId: targetRestaurantId },
            targetRestaurant: {
              memberships: { some: { networkId } },
            },
          },
          {
            targetRestaurantId,
            workerProfile: {
              restaurant: {
                memberships: { some: { networkId } },
              },
            },
          },
        ],
      },
    });

    // Delete the membership
    await this.prisma.networkMembership.delete({
      where: { id: targetMembership.id },
    });

    this.logger.log(
      `Restaurant ${targetRestaurantId} removed from network ${networkId}`,
    );

    return { success: true };
  }

  /**
   * Update a member's role or status
   */
  async updateMembership(
    networkId: string,
    targetRestaurantId: string,
    dto: UpdateMembershipDto,
    actorRestaurantId: string,
  ) {
    const actorMembership = await this.getMembershipWithRole(networkId, actorRestaurantId);
    const targetMembership = await this.getMembershipWithRole(networkId, targetRestaurantId);

    // Only OWNER can change roles; OWNER and ADMIN can suspend
    if (dto.role) {
      if (actorMembership.role !== MembershipRole.OWNER) {
        throw new ForbiddenException('Only the owner can change member roles');
      }

      // Cannot change owner's role directly (must transfer ownership)
      if (targetMembership.role === MembershipRole.OWNER) {
        throw new BadRequestException(
          'Cannot change owner role. Use transfer ownership instead.',
        );
      }
    }

    if (dto.status) {
      if (!canManageRole(actorMembership.role, targetMembership.role)) {
        throw new ForbiddenException(
          'You do not have permission to change this member\'s status',
        );
      }
    }

    const updated = await this.prisma.networkMembership.update({
      where: { id: targetMembership.id },
      data: {
        role: dto.role,
        status: dto.status,
      },
      include: {
        restaurant: {
          select: { id: true, name: true, city: true, state: true },
        },
      },
    });

    this.logger.log(
      `Membership ${targetMembership.id} updated by restaurant ${actorRestaurantId}`,
    );

    return updated;
  }

  /**
   * Transfer network ownership
   */
  async transferOwnership(
    networkId: string,
    newOwnerRestaurantId: string,
    actorRestaurantId: string,
  ) {
    const actorMembership = await this.getMembershipWithRole(networkId, actorRestaurantId);

    if (actorMembership.role !== MembershipRole.OWNER) {
      throw new ForbiddenException('Only the owner can transfer ownership');
    }

    const newOwnerMembership = await this.getMembershipWithRole(networkId, newOwnerRestaurantId);

    if (newOwnerMembership.status !== MembershipStatus.ACTIVE) {
      throw new BadRequestException('New owner must be an active member');
    }

    // Transfer ownership in a transaction
    await this.prisma.$transaction([
      // Demote current owner to ADMIN
      this.prisma.networkMembership.update({
        where: { id: actorMembership.id },
        data: { role: MembershipRole.ADMIN },
      }),
      // Promote new owner
      this.prisma.networkMembership.update({
        where: { id: newOwnerMembership.id },
        data: { role: MembershipRole.OWNER },
      }),
    ]);

    this.logger.log(
      `Network ${networkId} ownership transferred from ${actorRestaurantId} to ${newOwnerRestaurantId}`,
    );

    return this.getNetworkById(networkId);
  }

  /**
   * Get all restaurants in a network
   */
  async getNetworkRestaurants(networkId: string) {
    const memberships = await this.prisma.networkMembership.findMany({
      where: {
        networkId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        restaurant: {
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
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      ...m.restaurant,
      role: m.role,
      joinedAt: m.joinedAt,
      workerCount: m.restaurant._count.workerProfiles,
    }));
  }

  /**
   * Get all networks a restaurant belongs to
   */
  async getRestaurantNetworks(restaurantId: string) {
    const memberships = await this.prisma.networkMembership.findMany({
      where: {
        restaurantId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING] },
      },
      include: {
        network: {
          include: {
            _count: {
              select: {
                memberships: { where: { status: MembershipStatus.ACTIVE } },
              },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.network,
      memberCount: m.network._count.memberships,
      myRole: m.role,
      myStatus: m.status,
      membershipId: m.id,
    }));
  }

  /**
   * Get pending invitations for a restaurant
   */
  async getPendingInvitations(restaurantId: string) {
    return this.prisma.networkMembership.findMany({
      where: {
        restaurantId,
        status: MembershipStatus.PENDING,
      },
      include: {
        network: true,
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  /**
   * Helper: Get membership with role validation
   */
  private async getMembershipWithRole(networkId: string, restaurantId: string) {
    const membership = await this.prisma.networkMembership.findFirst({
      where: {
        networkId,
        restaurantId,
      },
    });

    if (!membership) {
      throw new NotFoundException('Restaurant is not a member of this network');
    }

    if (membership.status === MembershipStatus.SUSPENDED) {
      throw new ForbiddenException('Restaurant membership is suspended');
    }

    return {
      ...membership,
      role: membership.role as MembershipRole,
    };
  }
}
