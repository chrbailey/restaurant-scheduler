import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  CreateCrossTrainingDto,
  ApproveCrossTrainingDto,
  RevokeCrossTrainingDto,
  QueryCrossTrainingDto,
} from '../dto/cross-training.dto';
import { CrossTrainingStatus } from '../entities/cross-training.entity';
import { MembershipStatus } from '../entities/network-membership.entity';

/**
 * Cross-Training Service
 *
 * Manages cross-training certifications that allow workers
 * to claim shifts at other restaurants within their network.
 */
@Injectable()
export class CrossTrainingService {
  private readonly logger = new Logger(CrossTrainingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Request cross-training at another restaurant
   */
  async requestCrossTraining(dto: CreateCrossTrainingDto, requestedByUserId: string) {
    // Get worker profile
    const workerProfile = await this.prisma.workerProfile.findUnique({
      where: { id: dto.workerProfileId },
      include: {
        restaurant: {
          include: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!workerProfile) {
      throw new NotFoundException('Worker profile not found');
    }

    // Get target restaurant
    const targetRestaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.targetRestaurantId },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
        },
      },
    });

    if (!targetRestaurant) {
      throw new NotFoundException('Target restaurant not found');
    }

    // Verify both restaurants are in the same network
    const workerNetworkId = workerProfile.restaurant.memberships[0]?.networkId;
    const targetNetworkId = targetRestaurant.memberships[0]?.networkId;

    if (!workerNetworkId || !targetNetworkId || workerNetworkId !== targetNetworkId) {
      throw new BadRequestException(
        'Both restaurants must be in the same network for cross-training',
      );
    }

    // Cannot cross-train at own restaurant
    if (workerProfile.restaurantId === dto.targetRestaurantId) {
      throw new BadRequestException('Cannot request cross-training at your own restaurant');
    }

    // Check if already cross-trained or pending
    const existingCrossTraining = await this.prisma.crossTraining.findFirst({
      where: {
        workerProfileId: dto.workerProfileId,
        targetRestaurantId: dto.targetRestaurantId,
        status: { in: [CrossTrainingStatus.PENDING, CrossTrainingStatus.APPROVED] },
      },
    });

    if (existingCrossTraining) {
      if (existingCrossTraining.status === CrossTrainingStatus.APPROVED) {
        throw new ConflictException('Already cross-trained at this restaurant');
      }
      throw new ConflictException('Cross-training request already pending');
    }

