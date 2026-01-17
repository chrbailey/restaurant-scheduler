import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the current authenticated user from the request
 *
 * @example
 * @Get('me')
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * @example
 * // Get specific field
 * @Get('my-id')
 * getMyId(@CurrentUser('id') userId: string) {
 *   return userId;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

/**
 * Extracts the current worker profile (set by RolesGuard)
 *
 * @example
 * @Get('shifts')
 * @Roles('WORKER')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * getMyShifts(@CurrentProfile() profile: WorkerProfile) {
 *   return this.shiftsService.findByWorker(profile.id);
 * }
 */
export const CurrentProfile = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const profile = request.workerProfile;

    return data ? profile?.[data] : profile;
  },
);
