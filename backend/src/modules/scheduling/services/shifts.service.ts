import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ShiftStateMachine } from './shift-state-machine.service';
import { ShiftStatus, ShiftType, Position } from '@restaurant-scheduler/shared';

interface CreateShiftData {
  restaurantId: string;
  position: string;
  startTime: Date;
  endTime: Date;
  breakMinutes?: number;
  notes?: string;
  autoApprove?: boolean;
  minReputationScore?: number;
  hourlyRateOverride?: number;
  type?: string;
}

interface ListShiftsOptions {
  restaurantId?: string;
  status?: string[];
  position?: string[];
  workerId?: string;
  startDate?: Date;
  endDate?: Date;
  includeNetwork?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stateMachine: ShiftStateMachine,
  ) {}

  /**
   * Create a new shift (as draft)
   */
  async create(createdByUserId: string, data: CreateShiftData) {
    // Validate times
    if (data.startTime >= data.endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (data.startTime < new Date()) {
      throw new BadRequestException('Cannot create a shift in the past');
    }

    // Validate position
    if (!Object.values(Position).includes(data.position as Position)) {
      throw new BadRequestException(`Invalid position: ${data.position}`);
    }

    const shift = await this.prisma.shift.create({
      data: {
        restaurantId: data.restaurantId,
        position: data.position,
        startTime: data.startTime,
        endTime: data.endTime,
        breakMinutes: data.breakMinutes || 0,
        notes: data.notes,
        autoApprove: data.autoApprove || false,
        minReputationScore: data.minReputationScore,
        hourlyRateOverride: data.hourlyRateOverride,
        type: data.type || ShiftType.DINE_IN,
        status: ShiftStatus.DRAFT,
        createdById: createdByUserId,
      },
      include: {
        restaurant: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });

    // Record initial status in history
    await this.prisma.shiftStatusHistory.create({
      data: {
        shiftId: shift.id,
        fromStatus: 'NONE',
        toStatus: ShiftStatus.DRAFT,
        changedBy: createdByUserId,
        reason: 'Created',
      },
    });

    return shift;
  }

  /**
   * Create multiple shifts at once (bulk creation)
   */
  async createBulk(createdByUserId: string, restaurantId: string, shifts: CreateShiftData[]) {
    const created = await Promise.all(
      shifts.map((shift) =>
        this.create(createdByUserId, { ...shift, restaurantId }),
      ),
    );
    return created;
  }

  /**
   * Get a shift by ID
   */
  async findById(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            timezone: true,
            networkId: true,
          },
        },
        assignedTo: {
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
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        claims: {
          where: { status: 'PENDING' },
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
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    return shift;
  }

  /**
   * List shifts with filtering
   */
  async findMany(options: ListShiftsOptions) {
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (options.restaurantId) {
      where.restaurantId = options.restaurantId;
    }

    if (options.status && options.status.length > 0) {
      where.status = { in: options.status };
    }

    if (options.position && options.position.length > 0) {
      where.position = { in: options.position };
    }

    if (options.workerId) {
      where.assignedToId = options.workerId;
    }

    if (options.startDate || options.endDate) {
      where.startTime = {};
      if (options.startDate) {
        where.startTime.gte = options.startDate;
      }
      if (options.endDate) {
        where.startTime.lte = options.endDate;
      }
    }

    const [shifts, total] = await Promise.all([
      this.prisma.shift.findMany({
        where,
        include: {
          restaurant: {
            select: { id: true, name: true, timezone: true },
          },
          assignedTo: {
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
        orderBy: { startTime: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.shift.count({ where }),
    ]);

    return {
      data: shifts,
      meta: {
        page,
        pageSize,
        total,
        hasMore: skip + shifts.length < total,
      },
    };
  }

  /**
   * Get shifts for a specific week (schedule view)
   */
  async getWeekSchedule(
    restaurantId: string,
    weekStart: Date,
    includeNetwork = false,
  ) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const where: any = {
      startTime: { gte: weekStart, lt: weekEnd },
      status: { not: ShiftStatus.CANCELLED },
    };

    if (includeNetwork) {
      // Get the restaurant's network
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { networkId: true },
      });

      if (restaurant?.networkId) {
        // Get all restaurants in the network
        const networkRestaurants = await this.prisma.restaurant.findMany({
          where: { networkId: restaurant.networkId },
          select: { id: true },
        });

        where.restaurantId = { in: networkRestaurants.map((r) => r.id) };
      } else {
        where.restaurantId = restaurantId;
      }
    } else {
      where.restaurantId = restaurantId;
    }

    const shifts = await this.prisma.shift.findMany({
      where,
      include: {
        restaurant: {
          select: { id: true, name: true, timezone: true },
        },
        assignedTo: {
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
      orderBy: [{ startTime: 'asc' }, { position: 'asc' }],
    });

    // Group by day
    const byDay: Record<string, typeof shifts> = {};
    for (const shift of shifts) {
      const day = new Date(shift.startTime).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(shift);
    }

    return byDay;
  }

  /**
   * Update a shift
   */
  async update(
    shiftId: string,
    data: {
      position?: string;
      startTime?: Date;
      endTime?: Date;
      breakMinutes?: number;
      notes?: string;
      autoApprove?: boolean;
      minReputationScore?: number;
      hourlyRateOverride?: number;
    },
  ) {
    const shift = await this.findById(shiftId);

    // Can only update draft or published_unassigned shifts
    if (![ShiftStatus.DRAFT, ShiftStatus.PUBLISHED_UNASSIGNED].includes(shift.status as ShiftStatus)) {
      throw new BadRequestException('Can only update draft or unassigned shifts');
    }

    // Validate times if changed
    const startTime = data.startTime || new Date(shift.startTime);
    const endTime = data.endTime || new Date(shift.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    return this.prisma.shift.update({
      where: { id: shiftId },
      data,
      include: {
        restaurant: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });
  }

  /**
   * Publish multiple shifts
   */
  async publishMany(shiftIds: string[], publishedByUserId: string) {
    const results = await Promise.allSettled(
      shiftIds.map((id) => this.stateMachine.publish(id, publishedByUserId)),
    );

    const published: string[] = [];
    const failed: { id: string; error: string }[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        published.push(shiftIds[index]);
      } else {
        failed.push({
          id: shiftIds[index],
          error: result.reason?.message || 'Unknown error',
        });
      }
    });

    // Invalidate cache
    if (published.length > 0) {
      const shift = await this.findById(published[0]);
      await this.redis.invalidateShiftCache(shift.restaurantId);
    }

    return { published, failed };
  }

  /**
   * Assign a worker to a shift
   */
  async assignWorker(
    shiftId: string,
    workerId: string,
    assignedByUserId: string,
    notify = true,
  ) {
    const shift = await this.findById(shiftId);

    // Validate worker is qualified
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: { user: true },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    if (!worker.positions.includes(shift.position)) {
      throw new BadRequestException(
        `Worker is not qualified for position: ${shift.position}`,
      );
    }

    if (worker.status !== 'ACTIVE') {
      throw new BadRequestException('Worker profile is not active');
    }

    // Check for conflicting shifts
    const conflict = await this.prisma.shift.findFirst({
      where: {
        assignedToId: workerId,
        status: { in: [ShiftStatus.CONFIRMED, ShiftStatus.IN_PROGRESS] },
        OR: [
          {
            startTime: { lte: shift.startTime },
            endTime: { gt: shift.startTime },
          },
          {
            startTime: { lt: shift.endTime },
            endTime: { gte: shift.endTime },
          },
        ],
      },
    });

    if (conflict) {
      throw new BadRequestException('Worker has a conflicting shift');
    }

    await this.stateMachine.assign(shiftId, workerId, assignedByUserId);

    // Invalidate cache
    await this.redis.invalidateShiftCache(shift.restaurantId);

    // TODO: Send notification if notify = true

    return this.findById(shiftId);
  }

  /**
   * Confirm a claimed shift
   */
  async confirm(shiftId: string, confirmedByUserId: string) {
    await this.stateMachine.confirm(shiftId, confirmedByUserId);
    return this.findById(shiftId);
  }

  /**
   * Release shift back to pool
   */
  async releaseToPool(shiftId: string, releasedByUserId: string, reason?: string) {
    const shift = await this.findById(shiftId);
    await this.stateMachine.releaseToPool(shiftId, releasedByUserId, reason);
    await this.redis.invalidateShiftCache(shift.restaurantId);
    return this.findById(shiftId);
  }

  /**
   * Clock in (start shift)
   */
  async clockIn(shiftId: string, workerId: string) {
    const shift = await this.findById(shiftId);

    if (shift.assignedToId !== workerId) {
      throw new ForbiddenException('You are not assigned to this shift');
    }

    await this.stateMachine.start(shiftId, workerId);
    return this.findById(shiftId);
  }

  /**
   * Clock out (complete shift)
   */
  async clockOut(shiftId: string, workerId: string) {
    const shift = await this.findById(shiftId);

    if (shift.assignedToId !== workerId) {
      throw new ForbiddenException('You are not assigned to this shift');
    }

    await this.stateMachine.complete(shiftId, workerId);

    // Update worker stats
    await this.prisma.workerProfile.update({
      where: { id: workerId },
      data: {
        shiftsCompleted: { increment: 1 },
        lastShiftAt: new Date(),
      },
    });

    return this.findById(shiftId);
  }

  /**
   * Mark as no-show
   */
  async markNoShow(shiftId: string, markedByUserId: string) {
    const shift = await this.findById(shiftId);

    await this.stateMachine.markNoShow(shiftId, markedByUserId);

    // Update worker stats
    if (shift.assignedToId) {
      await this.prisma.workerProfile.update({
        where: { id: shift.assignedToId },
        data: {
          noShowCount: { increment: 1 },
        },
      });
    }

    return this.findById(shiftId);
  }

  /**
   * Cancel a shift
   */
  async cancel(shiftId: string, cancelledByUserId: string, reason?: string) {
    const shift = await this.findById(shiftId);
    await this.stateMachine.cancel(shiftId, cancelledByUserId, reason);
    await this.redis.invalidateShiftCache(shift.restaurantId);
    return this.findById(shiftId);
  }

  /**
   * Get coverage gaps (open shifts)
   */
  async getCoverageGaps(restaurantId: string, startDate: Date, endDate: Date) {
    const openShifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        startTime: { gte: startDate, lte: endDate },
        status: { in: [ShiftStatus.PUBLISHED_UNASSIGNED, ShiftStatus.PUBLISHED_OFFERED] },
      },
      orderBy: { startTime: 'asc' },
    });

    // Group by position and count
    const byPosition: Record<string, number> = {};
    for (const shift of openShifts) {
      byPosition[shift.position] = (byPosition[shift.position] || 0) + 1;
    }

    return {
      totalGaps: openShifts.length,
      byPosition,
      urgentGaps: openShifts.filter(
        (s) => new Date(s.startTime).getTime() - Date.now() < 24 * 60 * 60 * 1000,
      ).length,
      shifts: openShifts,
    };
  }

  /**
   * Get shift history
   */
  async getHistory(shiftId: string) {
    return this.stateMachine.getHistory(shiftId);
  }
}