    // Create cross-training request
    const crossTraining = await this.prisma.crossTraining.create({
      data: {
        workerProfileId: dto.workerProfileId,
        targetRestaurantId: dto.targetRestaurantId,
        positions: dto.positions,
        status: CrossTrainingStatus.PENDING,
        notes: dto.notes,
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
        targetRestaurant: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(
      `Cross-training requested: worker ${dto.workerProfileId} -> restaurant ${dto.targetRestaurantId}`,
    );

    // TODO: Notify target restaurant managers of cross-training request

    return crossTraining;
  }

  /**
   * Approve a cross-training request
   */
  async approveCrossTraining(
    crossTrainingId: string,
    dto: ApproveCrossTrainingDto,
    certifierUserId: string,
    certifierRestaurantId: string,
  ) {
    const crossTraining = await this.prisma.crossTraining.findUnique({
      where: { id: crossTrainingId },
      include: {
        workerProfile: {
          include: { restaurant: true },
        },
        targetRestaurant: true,
      },
    });

    if (!crossTraining) {
      throw new NotFoundException('Cross-training request not found');
    }

    // Verify certifier is from the target restaurant
    if (crossTraining.targetRestaurantId !== certifierRestaurantId) {
      throw new ForbiddenException(
        'Only managers from the target restaurant can approve cross-training',
      );
    }

    if (crossTraining.status !== CrossTrainingStatus.PENDING) {
      throw new BadRequestException('Cross-training request is not pending');
    }

    // If positions provided, use them (can be subset of requested)
    const approvedPositions = dto.positions || crossTraining.positions;

    // Validate positions are valid for the target restaurant
    // (In a real implementation, you might check against restaurant's available positions)

    const updated = await this.prisma.crossTraining.update({
      where: { id: crossTrainingId },
      data: {
        status: CrossTrainingStatus.APPROVED,
        positions: approvedPositions,
        certifiedAt: new Date(),
        certifiedBy: certifierUserId,
        notes: dto.notes || crossTraining.notes,
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
        targetRestaurant: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(
      `Cross-training ${crossTrainingId} approved by user ${certifierUserId}`,
    );

    // TODO: Notify worker of approval

    return updated;
  }

  /**
   * Reject a cross-training request
   */
  async rejectCrossTraining(
    crossTrainingId: string,
    reason: string,
    certifierRestaurantId: string,
  ) {
    const crossTraining = await this.prisma.crossTraining.findUnique({
      where: { id: crossTrainingId },
    });

    if (!crossTraining) {
      throw new NotFoundException('Cross-training request not found');
    }

    if (crossTraining.targetRestaurantId !== certifierRestaurantId) {
      throw new ForbiddenException(
        'Only managers from the target restaurant can reject cross-training',
      );
    }

    if (crossTraining.status !== CrossTrainingStatus.PENDING) {
      throw new BadRequestException('Cross-training request is not pending');
    }

    const updated = await this.prisma.crossTraining.update({
      where: { id: crossTrainingId },
      data: {
        status: CrossTrainingStatus.REJECTED,
        notes: reason,
      },
    });

    this.logger.log(`Cross-training ${crossTrainingId} rejected`);

    // TODO: Notify worker of rejection

    return updated;
  }

  /**
   * Revoke an approved cross-training
   */
  async revokeCrossTraining(
    crossTrainingId: string,
    dto: RevokeCrossTrainingDto,
    revokerRestaurantId: string,
  ) {
    const crossTraining = await this.prisma.crossTraining.findUnique({
      where: { id: crossTrainingId },
      include: {
        workerProfile: {
          include: { restaurant: true },
        },
      },
    });

    if (!crossTraining) {
      throw new NotFoundException('Cross-training not found');
    }

    // Either target restaurant or home restaurant can revoke
    if (
      crossTraining.targetRestaurantId !== revokerRestaurantId &&
      crossTraining.workerProfile.restaurantId !== revokerRestaurantId
    ) {
      throw new ForbiddenException(
        'Only the target or home restaurant can revoke cross-training',
      );
    }

    if (crossTraining.status !== CrossTrainingStatus.APPROVED) {
      throw new BadRequestException('Cross-training is not currently active');
    }

    const updated = await this.prisma.crossTraining.update({
      where: { id: crossTrainingId },
      data: {
        status: CrossTrainingStatus.REVOKED,
        notes: dto.reason,
      },
    });

    this.logger.log(`Cross-training ${crossTrainingId} revoked: ${dto.reason}`);

    // TODO: Notify worker of revocation

    return updated;
  }

  /**
   * Get cross-training by ID
   */
  async getCrossTrainingById(id: string) {
    const crossTraining = await this.prisma.crossTraining.findUnique({
      where: { id },
      include: {
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
        targetRestaurant: {
          select: { id: true, name: true },
        },
      },
    });

    if (!crossTraining) {
      throw new NotFoundException('Cross-training not found');
    }

    return crossTraining;
  }

  /**
   * Get all cross-trainings for a worker
   */
  async getWorkerCrossTrainings(workerProfileId: string, status?: CrossTrainingStatus) {
    return this.prisma.crossTraining.findMany({
      where: {
        workerProfileId,
        ...(status && { status }),
      },
      include: {
        targetRestaurant: {
          select: { id: true, name: true, city: true, state: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all cross-trained workers for a restaurant
   */
  async getRestaurantCrossTrainedWorkers(
    restaurantId: string,
    status?: CrossTrainingStatus,
  ) {
    return this.prisma.crossTraining.findMany({
      where: {
        targetRestaurantId: restaurantId,
        ...(status && { status }),
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { certifiedAt: 'desc' },
    });
  }

  /**
   * Get pending cross-training requests for a restaurant (to review)
   */
  async getPendingCrossTrainingRequests(restaurantId: string) {
    return this.prisma.crossTraining.findMany({
      where: {
        targetRestaurantId: restaurantId,
        status: CrossTrainingStatus.PENDING,
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Check if a worker is cross-trained at a specific restaurant
   */
  async isWorkerCrossTrainedAt(
    workerProfileId: string,
    restaurantId: string,
    position?: string,
  ): Promise<boolean> {
    const crossTraining = await this.prisma.crossTraining.findFirst({
      where: {
        workerProfileId,
        targetRestaurantId: restaurantId,
        status: CrossTrainingStatus.APPROVED,
        ...(position && { positions: { has: position } }),
      },
    });

    return !!crossTraining;
  }

  /**
   * Get all restaurants where a worker is cross-trained
   */
  async getWorkerCrossTrainedRestaurants(workerProfileId: string) {
    const crossTrainings = await this.prisma.crossTraining.findMany({
      where: {
        workerProfileId,
        status: CrossTrainingStatus.APPROVED,
      },
      include: {
        targetRestaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            lat: true,
            lng: true,
          },
        },
      },
    });

    return crossTrainings.map((ct) => ({
      ...ct.targetRestaurant,
      positions: ct.positions,
      certifiedAt: ct.certifiedAt,
    }));
  }

  /**
   * Query cross-trainings with filters
   */
  async queryCrossTrainings(query: QueryCrossTrainingDto) {
    return this.prisma.crossTraining.findMany({
      where: {
        ...(query.workerProfileId && { workerProfileId: query.workerProfileId }),
        ...(query.targetRestaurantId && { targetRestaurantId: query.targetRestaurantId }),
        ...(query.status && { status: query.status }),
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            restaurant: {
              select: { id: true, name: true },
            },
          },
        },
        targetRestaurant: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
