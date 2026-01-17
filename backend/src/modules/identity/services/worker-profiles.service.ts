import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { calculateReliabilityScore } from '@restaurant-scheduler/shared';

@Injectable()
export class WorkerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all workers for a restaurant
   */
  async findByRestaurant(
    restaurantId: string,
    options?: {
      status?: string;
      position?: string;
      tier?: string;
      includeUser?: boolean;
    },
  ) {
    return this.prisma.workerProfile.findMany({
      where: {
        restaurantId,
        ...(options?.status && { status: options.status }),
        ...(options?.position && { positions: { has: options.position } }),
        ...(options?.tier && { tier: options.tier }),
      },
      include: {
        user: options?.includeUser
          ? {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                avatarUrl: true,
              },
            }
          : false,
        certifications: true,
      },
      orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get a single worker profile
   */
  async findById(id: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            timezone: true,
          },
        },
        certifications: true,
        availability: {
          where: {
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }],
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Worker profile not found');
    }

    return profile;
  }

  /**
   * Invite a new worker to a restaurant
   */
  async inviteWorker(
    restaurantId: string,
    invitedByUserId: string,
    data: {
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
    // Check if user already exists
    let user = await this.prisma.user.findUnique({
      where: { phone: data.phone },
    });

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          phone: data.phone,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
        },
      });
    }

    // Check if profile already exists
    const existingProfile = await this.prisma.workerProfile.findUnique({
      where: {
        userId_restaurantId: {
          userId: user.id,
          restaurantId,
        },
      },
    });

    if (existingProfile) {
      throw new ConflictException('Worker already has a profile at this restaurant');
    }

    // Create worker profile
    const profile = await this.prisma.workerProfile.create({
      data: {
        userId: user.id,
        restaurantId,
        role: data.role,
        positions: data.positions,
        hourlyRate: data.hourlyRate,
        tier: data.tier || 'SECONDARY',
        status: 'PENDING_VERIFICATION',
        approvedById: invitedByUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    // TODO: Send invitation notification

    return profile;
  }

  /**
   * Update a worker profile
   */
  async updateProfile(
    profileId: string,
    data: {
      role?: string;
      positions?: string[];
      hourlyRate?: number;
      tier?: string;
      status?: string;
    },
  ) {
    return this.prisma.workerProfile.update({
      where: { id: profileId },
      data,
    });
  }

  /**
   * Set worker availability
   */
  async setAvailability(
    profileId: string,
    availability: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isPreferred: boolean;
    }[],
    effectiveFrom: Date,
    effectiveUntil?: Date,
  ) {
    // Delete existing availability for this period
    await this.prisma.availability.deleteMany({
      where: {
        workerProfileId: profileId,
        effectiveFrom: { gte: effectiveFrom },
      },
    });

    // Create new availability records
    return this.prisma.availability.createMany({
      data: availability.map((a) => ({
        workerProfileId: profileId,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        isPreferred: a.isPreferred,
        effectiveFrom,
        effectiveUntil,
      })),
    });
  }

  /**
   * Get availability for a worker
   */
  async getAvailability(profileId: string, date?: Date) {
    const targetDate = date || new Date();

    return this.prisma.availability.findMany({
      where: {
        workerProfileId: profileId,
        effectiveFrom: { lte: targetDate },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDate } }],
      },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /**
   * Request time off
   */
  async requestTimeOff(
    profileId: string,
    data: {
      startDate: Date;
      endDate: Date;
      allDay?: boolean;
      startTime?: string;
      endTime?: string;
      reason?: string;
    },
  ) {
    return this.prisma.timeOffRequest.create({
      data: {
        workerProfileId: profileId,
        startDate: data.startDate,
        endDate: data.endDate,
        allDay: data.allDay ?? true,
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason,
      },
    });
  }

  /**
   * Approve/reject time off request
   */
  async resolveTimeOffRequest(
    requestId: string,
    reviewedByUserId: string,
    approved: boolean,
    notes?: string,
  ) {
    return this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedById: reviewedByUserId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });
  }

  /**
   * Add certification to worker
   */
  async addCertification(
    profileId: string,
    data: {
      type: string;
      issuedAt: Date;
      expiresAt?: Date;
      verificationUrl?: string;
    },
  ) {
    return this.prisma.certification.create({
      data: {
        workerProfileId: profileId,
        type: data.type,
        issuedAt: data.issuedAt,
        expiresAt: data.expiresAt,
        verificationUrl: data.verificationUrl,
      },
    });
  }

  /**
   * Update worker stats after shift completion
   */
  async recordShiftCompletion(
    profileId: string,
    data: {
      completed: boolean;
      noShow?: boolean;
      late?: boolean;
      rating?: number;
    },
  ) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Worker profile not found');
    }

    // Calculate new stats
    const newShiftsCompleted = data.completed ? profile.shiftsCompleted + 1 : profile.shiftsCompleted;
    const newNoShowCount = data.noShow ? profile.noShowCount + 1 : profile.noShowCount;
    const newLateCount = data.late ? profile.lateCount + 1 : profile.lateCount;

    let newAverageRating = Number(profile.averageRating);
    let newRatingCount = profile.ratingCount;

    if (data.rating !== undefined) {
      // Running average calculation
      newAverageRating =
        (newAverageRating * newRatingCount + data.rating) / (newRatingCount + 1);
      newRatingCount += 1;
    }

    // Calculate reliability score
    const reliabilityScore = calculateReliabilityScore({
      shiftsCompleted: newShiftsCompleted,
      noShowCount: newNoShowCount,
      lateCount: newLateCount,
      averageRating: newAverageRating,
      ratingCount: newRatingCount,
      reliabilityScore: 0, // Will be recalculated
      lastShiftAt: null,
    });

    return this.prisma.workerProfile.update({
      where: { id: profileId },
      data: {
        shiftsCompleted: newShiftsCompleted,
        noShowCount: newNoShowCount,
        lateCount: newLateCount,
        averageRating: newAverageRating,
        ratingCount: newRatingCount,
        reliabilityScore,
        lastShiftAt: data.completed ? new Date() : undefined,
      },
    });
  }

  /**
   * Find workers available for a shift
   */
  async findAvailableWorkers(
    restaurantId: string,
    shiftStart: Date,
    shiftEnd: Date,
    position: string,
    options?: {
      includeNetwork?: boolean;
      minReputationScore?: number;
    },
  ) {
    const dayOfWeek = shiftStart.getDay();
    const startTime = shiftStart.toTimeString().slice(0, 5);
    const endTime = shiftEnd.toTimeString().slice(0, 5);

    // Get workers with matching availability and position
    const workers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        positions: { has: position },
        ...(options?.minReputationScore && {
          reliabilityScore: { gte: options.minReputationScore },
        }),
        availability: {
          some: {
            dayOfWeek,
            startTime: { lte: startTime },
            endTime: { gte: endTime },
            effectiveFrom: { lte: shiftStart },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: shiftEnd } }],
          },
        },
      },
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
      orderBy: [{ tier: 'asc' }, { reliabilityScore: 'desc' }],
    });

    // Filter out workers with conflicting shifts or approved time off
    const availableWorkers = [];

    for (const worker of workers) {
      // Check for conflicting shifts
      const conflictingShift = await this.prisma.shift.findFirst({
        where: {
          assignedToId: worker.id,
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          OR: [
            {
              startTime: { lte: shiftStart },
              endTime: { gt: shiftStart },
            },
            {
              startTime: { lt: shiftEnd },
              endTime: { gte: shiftEnd },
            },
            {
              startTime: { gte: shiftStart },
              endTime: { lte: shiftEnd },
            },
          ],
        },
      });

      if (conflictingShift) continue;

      // Check for approved time off
      const timeOff = await this.prisma.timeOffRequest.findFirst({
        where: {
          workerProfileId: worker.id,
          status: 'APPROVED',
          startDate: { lte: shiftEnd },
          endDate: { gte: shiftStart },
        },
      });

      if (timeOff) continue;

      availableWorkers.push(worker);
    }

    return availableWorkers;
  }
}
