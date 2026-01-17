import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { DailyPayClient } from '../clients/dailypay.client';
import { EarnedWageService } from './earned-wage.service';
import { TransferStatus } from '../entities/instant-pay-transfer.entity';
import { PayoutVia, EarningsStatus } from '../entities/worker-earnings.entity';

/**
 * Pay period definition
 */
interface PayPeriod {
  startDate: Date;
  endDate: Date;
}

/**
 * Payroll report item
 */
interface PayrollReportItem {
  workerId: string;
  workerName: string;
  hoursWorked: number;
  grossEarnings: number;
  tips: number;
  totalEarnings: number;
  instantPayWithdrawals: number;
  regularPayAmount: number;
  shiftCount: number;
}

/**
 * Payroll report
 */
interface PayrollReport {
  restaurantId: string;
  restaurantName: string;
  payPeriod: PayPeriod;
  workers: PayrollReportItem[];
  totalHours: number;
  totalGrossEarnings: number;
  totalTips: number;
  totalInstantPayWithdrawals: number;
  totalRegularPayroll: number;
  generatedAt: Date;
}

/**
 * Pay period summary
 */
interface PayPeriodSummary {
  payPeriod: PayPeriod;
  totalShifts: number;
  completedShifts: number;
  totalHours: number;
  totalEarnings: number;
  instantPayTransferCount: number;
  instantPayTotalAmount: number;
  activeWorkerCount: number;
}

/**
 * Sync result
 */
interface SyncResult {
  shiftsProcessed: number;
  workersUpdated: number;
  totalEarningsSynced: number;
  errors: string[];
  completedAt: Date;
}

/**
 * Payroll Sync Service
 *
 * Handles synchronization between scheduling system and payroll:
 * - Sync completed shifts to earnings records
 * - Generate payroll reports
 * - Reconcile instant pay with regular payroll
 * - Batch earnings sync jobs
 */
