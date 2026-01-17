import { Module } from '@nestjs/common';
import { ClaimsController } from './controllers/claims.controller';
import { SwapsController } from './controllers/swaps.controller';
import { PoolController } from './controllers/pool.controller';
import { ClaimsService } from './services/claims.service';
import { SwapsService } from './services/swaps.service';
import { ShiftMatcherService } from './services/shift-matcher.service';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NetworkModule } from '../network/network.module';

/**
 * Shift Pool Module
 *
 * Handles shift claiming, swapping, and matching:
 * - Shift claims from workers
 * - Shift swaps between workers
 * - Matching workers to available shifts
 *
 * Now integrates with NetworkModule for:
 * - Conflict detection across multiple restaurants
 * - Network reputation scoring
 * - Network visibility rules
 */
@Module({
  imports: [SchedulingModule, NetworkModule],
  controllers: [ClaimsController, SwapsController, PoolController],
  providers: [ClaimsService, SwapsService, ShiftMatcherService],
  exports: [ClaimsService, SwapsService, ShiftMatcherService],
})
export class ShiftPoolModule {}
