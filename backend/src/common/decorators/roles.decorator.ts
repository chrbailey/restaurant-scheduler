import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Requires specific role(s) for the restaurant in context
 *
 * @example
 * @Roles('MANAGER', 'OWNER')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * async createShift() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
