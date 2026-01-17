import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        workerProfiles: {
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                timezone: true,
              },
            },
          },
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      timezone?: string;
      avatarUrl?: string;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async getNotificationPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Create default preferences
      prefs = await this.prisma.notificationPreferences.create({
        data: { userId },
      });
    }

    return prefs;
  }

  async updateNotificationPreferences(
    userId: string,
    data: {
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      maxPerHour?: number;
      batchLowUrgency?: boolean;
      positionFilter?: string[];
      maxDistanceMiles?: number;
    },
  ) {
    return this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async getRestaurantMemberships(userId: string) {
    return this.prisma.workerProfile.findMany({
      where: { userId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            timezone: true,
            network: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }
}
