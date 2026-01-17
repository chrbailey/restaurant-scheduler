import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ShiftStateMachine } from '@/modules/scheduling/services/shift-state-machine.service';
import { ShiftMatcherService } from './shift-matcher.service';
import { ShiftStatus } from '@restaurant-scheduler/shared';

/**
 * Claims Service
 *
 * Handles shift claiming workflow:
 * 1. Worker claims open shift
 * 2. System calculates priority score
 * 3. If auto-approve enabled and worker meets threshold, approve immediately
 * 4. Otherwise, manager reviews and approves/rejects
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stateMachine: ShiftStateMachine,
    private readonly matcher: ShiftMatcherService,
  ) {}

  /**
   * Claim a shift
   */
  async claim(
    shiftId: string,
    workerProfileId: string,
    notes?: string,
  ) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { restaurant: true },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    if (shift.status !== ShiftStatus.PUBLISHED_UNASSIGNED) {
      throw new BadRequestException('Shift is not available for claiming');
    }

    // Check if already claimed by this worker
    const existingClaim = await this.prisma.shiftClaim.findUnique({
      where: {
        shiftId_workerProfileId: {
          shiftId,
          workerProfileId,
        },
      },
    });

    if (existingClaim) {
      throw new ConflictException('You have already claimed this shift');
    }

    // Verify worker is qualified
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
    });

    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    if (!worker.positions.includes(shift.position)) {
      throw new BadRequestException(
        `You are not qualified for position: ${shift.position}`,
      );
    }

    // Check minimum reputation if set
    if (
      shift.minReputationScore &&
      Number(worker.reliabilityScore) < Number(shift.minReputationScore)
    ) {
      throw new BadRequestException(
        'You do not meet the minimum reputation requirement for this shift',
      );
    }

    // Check availability
    const isAvailable = await this.matcher.isWorkerAvailable(
      workerProfileId,
      new Date(shift.startTime),
      new Date(shift.endTime),
    );

    if (!isAvailable) {
      throw new BadRequestException(
        'You have a scheduling conflict for this shift',
      );
    }

    // Calculate priority score
    const priorityScore = await this.matcher.calculateClaimPriority(
      shiftId,
      workerProfileId,
    );

    // Create claim
    const claim = await this.prisma.shiftClaim.create({
      data: {
        shiftId,
        workerProfileId,
        priorityScore,
        notes,
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Check for auto-approval
    const shouldAutoApprove =
      shift.autoApprove &&
      worker.restaurantId === shift.restaurantId &&
      Number(worker.reliabilityScore) >= Number(shift.restaurant.autoApproveThreshold);

    if (shouldAutoApprove) {
      return this.approveClaim(claim.id, 'SYSTEM');
    }

    // Invalidate cache
    await this.redis.invalidateShiftCache(shift.restaurantId);

    this.logger.log(
      `Shift ${shiftId} claimed by worker ${workerProfileId} (priority: ${priorityScore})`,
    );

    // TODO: Notify manager of pending claim

    return claim;
  }

  /**
   * Approve a claim
   */
  async approveClaim(claimId: string, resolvedByUserId: string) {
    const claim = await this.prisma.shiftClaim.findUnique({
      where: { id: claimId },
      include: {
        shift: {
          include: { restaurant: true },
        },
        workerProfile: {
          include: { user: true },
        },
      },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.status !== 'PENDING') {
      throw new BadRequestException('Claim has already been resolved');
    }

    // Update claim status
    await this.prisma.shiftClaim.update({
      where: { id: claimId },
      data: {
        status: 'APPROVED',
        resolvedAt: new Date(),
        resolvedById: resolvedByUserId === 'SYSTEM' ? null : resolvedByUserId,
      },
    });

    // Reject all other claims for this shift
    await this.prisma.shiftClaim.updateMany({
      where: {
        shiftId: claim.shiftId,
        id: { not: claimId },
        status: 'PENDING',
      },
      data: {
        status: 'REJECTED',
        rejectionReason: 'Another claim was approved',
        resolvedAt: new Date(),
      },
    });

    // Assign shift to worker
    await this.stateMachine.assign(
      claim.shiftId,
      claim.workerProfileId,
      resolvedByUserId,
    );

    // Auto-confirm if it's the same restaurant
    if (claim.workerProfile.restaurantId === claim.shift.restaurantId) {
      await this.stateMachine.confirm(claim.shiftId, resolvedByUserId);
    }

    // Invalidate cache
    await this.redis.invalidateShiftCache(claim.shift.restaurantId);

    this.logger.log(
      `Claim ${claimId} approved for shift ${claim.shiftId}`,
    );

    // TODO: Notify worker of approval
    // TODO: Notify other claimants of rejection

    return this.prisma.shiftClaim.findUnique({
      where: { id: claimId },
      include: {
        shift: true,
        workerProfile: {
          include: { user: true },
        },
      },
    });
  }

  /**
   * Reject a claim
   */
  async rejectClaim(claimId: string, resolvedByUserId: string, reason?: string) {
    const claim = await this.prisma.shiftClaim.findUnique({
      where: { id: claimId },
      include: {
        shift: {
          include: { restaurant: true },
        },
      },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.status !== 'PENDING') {
      throw new BadRequestException('Claim has already been resolved');
    }

    await this.prisma.shiftClaim.update({
      where: { id: claimId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || 'Rejected by manager',
        resolvedAt: new Date(),
        resolvedById: resolvedByUserId,
      },
    });

    this.logger.log(`Claim ${claimId} rejected`);

    // TODO: Notify worker

    return this.prisma.shiftClaim.findUnique({
      where: { id: claimId },
      include: {
        shift: true,
        workerProfile: {
          include: { user: true },
        },
      },
    });
  }

  /**
   * Withdraw a claim
   */
  async withdrawClaim(claimId: string, workerProfileId: string) {
    const claim = await this.prisma.shiftClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.workerProfileId !== workerProfileId) {
      throw new BadRequestException('You can only withdraw your own claims');
    }

    if (claim.status !== 'PENDING') {
      throw new BadRequestException('Claim has already been resolved');
    }

    await this.prisma.shiftClaim.delete({
      where: { id: claimId },
    });

    this.logger.log(`Claim ${claimId} withdrawn`);

    return { success: true };
  }

  /**
   * Get pending claims for a shift
   */
  async getClaimsForShift(shiftId: string) {
    return this.prisma.shiftClaim.findMany({
      where: { shiftId },
      include: {
        workerProfile: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { priorityScore: 'desc' },
    });
  }

  /**
   * Get claims by worker
   */
  async getClaimsByWorker(workerProfileId: string, status?: string) {
    return this.prisma.shiftClaim.findMany({
      where: {
        workerProfileId,
        ...(status && { status }),
      },
      include: {
        shift: {
          include: {
            restaurant: {
              select: { id: true, name: true, timezone: true },
            },
          },
        },
      },
      orderBy: { claimedAt: 'desc' },
    });
  }

  /**
   * Get pending claims for a restaurant (manager view)
   */
  async getPendingClaimsForRestaurant(restaurantId: string) {
    return this.prisma.shiftClaim.findMany({
      where: {
        status: 'PENDING',
        shift: { restaurantId },
      },
      include: {
        shift: {
          select: {
            id: true,
            position: true,
            startTime: true,
            endTime: true,
          },
        },
        workerProfile: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: [
        { shift: { startTime: 'asc' } },
        { priorityScore: 'desc' },
      ],
    });
  }
}
