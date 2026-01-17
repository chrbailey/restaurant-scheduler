import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { EarnedWageService } from '../services/earned-wage.service';
import { PayrollSyncService } from '../services/payroll-sync.service';
import { DailyPayClient } from '../clients/dailypay.client';
import { TransferMethod } from '../entities/instant-pay-transfer.entity';
import {
  EnrollInstantPayDto,
  TransferRequestDto,
  TransferHistoryQueryDto,
  PayPeriodDto,
  EarnedWageResponseDto,
  TransferResponseDto,
  TransferHistoryDto,
  EnrollmentStatusDto,
  PayrollReportDto,
  PayPeriodSummaryDto,
  WorkerPayHistoryDto,
  SyncEarningsDto,
  SyncResultDto,
} from '../dto/payments.dto';

/**
 * Payments Controller
 *
 * REST endpoints for earned wage access / instant pay:
 * - Worker enrollment in instant pay
 * - Balance and availability queries
 * - Transfer requests
 * - Transfer history
 * - Payroll reports (for managers)
 */
@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(
    private readonly earnedWageService: EarnedWageService,
    private readonly payrollSyncService: PayrollSyncService,
    private readonly dailyPayClient: DailyPayClient,
  ) {}

  // ==================== Enrollment ====================

  @Post('instant-pay/enroll')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Enroll worker in instant pay program' })
  @ApiResponse({ status: 201, description: 'Successfully enrolled', type: EnrollmentStatusDto })
  async enrollInInstantPay(
    @CurrentUser('workerProfileId') workerId: string,
    @CurrentUser() user: any,
    @Body() dto: EnrollInstantPayDto,
  ): Promise<EnrollmentStatusDto> {
    // Get worker profile details
    const enrolled = await this.dailyPayClient.enrollEmployee(workerId, {
      employeeId: workerId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: dto.email,
      phone: user.phone,
      dateOfBirth: dto.dateOfBirth,
      ssn: dto.ssnLast4,
      bankAccount: dto.bankAccount,
      address: dto.address,
    });

    return {
      enrolled: true,
      externalEmployeeId: enrolled.dailypayEmployeeId,
      status: enrolled.status,
      enrolledAt: new Date(enrolled.enrolledAt),
      bankAccountVerified: enrolled.bankAccountVerified,
    };
  }

  @Get('instant-pay/enrollment-status')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get instant pay enrollment status' })
  @ApiResponse({ status: 200, type: EnrollmentStatusDto })
  async getEnrollmentStatus(
    @CurrentUser('workerProfileId') workerId: string,
  ): Promise<EnrollmentStatusDto> {
    const employee = await this.dailyPayClient.getEmployee(workerId);

    if (!employee) {
      return {
        enrolled: false,
        status: 'UNENROLLED',
        bankAccountVerified: false,
      };
    }

    return {
      enrolled: true,
      externalEmployeeId: employee.dailypayEmployeeId,
      status: employee.status,
      enrolledAt: new Date(employee.enrolledAt),
      bankAccountVerified: employee.bankAccountVerified,
    };
  }

  @Post('instant-pay/unenroll')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Unenroll worker from instant pay program' })
  @ApiResponse({ status: 200, description: 'Successfully unenrolled' })
  async unenrollFromInstantPay(
    @CurrentUser('workerProfileId') workerId: string,
  ) {
    await this.dailyPayClient.unenrollEmployee(workerId);
    return { success: true, message: 'Successfully unenrolled from instant pay' };
  }

  // ==================== Balance & Availability ====================

  @Get('instant-pay/balance')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get available instant pay balance' })
  @ApiResponse({ status: 200, type: EarnedWageResponseDto })
  async getInstantPayBalance(
    @CurrentUser('workerProfileId') workerId: string,
  ): Promise<EarnedWageResponseDto> {
    return this.earnedWageService.getEarnedWageStatus(workerId);
  }

  // ==================== Transfers ====================

  @Post('instant-pay/transfer')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Request instant pay transfer' })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request or insufficient balance' })
  async requestTransfer(
    @CurrentUser('workerProfileId') workerId: string,
    @Body() dto: TransferRequestDto,
  ): Promise<TransferResponseDto> {
    const result = await this.earnedWageService.requestInstantPay(
      workerId,
      dto.amount,
      dto.method || TransferMethod.INSTANT,
    );

    if (!result.success) {
      throw new Error(result.error || 'Transfer request failed');
    }

    return {
      id: result.transferId!,
      externalTransferId: result.externalTransferId,
      amount: result.amount,
      fee: result.fee,
      netAmount: result.netAmount,
      status: result.status,
      requestedAt: new Date(),
    };
  }

  @Get('instant-pay/history')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get instant pay transfer history' })
  @ApiResponse({ status: 200, type: TransferHistoryDto })
  async getTransferHistory(
    @CurrentUser('workerProfileId') workerId: string,
    @Query() query: TransferHistoryQueryDto,
  ): Promise<TransferHistoryDto> {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const history = await this.dailyPayClient.getTransferHistory(
      workerId,
      {
        startDate: startDate?.toISOString() || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: endDate?.toISOString() || new Date().toISOString(),
      },
      {
        page: query.page,
        limit: query.limit,
      },
    );

    return {
      transfers: history.transfers.map((t) => ({
        id: t.transferId,
        amount: t.amount,
        fee: t.fee,
        netAmount: t.netAmount,
        status: t.status,
        requestedAt: new Date(t.requestedAt),
        processedAt: t.processedAt ? new Date(t.processedAt) : undefined,
        failureReason: t.failureReason,
      })),
      total: history.total,
      page: history.page,
      limit: history.limit,
      hasMore: history.page * history.limit < history.total,
    };
  }

  // ==================== Pay History ====================

  @Get('instant-pay/pay-history')
  @Roles('WORKER', 'SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get combined pay history (instant + regular)' })
  @ApiResponse({ status: 200, type: WorkerPayHistoryDto })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPayHistory(
    @CurrentUser('workerProfileId') workerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<WorkerPayHistoryDto> {
    return this.earnedWageService.getWorkerPayHistory(workerId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      limit,
    });
  }

  // ==================== Payroll Reports (Manager) ====================

  @Get('payroll/report/:restaurantId')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Generate payroll report for pay period' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, type: PayrollReportDto })
  async getPayrollReport(
    @Param('restaurantId') restaurantId: string,
    @Query() payPeriod: PayPeriodDto,
  ): Promise<PayrollReportDto> {
    const report = await this.payrollSyncService.generatePayrollReport(
      restaurantId,
      {
        startDate: new Date(payPeriod.startDate),
        endDate: new Date(payPeriod.endDate),
      },
    );

    return {
      ...report,
      payPeriod: {
        startDate: payPeriod.startDate,
        endDate: payPeriod.endDate,
      },
    };
  }

  @Get('payroll/report/:restaurantId/export')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Export payroll report as CSV' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  async exportPayrollReport(
    @Param('restaurantId') restaurantId: string,
    @Query() payPeriod: PayPeriodDto,
    @Res() res: Response,
  ) {
    const csv = await this.payrollSyncService.exportPayrollToCsv(
      restaurantId,
      {
        startDate: new Date(payPeriod.startDate),
        endDate: new Date(payPeriod.endDate),
      },
    );

    const filename = `payroll-${restaurantId}-${payPeriod.startDate}-${payPeriod.endDate}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(csv);
  }

  @Get('payroll/summary/:restaurantId')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Get pay period summary' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, type: PayPeriodSummaryDto })
  async getPayPeriodSummary(
    @Param('restaurantId') restaurantId: string,
    @Query() payPeriod: PayPeriodDto,
  ): Promise<PayPeriodSummaryDto> {
    const summary = await this.payrollSyncService.getPayPeriodSummary(
      restaurantId,
      {
        startDate: new Date(payPeriod.startDate),
        endDate: new Date(payPeriod.endDate),
      },
    );

    return {
      ...summary,
      payPeriod: {
        startDate: payPeriod.startDate,
        endDate: payPeriod.endDate,
      },
    };
  }

  @Post('payroll/reconcile/:restaurantId')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Reconcile instant pay with regular payroll' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  async reconcilePayroll(
    @Param('restaurantId') restaurantId: string,
    @Body() payPeriod: PayPeriodDto,
  ) {
    return this.payrollSyncService.reconcileInstantPay(
      restaurantId,
      {
        startDate: new Date(payPeriod.startDate),
        endDate: new Date(payPeriod.endDate),
      },
    );
  }

  // ==================== Sync Operations ====================

  @Post('sync/earnings')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Manually sync completed shifts to earnings' })
  @ApiResponse({ status: 200, type: SyncResultDto })
  async syncEarnings(
    @Body() dto: SyncEarningsDto,
  ): Promise<SyncResultDto> {
    return this.payrollSyncService.syncCompletedShifts(dto.restaurantId, {
      since: dto.since ? new Date(dto.since) : undefined,
      workerIds: dto.workerIds,
    });
  }

  // ==================== Admin / System ====================

  @Get('health')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({ summary: 'Check DailyPay integration health' })
  async healthCheck() {
    return this.dailyPayClient.healthCheck();
  }
}

/**
 * Webhook Controller for DailyPay callbacks
 */
@ApiTags('payments-webhooks')
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(private readonly earnedWageService: EarnedWageService) {}

  @Post('dailypay/transfer-status')
  @ApiOperation({ summary: 'Receive transfer status update from DailyPay' })
  async handleTransferStatusWebhook(
    @Body()
    data: {
      externalTransferId: string;
      status: string;
      processedAt?: string;
      failureReason?: string;
    },
  ) {
    // TODO: Validate webhook signature

    await this.earnedWageService.updateTransferStatus(
      data.externalTransferId,
      data.status as any,
      data.processedAt ? new Date(data.processedAt) : undefined,
      data.failureReason,
    );

    return { received: true };
  }
}
