import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ShiftStateMachine } from '@/modules/scheduling/services/shift-state-machine.service';
import { ShiftMatcherService } from './shift-matcher.service';

/**
 * Swaps Service
 *
 * Handles shift swap workflows:
 * 1. Direct swap: Worker A offers shift to Worker B directly
 * 2. Pool drop: Worker releases shift to pool for anyone to claim
 * 3. Trade: Worker A trades their Monday for Worker B's Tuesday
 *
 * Approval rules:
 * - Same position swaps may auto-approve
 * - Cross-restaurant swaps require manager approval
 * - High-reputation workers may auto-approve
 */
@Injectable()
export class SwapsService {
  private readonly logger = new Logger(SwapsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stateMachine: ShiftStateMachine,
    private readonly matcher: ShiftMatcherService,
  ) {}

  /**
   * Create a swap request
   */
  async createSwap(
    sourceShiftId: string,
    sourceWorkerId: string,
    options: {
      targetWorkerId?: string;
      targetShiftId?: string;
      message?: string;
      expiresInHours?: number;
    },
  ) {
    const sourceShift = await this.prisma.shift.findUnique({
      where: { id: sourceShiftId },
      include: { restaurant: true },
    });

    if (!sourceShift) {
      throw new NotFoundException('Source shift not found');
    }

    if (sourceShift.assignedToId !== sourceWorkerId) {
      throw new BadRequestException('You are not assigned to this shift');
    }

    // Validate target worker if specified
    if (options.targetWorkerId) {
      const targetWorker = await this.prisma.workerProfile.findUnique({
        where: { id: options.targetWorkerId },
      });

      if (!targetWorker) {
        throw new NotFoundException('Target worker not found');
      }

      // Check if target is qualified
      if (!targetWorker.positions.includes(sourceShift.position)) {
        throw new BadRequestException(
          'Target worker is not qualified for this position',
        );
      }

      // Check availability
      const isAvailable = await this.matcher.isWorkerAvailable(
        options.targetWorkerId,
        new Date(sourceShift.startTime),
        new Date(sourceShift.endTime),
      );

      if (!isAvailable) {
        throw new BadRequestException(
          'Target worker has a scheduling conflict',
        );
      }
    }

    // Validate target shift if specified (trade)
    if (options.targetShiftId) {
      const targetShift = await this.prisma.shift.findUnique({
        where: { id: options.targetShiftId },
      });

      if (!targetShift) {
        throw new NotFoundException('Target shift not found');
      }

      if (!targetShift.assignedToId) {
        throw new BadRequestException('Target shift is not assigned');
      }

      // Check if source worker is qualified for target shift
      const sourceWorker = await this.prisma.workerProfile.findUnique({
        where: { id: sourceWorkerId },
      });

      if (!sourceWorker?.positions.includes(targetShift.position)) {
        throw new BadRequestException(
          'You are not qualified for the target shift position',
        );
      }
    }

    // Determine if approval is required
    const sourceWorker = await this.prisma.workerProfile.findUnique({
      where: { id: sourceWorkerId },
      include: { restaurant: true },
    });

    const isCrossRestaurant =
      options.targetWorkerId &&
      (await this.prisma.workerProfile.findUnique({
        where: { id: options.targetWorkerId },
      }))?.restaurantId !== sourceShift.restaurantId;

    const requiresApproval =
      isCrossRestaurant ||
      !sourceShift.restaurant.allowCrossRestaurantSwaps ||
      Number(sourceWorker?.reliabilityScore || 0) < Number(sourceShift.restaurant.autoApproveThreshold);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (options.expiresInHours || 48));

