import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ShiftStatus, SHIFT_TRANSITIONS } from '@restaurant-scheduler/shared';

/**
 * Shift State Machine Service
 *
 * Manages shift lifecycle transitions with validation and audit logging.
 *
 * State Diagram:
 * ```
 * DRAFT → PUBLISHED_UNASSIGNED → PUBLISHED_CLAIMED → CONFIRMED → IN_PROGRESS → COMPLETED
 *              ↓                      ↓
 *       PUBLISHED_OFFERED      (swap/trade flows)
 *              ↓
 *        back to pool
 * ```
 *
 * Each transition is validated against allowed transitions and business rules.
 */
@Injectable()
export class ShiftStateMachine {
  private readonly logger = new Logger(ShiftStateMachine.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a transition is valid
   */
  canTransition(fromStatus: ShiftStatus, toStatus: ShiftStatus): boolean {
    const allowedTransitions = SHIFT_TRANSITIONS[fromStatus];
    return allowedTransitions?.includes(toStatus) ?? false;
  }

  /**
   * Transition a shift to a new status with validation
   */
  async transition(
    shiftId: string,
    toStatus: ShiftStatus,
    changedBy?: string,
    reason?: string,
  ): Promise<void> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    const fromStatus = shift.status as ShiftStatus;

    if (!this.canTransition(fromStatus, toStatus)) {
      throw new BadRequestException(
        `Invalid transition: ${fromStatus} → ${toStatus}. ` +
          `Allowed: ${SHIFT_TRANSITIONS[fromStatus]?.join(', ') || 'none'}`,
      );
    }

    // Apply transition-specific validation
    await this.validateTransition(shift, fromStatus, toStatus);

    // Update shift status and record history
    await this.prisma.$transaction([
      this.prisma.shift.update({
        where: { id: shiftId },
        data: { status: toStatus },
      }),
      this.prisma.shiftStatusHistory.create({
        data: {
          shiftId,
          fromStatus,
          toStatus,
          changedBy: changedBy || 'SYSTEM',
          reason,
        },
      }),
    ]);

    this.logger.log(
      `Shift ${shiftId} transitioned: ${fromStatus} → ${toStatus}` +
        (reason ? ` (${reason})` : ''),
    );
  }

  /**
   * Validate transition-specific business rules
   */
  private async validateTransition(
    shift: any,
    fromStatus: ShiftStatus,
    toStatus: ShiftStatus,
  ): Promise<void> {
    switch (toStatus) {
      case ShiftStatus.PUBLISHED_UNASSIGNED:
        // Can't publish if start time is in the past
        if (new Date(shift.startTime) < new Date()) {
          throw new BadRequestException('Cannot publish a shift that starts in the past');
        }
        break;

      case ShiftStatus.CONFIRMED:
        // Must have an assigned worker
        if (!shift.assignedToId) {
          throw new BadRequestException('Cannot confirm shift without an assigned worker');
        }
        break;

      case ShiftStatus.IN_PROGRESS:
        // Must have an assigned worker
        if (!shift.assignedToId) {
          throw new BadRequestException('Cannot start shift without an assigned worker');
        }
        // Shift must be within reasonable time window (2 hours before to end time)
        const now = new Date();
        const shiftStart = new Date(shift.startTime);
        const shiftEnd = new Date(shift.endTime);
        const twoHoursBefore = new Date(shiftStart.getTime() - 2 * 60 * 60 * 1000);

        if (now < twoHoursBefore) {
          throw new BadRequestException(
            'Cannot start shift more than 2 hours before scheduled time',
          );
        }
        if (now > shiftEnd) {
          throw new BadRequestException('Cannot start a shift that has already ended');
        }
        break;

      case ShiftStatus.COMPLETED:
        // Shift must have started
        if (fromStatus !== ShiftStatus.IN_PROGRESS) {
          throw new BadRequestException('Shift must be in progress to complete');
        }
        break;

      case ShiftStatus.NO_SHOW:
        // Must have had an assigned worker
        if (!shift.assignedToId) {
          throw new BadRequestException('Cannot mark no-show without an assigned worker');
        }
        break;
    }
  }

  /**
   * Publish a draft shift
   */
  async publish(shiftId: string, changedBy: string): Promise<void> {
    await this.transition(shiftId, ShiftStatus.PUBLISHED_UNASSIGNED, changedBy, 'Published');
  }

  /**
   * Assign a worker to a shift
   */
  async assign(shiftId: string, workerId: string, changedBy: string): Promise<void> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    // Update assignment and status
    await this.prisma.$transaction([
      this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          assignedToId: workerId,
          status: ShiftStatus.PUBLISHED_CLAIMED,
        },
      }),
      this.prisma.shiftStatusHistory.create({
        data: {
          shiftId,
          fromStatus: shift.status,
          toStatus: ShiftStatus.PUBLISHED_CLAIMED,
          changedBy,
          reason: `Assigned to worker ${workerId}`,
        },
      }),
    ]);
  }

  /**
   * Confirm a claimed shift
   */
  async confirm(shiftId: string, changedBy: string): Promise<void> {
    await this.transition(shiftId, ShiftStatus.CONFIRMED, changedBy, 'Confirmed');
  }

  /**
   * Release a shift back to the pool
   */
  async releaseToPool(shiftId: string, changedBy: string, reason?: string): Promise<void> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new BadRequestException('Shift not found');
    }

    // Clear assignment and return to unassigned
    await this.prisma.$transaction([
      this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          assignedToId: null,
          status: ShiftStatus.PUBLISHED_UNASSIGNED,
        },
      }),
      this.prisma.shiftStatusHistory.create({
        data: {
          shiftId,
          fromStatus: shift.status,
          toStatus: ShiftStatus.PUBLISHED_UNASSIGNED,
          changedBy,
          reason: reason || 'Released to pool',
        },
      }),
    ]);
  }

  /**
   * Start a shift (clock in)
   */
  async start(shiftId: string, changedBy: string): Promise<void> {
    await this.transition(shiftId, ShiftStatus.IN_PROGRESS, changedBy, 'Clocked in');
  }

  /**
   * Complete a shift (clock out)
   */
  async complete(shiftId: string, changedBy: string): Promise<void> {
    await this.transition(shiftId, ShiftStatus.COMPLETED, changedBy, 'Completed');
  }

  /**
   * Mark shift as no-show
   */
  async markNoShow(shiftId: string, changedBy: string): Promise<void> {
    await this.transition(shiftId, ShiftStatus.NO_SHOW, changedBy, 'No-show');
  }

  /**
   * Cancel a shift
   */
  async cancel(shiftId: string, changedBy: string, reason?: string): Promise<void> {
    await this.transition(
      shiftId,
      ShiftStatus.CANCELLED,
      changedBy,
      reason || 'Cancelled',
    );
  }

  /**
   * Get shift history
   */
  async getHistory(shiftId: string) {
    return this.prisma.shiftStatusHistory.findMany({
      where: { shiftId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
