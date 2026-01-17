import { Module } from '@nestjs/common';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { RedisModule } from '@/common/redis/redis.module';
import { NetworkController } from './controllers/network.controller';
import { NetworkService } from './services/network.service';
import { CrossTrainingService } from './services/cross-training.service';
import { NetworkShiftService } from './services/network-shift.service';
import { ConflictDetectorService } from './services/conflict-detector.service';
import { ReputationService } from './services/reputation.service';
import { NetworkVisibilityService } from './services/network-visibility.service';

/**
 * Network Module
 *
 * Provides functionality for restaurant networks - trusted groups
 * of restaurants that can share workers across locations.
 *
 * Features:
 * - Network creation and management
 * - Restaurant membership and invitations
 * - Cross-training certification
 * - Network shift visibility and claiming
 * - Conflict detection for multi-restaurant workers
 * - Network-wide reputation tracking
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [NetworkController],
  providers: [
    NetworkService,
    CrossTrainingService,
    NetworkShiftService,
    ConflictDetectorService,
    ReputationService,
    NetworkVisibilityService,
  ],
  exports: [
    NetworkService,
    CrossTrainingService,
    NetworkShiftService,
    ConflictDetectorService,
    ReputationService,
    NetworkVisibilityService,
  ],
})
export class NetworkModule {}