    const swap = await this.prisma.shiftSwap.create({
      data: {
        sourceShiftId,
        sourceWorkerId,
        targetShiftId: options.targetShiftId,
        targetWorkerId: options.targetWorkerId,
        message: options.message,
        requiresApproval,
        expiresAt,
      },
      include: {
        sourceShift: {
          include: {
            restaurant: { select: { id: true, name: true } },
          },
        },
        targetShift: true,
        sourceWorker: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        targetWorker: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    this.logger.log(`Swap request created: ${swap.id}`);

    // TODO: Notify target worker or manager

    return swap;
  }

  /**
   * Drop shift to pool (anyone can claim)
   */
  async dropToPool(shiftId: string, workerId: string, reason?: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    if (shift.assignedToId !== workerId) {
      throw new BadRequestException('You are not assigned to this shift');
    }

    await this.stateMachine.releaseToPool(shiftId, workerId, reason || 'Dropped to pool');

    // Invalidate cache
    await this.redis.invalidateShiftCache(shift.restaurantId);

    this.logger.log(`Shift ${shiftId} dropped to pool by ${workerId}`);

    return this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        restaurant: { select: { id: true, name: true, timezone: true } },
      },
    });
  }

  /**
   * Respond to a swap request (accept/decline)
   */
  async respondToSwap(
    swapId: string,
    targetWorkerId: string,
    accepted: boolean,
    message?: string,
  ) {
    const swap = await this.prisma.shiftSwap.findUnique({
      where: { id: swapId },
      include: {
        sourceShift: { include: { restaurant: true } },
        targetShift: true,
      },
    });

    if (!swap) {
      throw new NotFoundException('Swap request not found');
    }

    if (swap.targetWorkerId !== targetWorkerId) {
      throw new BadRequestException('This swap request is not for you');
    }

    if (swap.status !== 'PENDING') {
      throw new BadRequestException('Swap has already been resolved');
    }

    if (!accepted) {
      await this.prisma.shiftSwap.update({
        where: { id: swapId },
        data: {
          status: 'REJECTED',
          resolvedAt: new Date(),
        },
      });

      this.logger.log(`Swap ${swapId} declined`);

      // TODO: Notify source worker

      return this.getSwap(swapId);
    }

    // If requires approval, mark as accepted pending manager approval
    if (swap.requiresApproval) {
      await this.prisma.shiftSwap.update({
        where: { id: swapId },
        data: {
          status: 'ACCEPTED',
        },
      });

      // TODO: Notify manager

      return this.getSwap(swapId);
    }

    // Auto-approve and execute swap
    return this.executeSwap(swapId, 'SYSTEM');
  }

  /**
   * Manager approves a swap
   */
  async approveSwap(swapId: string, approvedByUserId: string) {
    const swap = await this.prisma.shiftSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      throw new NotFoundException('Swap not found');
    }

    if (swap.status !== 'PENDING' && swap.status !== 'ACCEPTED') {
      throw new BadRequestException('Swap cannot be approved in current state');
    }

    await this.prisma.shiftSwap.update({
      where: { id: swapId },
      data: {
        managerApproved: true,
        approvedById: approvedByUserId,
      },
    });

    return this.executeSwap(swapId, approvedByUserId);
  }

  /**
   * Manager rejects a swap
   */
  async rejectSwap(swapId: string, rejectedByUserId: string, reason?: string) {
    const swap = await this.prisma.shiftSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      throw new NotFoundException('Swap not found');
    }

    if (swap.status !== 'PENDING' && swap.status !== 'ACCEPTED') {
      throw new BadRequestException('Swap cannot be rejected in current state');
    }

    await this.prisma.shiftSwap.update({
      where: { id: swapId },
      data: {
        status: 'REJECTED',
        managerApproved: false,
        approvedById: rejectedByUserId,
        resolvedAt: new Date(),
      },
    });

    this.logger.log(`Swap ${swapId} rejected by manager`);

    // TODO: Notify workers

    return this.getSwap(swapId);
  }

  /**
   * Execute the swap (reassign shifts)
   */
  private async executeSwap(swapId: string, executedBy: string) {
    const swap = await this.prisma.shiftSwap.findUnique({
      where: { id: swapId },
      include: {
        sourceShift: true,
        targetShift: true,
      },
    });

    if (!swap) {
      throw new NotFoundException('Swap not found');
    }

    // Direct swap: assign source shift to target worker
    if (swap.targetWorkerId && !swap.targetShiftId) {
      await this.prisma.shift.update({
        where: { id: swap.sourceShiftId },
        data: { assignedToId: swap.targetWorkerId },
      });
    }

    // Trade: swap both shifts
    if (swap.targetShiftId && swap.targetWorkerId) {
      const targetShift = swap.targetShift!;

      await this.prisma.$transaction([
        this.prisma.shift.update({
          where: { id: swap.sourceShiftId },
          data: { assignedToId: swap.targetWorkerId },
        }),
        this.prisma.shift.update({
          where: { id: swap.targetShiftId },
          data: { assignedToId: swap.sourceWorkerId },
        }),
      ]);
    }

    // Update swap status
    await this.prisma.shiftSwap.update({
      where: { id: swapId },
      data: {
        status: 'ACCEPTED',
        resolvedAt: new Date(),
      },
    });

    // Invalidate caches
    if (swap.sourceShift) {
      await this.redis.invalidateShiftCache(swap.sourceShift.restaurantId);
    }
    if (swap.targetShift) {
      await this.redis.invalidateShiftCache(swap.targetShift.restaurantId);
    }

    this.logger.log(`Swap ${swapId} executed successfully`);

    // TODO: Notify both workers

    return this.getSwap(swapId);
  }

  /**
   * Cancel a swap request
   */
  async cancelSwap(swapId: string, cancelledByWorkerId: string) {
    const swap = await this.prisma.shiftSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      throw new NotFoundException('Swap not found');
    }

    if (swap.sourceWorkerId !== cancelledByWorkerId) {
      throw new BadRequestException('You can only cancel your own swap requests');
    }

    if (swap.status !== 'PENDING') {
      throw new BadRequestException('Swap cannot be cancelled in current state');
    }

    await this.prisma.shiftSwap.update({
      where: { id: swapId },
      data: {
        status: 'CANCELLED',
        resolvedAt: new Date(),
      },
    });

    this.logger.log(`Swap ${swapId} cancelled`);

    return this.getSwap(swapId);
  }

  /**
   * Get swap by ID
   */
  async getSwap(swapId: string) {
    return this.prisma.shiftSwap.findUnique({
      where: { id: swapId },
      include: {
        sourceShift: {
          include: {
            restaurant: { select: { id: true, name: true, timezone: true } },
          },
        },
        targetShift: {
          include: {
            restaurant: { select: { id: true, name: true, timezone: true } },
          },
        },
        sourceWorker: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        targetWorker: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get swaps for a worker
   */
  async getSwapsForWorker(workerProfileId: string, status?: string) {
    return this.prisma.shiftSwap.findMany({
      where: {
        OR: [
          { sourceWorkerId: workerProfileId },
          { targetWorkerId: workerProfileId },
        ],
        ...(status && { status }),
      },
      include: {
        sourceShift: {
          include: {
            restaurant: { select: { id: true, name: true, timezone: true } },
          },
        },
        targetShift: true,
        sourceWorker: {
          include: {
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        targetWorker: {
          include: {
            user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending swaps for a restaurant (manager view)
   */
  async getPendingSwapsForRestaurant(restaurantId: string) {
    return this.prisma.shiftSwap.findMany({
      where: {
        status: { in: ['PENDING', 'ACCEPTED'] },
        requiresApproval: true,
        sourceShift: { restaurantId },
      },
      include: {
        sourceShift: {
          select: {
            id: true,
            position: true,
            startTime: true,
            endTime: true,
          },
        },
        targetShift: {
          select: {
            id: true,
            position: true,
            startTime: true,
            endTime: true,
          },
        },
        sourceWorker: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        targetWorker: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
