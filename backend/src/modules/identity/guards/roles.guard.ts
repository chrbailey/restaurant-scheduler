import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';

/**
 * Roles Guard
 *
 * Checks if the authenticated user has the required role for a specific restaurant.
 * Roles are defined per-restaurant via WorkerProfile, not globally.
 *
 * Usage:
 * @Roles('MANAGER', 'OWNER')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async updateSchedule() { ... }
 *
 * The restaurant ID is extracted from:
 * 1. Request body (restaurantId)
 * 2. Request params (restaurantId or id for restaurant routes)
 * 3. Request query (restaurantId)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    // Platform admins bypass role checks
    if (user.platformRole === 'ADMIN') {
      return true;
    }

    // Get restaurant ID from request
    const restaurantId =
      request.body?.restaurantId ||
      request.params?.restaurantId ||
      request.params?.id ||
      request.query?.restaurantId;

    if (!restaurantId) {
      throw new ForbiddenException('Restaurant context required');
    }

    // Get user's profile for this restaurant
    const profile = await this.prisma.workerProfile.findUnique({
      where: {
        userId_restaurantId: {
          userId: user.id,
          restaurantId,
        },
      },
    });

    if (!profile) {
      throw new ForbiddenException('Not a member of this restaurant');
    }

    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenException('Profile is not active');
    }

    // Check if user has any of the required roles
    if (!requiredRoles.includes(profile.role)) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRoles.join(' or ')}`,
      );
    }

    // Attach profile to request for controllers to use
    request.workerProfile = profile;

    return true;
  }
}