@Injectable()
export class PayrollSyncService {
  private readonly logger = new Logger(PayrollSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly dailyPayClient: DailyPayClient,
    private readonly earnedWageService: EarnedWageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==================== Shift Sync ====================

  /**
   * Sync completed shifts for a restaurant
   * Creates earnings records for any completed shifts that don't have them
   */
  async syncCompletedShifts(
    restaurantId: string,
    options?: { since?: Date; workerIds?: string[] },
  ): Promise<SyncResult> {
    const errors: string[] = [];
    let shiftsProcessed = 0;
    let totalEarningsSynced = 0;
    const workersUpdated = new Set<string>();

    // Get completed shifts without earnings records
    const completedShifts = await this.prisma.shift.findMany({
      where: {
        restaurantId,
        status: 'COMPLETED',
        assignedToId: { not: null },
        ...(options?.since && { updatedAt: { gte: options.since } }),
        ...(options?.workerIds && { assignedToId: { in: options.workerIds } }),
      },
      include: {
        assignedTo: true,
      },
    });

    // Check which shifts already have earnings
    const existingEarnings = await this.prisma.workerEarnings.findMany({
      where: {
        shiftId: { in: completedShifts.map((s) => s.id) },
      },
      select: { shiftId: true },
    });
    const existingShiftIds = new Set(existingEarnings.map((e) => e.shiftId));

    // Process new shifts
    for (const shift of completedShifts) {
      if (existingShiftIds.has(shift.id)) {
        continue; // Already has earnings record
      }

      if (!shift.assignedTo) {
        continue; // No worker assigned
      }

      try {
        const result = await this.earnedWageService.syncWorkerEarnings(
          shift.assignedToId!,
          shift.id,
        );

        shiftsProcessed += result.shiftsProcessed;
        totalEarningsSynced += result.totalEarnings;
        workersUpdated.add(shift.assignedToId!);
      } catch (error) {
        errors.push(`Failed to sync shift ${shift.id}: ${error.message}`);
        this.logger.error(`Shift sync error: ${error.message}`);
      }
    }

    const result: SyncResult = {
      shiftsProcessed,
      workersUpdated: workersUpdated.size,
      totalEarningsSynced,
      errors,
      completedAt: new Date(),
    };

    // Emit event
    this.eventEmitter.emit('payroll.shiftsSynced', {
      restaurantId,
      ...result,
    });

    this.logger.log(
      `Synced ${shiftsProcessed} shifts for restaurant ${restaurantId}: $${totalEarningsSynced}`,
    );

    return result;
  }

  /**
   * Scheduled job to sync all completed shifts
   * Runs every 15 minutes by default
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledShiftSync() {
    const syncInterval = this.configService.get<number>(
      'dailypay.sync.intervalMinutes',
      15,
    );
    const since = new Date(Date.now() - syncInterval * 60 * 1000);

    // Get all restaurants with ghost kitchen or instant pay enabled
    const restaurants = await this.prisma.restaurant.findMany({
      where: {
        // Only sync for restaurants that might have instant pay
        workerProfiles: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
      select: { id: true },
    });

    this.logger.log(`Running scheduled shift sync for ${restaurants.length} restaurants`);

    for (const restaurant of restaurants) {
      try {
        await this.syncCompletedShifts(restaurant.id, { since });
      } catch (error) {
        this.logger.error(
          `Scheduled sync failed for restaurant ${restaurant.id}: ${error.message}`,
        );
      }
    }
  }

  // ==================== Payroll Reports ====================

  /**
   * Generate payroll report for a pay period
   */
  async generatePayrollReport(
    restaurantId: string,
    payPeriod: PayPeriod,
  ): Promise<PayrollReport> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    // Get all earnings in the pay period
    const earnings = await this.prisma.workerEarnings.findMany({
      where: {
        restaurantId,
        earnedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
      },
      include: {
        workerProfile: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // Get instant pay transfers in the pay period
    const transfers = await this.prisma.instantPayTransfer.findMany({
      where: {
        restaurantId,
        requestedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
        status: TransferStatus.COMPLETED,
      },
    });

    // Group by worker
    const workerMap = new Map<string, PayrollReportItem>();

    for (const earning of earnings) {
      const workerId = earning.workerId;
      const workerName = earning.workerProfile
        ? `${earning.workerProfile.user.firstName} ${earning.workerProfile.user.lastName}`
        : 'Unknown';

      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          workerId,
          workerName,
          hoursWorked: 0,
          grossEarnings: 0,
          tips: 0,
          totalEarnings: 0,
          instantPayWithdrawals: 0,
          regularPayAmount: 0,
          shiftCount: 0,
        });
      }

      const item = workerMap.get(workerId)!;
      item.hoursWorked += Number(earning.hoursWorked);
      item.grossEarnings += Number(earning.grossEarnings);
      item.tips += Number(earning.tips || 0);
      item.totalEarnings += Number(earning.totalEarnings);
      item.shiftCount += 1;
    }

    // Add instant pay withdrawals
    for (const transfer of transfers) {
      const item = workerMap.get(transfer.workerId);
      if (item) {
        item.instantPayWithdrawals += Number(transfer.amount);
      }
    }

    // Calculate regular pay amounts
    for (const item of workerMap.values()) {
      item.regularPayAmount = Math.max(0, item.totalEarnings - item.instantPayWithdrawals);
    }

    const workers = Array.from(workerMap.values());

    // Calculate totals
    const totals = workers.reduce(
      (acc, w) => ({
        totalHours: acc.totalHours + w.hoursWorked,
        totalGrossEarnings: acc.totalGrossEarnings + w.grossEarnings,
        totalTips: acc.totalTips + w.tips,
        totalInstantPayWithdrawals: acc.totalInstantPayWithdrawals + w.instantPayWithdrawals,
        totalRegularPayroll: acc.totalRegularPayroll + w.regularPayAmount,
      }),
      {
        totalHours: 0,
        totalGrossEarnings: 0,
        totalTips: 0,
        totalInstantPayWithdrawals: 0,
        totalRegularPayroll: 0,
      },
    );

    const report: PayrollReport = {
      restaurantId,
      restaurantName: restaurant.name,
      payPeriod,
      workers,
      ...totals,
      generatedAt: new Date(),
    };

    // Cache the report
    const cacheKey = `payroll:report:${restaurantId}:${payPeriod.startDate.toISOString()}`;
    await this.redis.setJson(cacheKey, report, 3600); // 1 hour cache

    this.logger.log(
      `Generated payroll report for ${restaurant.name}: ${workers.length} workers, $${totals.totalRegularPayroll} regular pay`,
    );

    return report;
  }

  // ==================== Reconciliation ====================

  /**
   * Reconcile instant pay transfers with regular payroll
   * This deducts instant pay from regular payroll calculations
   */
  async reconcileInstantPay(
    restaurantId: string,
    payPeriod: PayPeriod,
  ): Promise<{
    workersReconciled: number;
    totalInstantPayDeducted: number;
    discrepancies: { workerId: string; issue: string }[];
  }> {
    const discrepancies: { workerId: string; issue: string }[] = [];
    let totalInstantPayDeducted = 0;

    // Get all workers with earnings in this period
    const earnings = await this.prisma.workerEarnings.findMany({
      where: {
        restaurantId,
        earnedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
        paidOut: false,
      },
      distinct: ['workerId'],
      select: { workerId: true },
    });

    const workerIds = earnings.map((e) => e.workerId);

    // Get instant pay transfers for these workers
    const transfers = await this.prisma.instantPayTransfer.findMany({
      where: {
        workerId: { in: workerIds },
        restaurantId,
        requestedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
        status: TransferStatus.COMPLETED,
      },
    });

    // Group transfers by worker
    const transfersByWorker = new Map<string, number>();
    for (const transfer of transfers) {
      const current = transfersByWorker.get(transfer.workerId) || 0;
      transfersByWorker.set(transfer.workerId, current + Number(transfer.amount));
    }

    // Reconcile each worker
    for (const workerId of workerIds) {
      const instantPayTotal = transfersByWorker.get(workerId) || 0;

      // Get total earnings for this worker
      const workerEarnings = await this.prisma.workerEarnings.aggregate({
        where: {
          workerId,
          restaurantId,
          earnedAt: {
            gte: payPeriod.startDate,
            lte: payPeriod.endDate,
          },
        },
        _sum: {
          totalEarnings: true,
        },
      });

      const totalEarnings = Number(workerEarnings._sum.totalEarnings || 0);

      // Check for discrepancies
      if (instantPayTotal > totalEarnings) {
        discrepancies.push({
          workerId,
          issue: `Instant pay ($${instantPayTotal}) exceeds total earnings ($${totalEarnings})`,
        });
      }

      totalInstantPayDeducted += instantPayTotal;
    }

    // Mark earnings as paid via regular payroll where applicable
    // (those not already marked as instant pay)
    await this.prisma.workerEarnings.updateMany({
      where: {
        restaurantId,
        earnedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
        paidOut: false,
      },
      data: {
        paidOut: true,
        paidOutAt: new Date(),
        paidOutVia: PayoutVia.REGULAR,
      },
    });

    this.logger.log(
      `Reconciled instant pay for ${workerIds.length} workers: $${totalInstantPayDeducted} deducted`,
    );

    return {
      workersReconciled: workerIds.length,
      totalInstantPayDeducted,
      discrepancies,
    };
  }

