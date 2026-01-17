import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser, CurrentProfile } from '@/common/decorators/current-user.decorator';
import { NetworkService } from '../services/network.service';
import { CrossTrainingService } from '../services/cross-training.service';
import { NetworkShiftService } from '../services/network-shift.service';
import {
  CreateNetworkDto,
  UpdateNetworkDto,
  InviteRestaurantDto,
  RespondInvitationDto,
  UpdateMembershipDto,
} from '../dto/network.dto';
import {
  CreateCrossTrainingDto,
  ApproveCrossTrainingDto,
  RevokeCrossTrainingDto,
} from '../dto/cross-training.dto';
import { CrossTrainingStatus } from '../entities/cross-training.entity';

@ApiTags('networks')
@Controller('networks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NetworkController {
  constructor(
    private readonly networkService: NetworkService,
    private readonly crossTrainingService: CrossTrainingService,
    private readonly networkShiftService: NetworkShiftService,
  ) {}

  // ==================== Network CRUD ====================

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Create a new restaurant network' })
  async createNetwork(
    @Body() dto: CreateNetworkDto,
    @Query('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.networkService.createNetwork(restaurantId, dto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get network by ID' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  async getNetwork(@Param('id') id: string) {
    return this.networkService.getNetworkById(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update network settings' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  async updateNetwork(
    @Param('id') id: string,
    @Body() dto: UpdateNetworkDto,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.networkService.updateNetwork(id, dto, restaurantId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Delete a network' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  async deleteNetwork(
    @Param('id') id: string,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.networkService.deleteNetwork(id, restaurantId);
  }

  // ==================== Network Membership ====================

  @Get(':id/restaurants')
  @ApiOperation({ summary: 'Get all restaurants in a network' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  async getNetworkRestaurants(@Param('id') id: string) {
    return this.networkService.getNetworkRestaurants(id);
  }

  @Post(':id/invite')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Invite a restaurant to the network' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  async inviteRestaurant(
    @Param('id') id: string,
    @Body() dto: InviteRestaurantDto,
    @Query('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.networkService.inviteRestaurant(id, dto, restaurantId, userId);
  }

  @Post('invitations/:membershipId/respond')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Respond to a network invitation' })
  @ApiParam({ name: 'membershipId', description: 'Membership/Invitation ID' })
  async respondToInvitation(
    @Param('membershipId') membershipId: string,
    @Body() dto: RespondInvitationDto,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.networkService.respondToInvitation(membershipId, dto, restaurantId);
  }

  @Delete(':id/restaurants/:targetRestaurantId')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Remove a restaurant from the network' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  @ApiParam({ name: 'targetRestaurantId', description: 'Restaurant ID to remove' })
  async removeRestaurant(
    @Param('id') id: string,
    @Param('targetRestaurantId') targetRestaurantId: string,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.networkService.removeRestaurant(id, targetRestaurantId, restaurantId);
  }

  @Put(':id/restaurants/:targetRestaurantId')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update a member\'s role or status' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  @ApiParam({ name: 'targetRestaurantId', description: 'Target restaurant ID' })
  async updateMembership(
    @Param('id') id: string,
    @Param('targetRestaurantId') targetRestaurantId: string,
    @Body() dto: UpdateMembershipDto,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.networkService.updateMembership(id, targetRestaurantId, dto, restaurantId);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Transfer network ownership to another restaurant' })
  @ApiParam({ name: 'id', description: 'Network ID' })
  async transferOwnership(
    @Param('id') id: string,
    @Body() body: { newOwnerRestaurantId: string },
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.networkService.transferOwnership(id, body.newOwnerRestaurantId, restaurantId);
  }

  // ==================== Restaurant's Networks ====================

  @Get('restaurant/:restaurantId')
  @UseGuards(RolesGuard)
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get all networks a restaurant belongs to' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  async getRestaurantNetworks(@Param('restaurantId') restaurantId: string) {
    return this.networkService.getRestaurantNetworks(restaurantId);
  }

  @Get('restaurant/:restaurantId/invitations')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get pending network invitations for a restaurant' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  async getPendingInvitations(@Param('restaurantId') restaurantId: string) {
    return this.networkService.getPendingInvitations(restaurantId);
  }

  // ==================== Cross-Training ====================

  @Post('cross-training')
  @UseGuards(RolesGuard)
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Request cross-training at another restaurant' })
  async requestCrossTraining(
    @Body() dto: CreateCrossTrainingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.crossTrainingService.requestCrossTraining(dto, userId);
  }

  @Get('cross-training/:id')
  @ApiOperation({ summary: 'Get cross-training by ID' })
  @ApiParam({ name: 'id', description: 'Cross-training ID' })
  async getCrossTraining(@Param('id') id: string) {
    return this.crossTrainingService.getCrossTrainingById(id);
  }

  @Post('cross-training/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Approve a cross-training request' })
  @ApiParam({ name: 'id', description: 'Cross-training ID' })
  async approveCrossTraining(
    @Param('id') id: string,
    @Body() dto: ApproveCrossTrainingDto,
    @CurrentUser('id') userId: string,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.crossTrainingService.approveCrossTraining(id, dto, userId, restaurantId);
  }

  @Post('cross-training/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Reject a cross-training request' })
  @ApiParam({ name: 'id', description: 'Cross-training ID' })
  async rejectCrossTraining(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.crossTrainingService.rejectCrossTraining(id, body.reason, restaurantId);
  }

  @Post('cross-training/:id/revoke')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Revoke an approved cross-training' })
  @ApiParam({ name: 'id', description: 'Cross-training ID' })
  async revokeCrossTraining(
    @Param('id') id: string,
    @Body() dto: RevokeCrossTrainingDto,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.crossTrainingService.revokeCrossTraining(id, dto, restaurantId);
  }

  @Get('restaurant/:restaurantId/cross-training/workers')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get cross-trained workers at a restaurant' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiQuery({ name: 'status', enum: CrossTrainingStatus, required: false })
  async getCrossTrainedWorkers(
    @Param('restaurantId') restaurantId: string,
    @Query('status') status?: CrossTrainingStatus,
  ) {
    return this.crossTrainingService.getRestaurantCrossTrainedWorkers(restaurantId, status);
  }

  @Get('restaurant/:restaurantId/cross-training/pending')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get pending cross-training requests for a restaurant' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  async getPendingCrossTrainingRequests(@Param('restaurantId') restaurantId: string) {
    return this.crossTrainingService.getPendingCrossTrainingRequests(restaurantId);
  }

  @Get('worker/:workerProfileId/cross-training')
  @ApiOperation({ summary: 'Get all cross-trainings for a worker' })
  @ApiParam({ name: 'workerProfileId', description: 'Worker Profile ID' })
  @ApiQuery({ name: 'status', enum: CrossTrainingStatus, required: false })
  async getWorkerCrossTrainings(
    @Param('workerProfileId') workerProfileId: string,
    @Query('status') status?: CrossTrainingStatus,
  ) {
    return this.crossTrainingService.getWorkerCrossTrainings(workerProfileId, status);
  }

  @Get('worker/:workerProfileId/cross-training/restaurants')
  @ApiOperation({ summary: 'Get restaurants where worker is cross-trained' })
  @ApiParam({ name: 'workerProfileId', description: 'Worker Profile ID' })
  async getWorkerCrossTrainedRestaurants(@Param('workerProfileId') workerProfileId: string) {
    return this.crossTrainingService.getWorkerCrossTrainedRestaurants(workerProfileId);
  }

  // ==================== Network Shifts ====================

  @Get('worker/:workerProfileId/shifts/available')
  @ApiOperation({ summary: 'Get network shifts available to a worker' })
  @ApiParam({ name: 'workerProfileId', description: 'Worker Profile ID' })
  @ApiQuery({ name: 'position', required: false })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  @ApiQuery({ name: 'maxDistance', required: false, type: Number })
  async getNetworkAvailableShifts(
    @Param('workerProfileId') workerProfileId: string,
    @Query('position') position?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('maxDistance') maxDistance?: number,
  ) {
    return this.networkShiftService.getNetworkAvailableShifts(workerProfileId, {
      position,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      maxDistance,
    });
  }

  @Post('shifts/:shiftId/claim')
  @ApiOperation({ summary: 'Claim a network shift' })
  @ApiParam({ name: 'shiftId', description: 'Shift ID' })
  async claimNetworkShift(
    @Param('shiftId') shiftId: string,
    @Body() body: { workerProfileId: string; notes?: string },
  ) {
    return this.networkShiftService.claimNetworkShift(
      shiftId,
      body.workerProfileId,
      body.notes,
    );
  }

  @Get('shifts/:shiftId/validate-claim')
  @ApiOperation({ summary: 'Validate if a worker can claim a network shift' })
  @ApiParam({ name: 'shiftId', description: 'Shift ID' })
  @ApiQuery({ name: 'workerProfileId', required: true })
  async validateNetworkClaim(
    @Param('shiftId') shiftId: string,
    @Query('workerProfileId') workerProfileId: string,
  ) {
    return this.networkShiftService.validateNetworkClaim(shiftId, workerProfileId);
  }

  @Get('restaurant/:restaurantId/shifts/stats')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get network shift statistics for a restaurant' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  async getNetworkShiftStats(@Param('restaurantId') restaurantId: string) {
    return this.networkShiftService.getNetworkShiftStats(restaurantId);
  }
}
