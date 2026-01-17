import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { DailyPayClient } from '../clients/dailypay.client';
import {
  TransferStatus,
  TransferMethod,
  calculateNetAmount,
} from '../entities/instant-pay-transfer.entity';
import { PayoutVia, EarningsStatus } from '../entities/worker-earnings.entity';
import { FeeType } from '../config/dailypay.config';

/**
 * Earned wage calculation result
 */
interface EarnedWageCalculation {
  totalEarned: number;
  availableForTransfer: number;
  pendingTransfers: number;
  transferredThisPeriod: number;
  dailyLimitRemaining: number;
  weeklyLimitRemaining: number;
}

/**
 * Transfer request result
 */
interface TransferResult {
  success: boolean;
  transferId?: string;
  externalTransferId?: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: TransferStatus;
  error?: string;
}

/**
 * Earned Wage Access Service
 *
 * Business logic for earned wage access / instant pay:
 * - Calculate available earned wages
 * - Process transfer requests
 * - Apply fees and limits
 * - Sync worker earnings after shift completion
 */
@Injectable()
export class EarnedWageService {
  private readonly logger = new Logger(EarnedWageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly dailyPayClient: DailyPayClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==================== Earned Wage Calculations ====================

  /**
   * Calculate total earned wages for a worker
   * Only completed shifts that haven't been paid out count
   */
  async calculateEarnedWages(workerId: string): Promise<number> {
    const earnings = await this.prisma.workerEarnings.aggregate({
      where: {
        workerId,
        paidOut: false,
        status: EarningsStatus.AVAILABLE,
      },
      _sum: {
        totalEarnings: true,
      },
    });

    return Number(earnings._sum.totalEarnings || 0);
  }

  /**
   * Get available amount for transfer (after applying percentage limit and pending transfers)
   */
  async getAvailableForTransfer(workerId: string): Promise<EarnedWageCalculation> {
    // Get total earned wages
    const totalEarned = await this.calculateEarnedWages(workerId);

    // Get percentage available for transfer
    const availablePercentage = this.configService.get<number>(
      'dailypay.transfer.availablePercentage',
      80,
    );
    const percentageAvailable = totalEarned * (availablePercentage / 100);

    // Get pending transfers
    const pendingTransfers = await this.prisma.instantPayTransfer.aggregate({
      where: {
        workerId,
        status: { in: [TransferStatus.PENDING, TransferStatus.PROCESSING] },
      },
      _sum: {
        amount: true,
      },
    });
    const pendingAmount = Number(pendingTransfers._sum.amount || 0);

    // Get transferred this pay period (current week)
    const startOfWeek = this.getStartOfWeek();
    const transferredThisPeriod = await this.getTransferredAmount(workerId, startOfWeek);

    // Get daily and weekly limits
    const maxPerDay = this.configService.get<number>('dailypay.transfer.maxPerDay', 500);
    const maxPerWeek = this.configService.get<number>('dailypay.transfer.maxPerWeek', 1000);

    // Get transferred today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const transferredToday = await this.getTransferredAmount(workerId, startOfDay);

    // Calculate remaining limits
    const dailyLimitRemaining = Math.max(0, maxPerDay - transferredToday);
    const weeklyLimitRemaining = Math.max(0, maxPerWeek - transferredThisPeriod);

    // Available is minimum of: (percentage available - pending), daily limit, weekly limit
    const availableForTransfer = Math.max(
      0,
      Math.min(percentageAvailable - pendingAmount, dailyLimitRemaining, weeklyLimitRemaining),
    );

    return {
      totalEarned,
      availableForTransfer: Math.round(availableForTransfer * 100) / 100,
      pendingTransfers: pendingAmount,
      transferredThisPeriod,
      dailyLimitRemaining,
      weeklyLimitRemaining,
    };
  }

  /**
   * Get full earned wage status for a worker
   */
  async getEarnedWageStatus(workerId: string) {
    const calculation = await this.getAvailableForTransfer(workerId);
    const fee = this.calculateTransferFee(calculation.availableForTransfer);

    return {
      ...calculation,
      currentFee: fee,
      lastUpdated: new Date(),
    };
  }

  // ==================== Transfer Processing ====================

  /**
   * Request an instant pay transfer
   */
  async requestInstantPay(
    workerId: string,
    amount: number,
    method: TransferMethod = TransferMethod.INSTANT,
  ): Promise<TransferResult> {
    // Validate worker exists and is enrolled
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      include: {
        user: true,
        restaurant: true,
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    // Check enrollment status
    const enrollment = await this.prisma.instantPayEnrollment.findUnique({
      where: { workerId },
    });

    if (!enrollment || enrollment.status !== 'ACTIVE') {
      throw new BadRequestException('Worker is not enrolled in instant pay');
    }

    // Validate amount
    const minAmount = this.configService.get<number>('dailypay.transfer.minAmount', 5);
    if (amount < minAmount) {
      throw new BadRequestException(`Minimum transfer amount is $${minAmount}`);
    }

    // Check availability
    const availability = await this.getAvailableForTransfer(workerId);
    if (amount > availability.availableForTransfer) {
      throw new BadRequestException(
        `Requested amount ($${amount}) exceeds available balance ($${availability.availableForTransfer})`,
      );
    }

    // Calculate fee
    const fee = this.calculateTransferFee(amount);
    const netAmount = calculateNetAmount(amount, fee);

    // Generate idempotency key
    const idempotencyKey = `${workerId}-${Date.now()}-${amount}`;

    try {
      // Create transfer record
      const transfer = await this.prisma.instantPayTransfer.create({
        data: {
          workerId,
          restaurantId: worker.restaurantId,
          enrollmentId: enrollment.id,
          amount,
          fee,
          netAmount,
          method,
          status: TransferStatus.PENDING,
          requestedAt: new Date(),
        },
      });

      // Request transfer from DailyPay
      const dailyPayResponse = await this.dailyPayClient.requestTransfer(workerId, {
        amount,
        method: method === TransferMethod.INSTANT ? 'INSTANT' : 'NEXT_DAY',
        idempotencyKey,
      });

      // Update with external ID
      await this.prisma.instantPayTransfer.update({
        where: { id: transfer.id },
        data: {
          externalTransferId: dailyPayResponse.externalTransferId,
          status: TransferStatus.PROCESSING,
        },
      });

      // Emit event for real-time updates
      this.eventEmitter.emit('instantPay.transferRequested', {
        workerId,
        transferId: transfer.id,
        amount,
        fee,
        netAmount,
      });

      this.logger.log(
        `Transfer requested for worker ${workerId}: $${amount} (fee: $${fee})`,
      );

      return {
        success: true,
        transferId: transfer.id,
        externalTransferId: dailyPayResponse.externalTransferId,
        amount,
        fee,
        netAmount,
        status: TransferStatus.PROCESSING,
      };
    } catch (error) {
      this.logger.error(`Transfer request failed for worker ${workerId}: ${error.message}`);

      // If we created a transfer record, mark it as failed
      await this.prisma.instantPayTransfer.updateMany({
        where: {
          workerId,
          status: TransferStatus.PENDING,
          requestedAt: { gte: new Date(Date.now() - 60000) }, // Last minute
        },
        data: {
          status: TransferStatus.FAILED,
          failureReason: error.message,
        },
      });

      return {
        success: false,
        amount,
        fee,
        netAmount: calculateNetAmount(amount, fee),
        status: TransferStatus.FAILED,
        error: error.message,
      };
    }
  }

  /**
   * Handle transfer status update (from webhook)
   */
  async updateTransferStatus(
    externalTransferId: string,
    status: TransferStatus,
    processedAt?: Date,
    failureReason?: string,
  ) {
    const transfer = await this.prisma.instantPayTransfer.findFirst({
      where: { externalTransferId },
    });

    if (!transfer) {
      this.logger.warn(`Transfer not found for external ID: ${externalTransferId}`);
      return;
    }

    await this.prisma.instantPayTransfer.update({
      where: { id: transfer.id },
      data: {
        status,
        processedAt: processedAt || new Date(),
        failureReason,
      },
    });

    // If completed, mark corresponding earnings as paid out
    if (status === TransferStatus.COMPLETED) {
      await this.markEarningsAsPaidOut(transfer.workerId, Number(transfer.amount));

      this.eventEmitter.emit('instantPay.transferCompleted', {
        workerId: transfer.workerId,
        transferId: transfer.id,
        amount: transfer.amount,
      });
    } else if (status === TransferStatus.FAILED) {
      this.eventEmitter.emit('instantPay.transferFailed', {
        workerId: transfer.workerId,
        transferId: transfer.id,
        amount: transfer.amount,
        reason: failureReason,
      });
    }

    this.logger.log(`Transfer ${transfer.id} status updated to ${status}`);
  }

  // ==================== Earnings Sync ====================

  /**
   * Sync earnings for a worker after shift completion
   */
  async syncWorkerEarnings(workerId: string, shiftId?: string) {
    // Get completed shifts that haven't been recorded as earnings
    const where: any = {
      assignedToId: workerId,
      status: 'COMPLETED',
    };

    if (shiftId) {
      where.id = shiftId;
    }

    const completedShifts = await this.prisma.shift.findMany({
      where,
      include: {
        assignedTo: true,
        restaurant: true,
      },
    });

    // Filter out shifts that already have earnings records
    const existingEarnings = await this.prisma.workerEarnings.findMany({
      where: {
        workerId,
        shiftId: { in: completedShifts.map((s) => s.id) },
      },
      select: { shiftId: true },
    });
    const existingShiftIds = new Set(existingEarnings.map((e) => e.shiftId));

    const newShifts = completedShifts.filter((s) => !existingShiftIds.has(s.id));

    if (newShifts.length === 0) {
      return { shiftsProcessed: 0, totalEarnings: 0 };
    }

    // Create earnings records
    let totalEarnings = 0;

    for (const shift of newShifts) {
      const hoursWorked = this.calculateShiftHours(shift.startTime, shift.endTime, shift.breakMinutes);
      const hourlyRate = Number(shift.hourlyRateOverride || shift.assignedTo?.hourlyRate || 0);
      const grossEarnings = Math.round(hoursWorked * hourlyRate * 100) / 100;

      await this.prisma.workerEarnings.create({
        data: {
          workerId,
          restaurantId: shift.restaurantId,
          shiftId: shift.id,
          hoursWorked,
          hourlyRate,
          grossEarnings,
          totalEarnings: grossEarnings,
          earnedAt: shift.endTime,
          status: EarningsStatus.AVAILABLE,
          paidOut: false,
        },
      });

      totalEarnings += grossEarnings;
    }

    // Sync with DailyPay
    try {
      await this.dailyPayClient.syncEarnings(
        workerId,
        newShifts.map((shift) => {
          const hoursWorked = this.calculateShiftHours(shift.startTime, shift.endTime, shift.breakMinutes);
          const hourlyRate = Number(shift.hourlyRateOverride || shift.assignedTo?.hourlyRate || 0);
          return {
            shiftId: shift.id,
            hoursWorked,
            hourlyRate,
            grossEarnings: Math.round(hoursWorked * hourlyRate * 100) / 100,
            earnedAt: shift.endTime.toISOString(),
          };
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to sync earnings with DailyPay: ${error.message}`);
      // Continue - local record is the source of truth
    }

    // Emit event
    this.eventEmitter.emit('earnings.synced', {
      workerId,
      shiftsProcessed: newShifts.length,
      totalEarnings,
    });

    this.logger.log(
      `Synced ${newShifts.length} shifts for worker ${workerId}: $${totalEarnings}`,
    );

    return {
      shiftsProcessed: newShifts.length,
      totalEarnings,
    };
  }

  // ==================== Pay History ====================

  /**
   * Get combined pay history for a worker (instant + regular)
   */
  async getWorkerPayHistory(
    workerId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    // Get instant pay transfers
    const transferWhere: any = { workerId };
    if (options?.startDate || options?.endDate) {
      transferWhere.requestedAt = {};
      if (options?.startDate) transferWhere.requestedAt.gte = options.startDate;
      if (options?.endDate) transferWhere.requestedAt.lte = options.endDate;
    }

    const [transfers, earningsByPeriod] = await Promise.all([
      this.prisma.instantPayTransfer.findMany({
        where: {
          ...transferWhere,
          status: TransferStatus.COMPLETED,
        },
        orderBy: { processedAt: 'desc' },
      }),
      // Get earnings that were paid via regular payroll
      this.prisma.workerEarnings.findMany({
        where: {
          workerId,
          paidOut: true,
          paidOutVia: PayoutVia.REGULAR,
          ...(options?.startDate || options?.endDate
            ? {
                paidOutAt: {
                  ...(options?.startDate && { gte: options.startDate }),
                  ...(options?.endDate && { lte: options.endDate }),
                },
              }
            : {}),
        },
        orderBy: { paidOutAt: 'desc' },
      }),
    ]);

    // Combine and sort
    const payments = [
      ...transfers.map((t) => ({
        id: t.id,
        type: 'INSTANT' as const,
        grossAmount: Number(t.amount),
        fees: Number(t.fee),
        netAmount: Number(t.netAmount),
        paidAt: t.processedAt!,
        status: t.status,
        shiftIds: [],
      })),
      // Group regular pay by date (simplified)
      ...this.groupEarningsByPayDate(earningsByPeriod),
    ].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    // Calculate totals
    const totals = payments.reduce(
      (acc, p) => ({
        totalInstantPay: acc.totalInstantPay + (p.type === 'INSTANT' ? p.netAmount : 0),
        totalRegularPay: acc.totalRegularPay + (p.type === 'REGULAR' ? p.netAmount : 0),
        totalFees: acc.totalFees + p.fees,
        totalNetPay: acc.totalNetPay + p.netAmount,
      }),
      { totalInstantPay: 0, totalRegularPay: 0, totalFees: 0, totalNetPay: 0 },
    );

    // Paginate
    const paginatedPayments = payments.slice(skip, skip + limit);

    return {
      payments: paginatedPayments,
      ...totals,
      total: payments.length,
      page,
      limit,
      hasMore: skip + paginatedPayments.length < payments.length,
    };
  }

  // ==================== Fee Calculation ====================

  /**
   * Calculate transfer fee based on configuration
   */
  calculateTransferFee(amount: number): number {
    const feeType = this.configService.get<FeeType>('dailypay.fees.type', FeeType.FLAT);
    const feePaidBy = this.configService.get<string>('dailypay.fees.paidBy', 'WORKER');

    // If employer pays, fee is 0 for worker
    if (feePaidBy === 'EMPLOYER') {
      return 0;
    }

    if (feeType === FeeType.FLAT) {
      return this.configService.get<number>('dailypay.fees.flatAmount', 2.99);
    }

    // Percentage fee
    const percentage = this.configService.get<number>('dailypay.fees.percentage', 2.5);
    const minFee = this.configService.get<number>('dailypay.fees.minFee', 1);
    const maxFee = this.configService.get<number>('dailypay.fees.maxFee', 10);

    const calculatedFee = amount * (percentage / 100);
    return Math.max(minFee, Math.min(maxFee, Math.round(calculatedFee * 100) / 100));
  }

  /**
   * Apply transfer fee to an amount
   */
  applyTransferFee(amount: number): { grossAmount: number; fee: number; netAmount: number } {
    const fee = this.calculateTransferFee(amount);
    return {
      grossAmount: amount,
      fee,
      netAmount: calculateNetAmount(amount, fee),
    };
  }

  // ==================== Private Helpers ====================

  private async getTransferredAmount(workerId: string, since: Date): Promise<number> {
    const result = await this.prisma.instantPayTransfer.aggregate({
      where: {
        workerId,
        requestedAt: { gte: since },
        status: { in: [TransferStatus.COMPLETED, TransferStatus.PROCESSING] },
      },
      _sum: {
        amount: true,
      },
    });
    return Number(result._sum.amount || 0);
  }

  private getStartOfWeek(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day; // Adjust for Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  }

  private calculateShiftHours(startTime: Date, endTime: Date, breakMinutes: number): number {
    const totalMs = endTime.getTime() - startTime.getTime();
    const totalHours = totalMs / (1000 * 60 * 60);
    const breakHours = breakMinutes / 60;
    return Math.max(0, Math.round((totalHours - breakHours) * 100) / 100);
  }

  private async markEarningsAsPaidOut(workerId: string, amount: number) {
    // Mark earnings as paid out up to the transfer amount
    const availableEarnings = await this.prisma.workerEarnings.findMany({
      where: {
        workerId,
        paidOut: false,
        status: EarningsStatus.AVAILABLE,
      },
      orderBy: { earnedAt: 'asc' },
    });

    let remainingAmount = amount;

    for (const earning of availableEarnings) {
      if (remainingAmount <= 0) break;

      const earningAmount = Number(earning.totalEarnings);
      if (earningAmount <= remainingAmount) {
        // Mark entire earning as paid out
        await this.prisma.workerEarnings.update({
          where: { id: earning.id },
          data: {
            paidOut: true,
            paidOutAt: new Date(),
            paidOutVia: PayoutVia.INSTANT,
          },
        });
        remainingAmount -= earningAmount;
      }
      // Note: For partial payouts, we'd need to split the earnings record
      // For simplicity, we only mark full earnings as paid
    }
  }

  private groupEarningsByPayDate(earnings: any[]): any[] {
    // Group earnings by pay date (simplified - group by week)
    const byDate = new Map<string, any[]>();

    for (const earning of earnings) {
      const dateKey = earning.paidOutAt.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(earning);
    }

    return Array.from(byDate.entries()).map(([date, items]) => ({
      id: `regular-${date}`,
      type: 'REGULAR' as const,
      grossAmount: items.reduce((sum, e) => sum + Number(e.totalEarnings), 0),
      fees: 0,
      netAmount: items.reduce((sum, e) => sum + Number(e.totalEarnings), 0),
      paidAt: new Date(date),
      status: 'COMPLETED',
      shiftIds: items.map((e) => e.shiftId),
    }));
  }
}