  // ==================== Summaries ====================

  /**
   * Get pay period summary
   */
  async getPayPeriodSummary(
    restaurantId: string,
    payPeriod: PayPeriod,
  ): Promise<PayPeriodSummary> {
    // Get shift counts
    const [totalShifts, completedShifts] = await Promise.all([
      this.prisma.shift.count({
        where: {
          restaurantId,
          startTime: {
            gte: payPeriod.startDate,
            lte: payPeriod.endDate,
          },
        },
      }),
      this.prisma.shift.count({
        where: {
          restaurantId,
          startTime: {
            gte: payPeriod.startDate,
            lte: payPeriod.endDate,
          },
          status: 'COMPLETED',
        },
      }),
    ]);

    // Get earnings summary
    const earningsSummary = await this.prisma.workerEarnings.aggregate({
      where: {
        restaurantId,
        earnedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
      },
      _sum: {
        hoursWorked: true,
        totalEarnings: true,
      },
    });

    // Get instant pay summary
    const [transferCount, transferSum] = await Promise.all([
      this.prisma.instantPayTransfer.count({
        where: {
          restaurantId,
          requestedAt: {
            gte: payPeriod.startDate,
            lte: payPeriod.endDate,
          },
          status: TransferStatus.COMPLETED,
        },
      }),
      this.prisma.instantPayTransfer.aggregate({
        where: {
          restaurantId,
          requestedAt: {
            gte: payPeriod.startDate,
            lte: payPeriod.endDate,
          },
          status: TransferStatus.COMPLETED,
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    // Get active worker count
    const activeWorkerCount = await this.prisma.workerEarnings.findMany({
      where: {
        restaurantId,
        earnedAt: {
          gte: payPeriod.startDate,
          lte: payPeriod.endDate,
        },
      },
      distinct: ['workerId'],
      select: { workerId: true },
    });

    return {
      payPeriod,
      totalShifts,
      completedShifts,
      totalHours: Number(earningsSummary._sum.hoursWorked || 0),
      totalEarnings: Number(earningsSummary._sum.totalEarnings || 0),
      instantPayTransferCount: transferCount,
      instantPayTotalAmount: Number(transferSum._sum.amount || 0),
      activeWorkerCount: activeWorkerCount.length,
    };
  }

  // ==================== Export Helpers ====================

  /**
   * Generate CSV export of payroll report
   */
  async exportPayrollToCsv(
    restaurantId: string,
    payPeriod: PayPeriod,
  ): Promise<string> {
    const report = await this.generatePayrollReport(restaurantId, payPeriod);

    const headers = [
      'Worker ID',
      'Worker Name',
      'Hours Worked',
      'Gross Earnings',
      'Tips',
      'Total Earnings',
      'Instant Pay Withdrawals',
      'Regular Pay Amount',
      'Shift Count',
    ];

    const rows = report.workers.map((w) => [
      w.workerId,
      w.workerName,
      w.hoursWorked.toFixed(2),
      w.grossEarnings.toFixed(2),
      w.tips.toFixed(2),
      w.totalEarnings.toFixed(2),
      w.instantPayWithdrawals.toFixed(2),
      w.regularPayAmount.toFixed(2),
      w.shiftCount.toString(),
    ]);

    // Add summary row
    rows.push([
      'TOTAL',
      '',
      report.totalHours.toFixed(2),
      report.totalGrossEarnings.toFixed(2),
      report.totalTips.toFixed(2),
      (report.totalGrossEarnings + report.totalTips).toFixed(2),
      report.totalInstantPayWithdrawals.toFixed(2),
      report.totalRegularPayroll.toFixed(2),
      '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}
