import { Module } from '@nestjs/common';
import { ShiftsController } from './controllers/shifts.controller';
import { ShiftsService } from './services/shifts.service';
import { ShiftStateMachine } from './services/shift-state-machine.service';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftStateMachine],
  exports: [ShiftsService, ShiftStateMachine],
})
export class SchedulingModule {}
