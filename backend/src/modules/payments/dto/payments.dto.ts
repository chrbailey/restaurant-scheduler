import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  IsBoolean,
  IsEmail,
  IsPhoneNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransferStatus, TransferMethod } from '../entities/instant-pay-transfer.entity';
import { PayoutVia } from '../entities/worker-earnings.entity';

// ==================== Enrollment DTOs ====================

/**
 * Bank account details for enrollment
 */
export class BankAccountDto {
  @ApiProperty({
    description: 'Bank routing number',
    example: '021000021',
  })
  @IsString()
  routingNumber: string;

  @ApiProperty({
    description: 'Bank account number',
    example: '123456789',
  })
  @IsString()
  accountNumber: string;

  @ApiProperty({
    description: 'Account type',
    enum: ['checking', 'savings'],
    example: 'checking',
  })
  @IsEnum(['checking', 'savings'])
  accountType: 'checking' | 'savings';
}

/**
 * Address for enrollment
 */
export class AddressDto {
  @ApiProperty({
    description: 'Street address',
    example: '123 Main St',
  })
  @IsString()
  street: string;

  @ApiProperty({
    description: 'City',
    example: 'New York',
  })
  @IsString()
  city: string;

  @ApiProperty({
    description: 'State (2-letter code)',
    example: 'NY',
  })
  @IsString()
  state: string;

  @ApiProperty({
    description: 'ZIP code',
    example: '10001',
  })
  @IsString()
  zipCode: string;
}

/**
 * Enroll in instant pay DTO
 */
export class EnrollInstantPayDto {
  @ApiProperty({
    description: 'Email address',
    example: 'worker@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Date of birth (YYYY-MM-DD)',
    example: '1990-01-15',
  })
  @IsDateString()
  dateOfBirth: string;

  @ApiPropertyOptional({
    description: 'Last 4 digits of SSN (for verification)',
    example: '1234',
  })
  @IsOptional()
  @IsString()
  ssnLast4?: string;

  @ApiPropertyOptional({
    description: 'Bank account details',
    type: BankAccountDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;

  @ApiPropertyOptional({
    description: 'Mailing address',
    type: AddressDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional({
    description: 'Agree to terms and conditions',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  agreeToTerms?: boolean;
}

/**
 * Enrollment status response
 */
export class EnrollmentStatusDto {
  @ApiProperty({
    description: 'Whether the worker is enrolled',
    example: true,
  })
  enrolled: boolean;

  @ApiPropertyOptional({
    description: 'External DailyPay employee ID',
    example: 'dp_emp_123456',
  })
  externalEmployeeId?: string;

  @ApiProperty({
    description: 'Enrollment status',
    enum: ['ACTIVE', 'PENDING', 'SUSPENDED', 'UNENROLLED'],
    example: 'ACTIVE',
  })
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'UNENROLLED';

  @ApiPropertyOptional({
    description: 'Date enrolled',
  })
  enrolledAt?: Date;

  @ApiProperty({
    description: 'Whether bank account is verified',
    example: true,
  })
  bankAccountVerified: boolean;
}

// ==================== Transfer DTOs ====================

/**
 * Request instant pay transfer DTO
 */
export class TransferRequestDto {
  @ApiProperty({
    description: 'Amount to transfer in dollars',
    example: 50,
    minimum: 5,
  })
  @IsNumber()
  @Min(5)
  amount: number;

  @ApiPropertyOptional({
    description: 'Transfer method',
    enum: TransferMethod,
    default: TransferMethod.INSTANT,
  })
  @IsOptional()
  @IsEnum(TransferMethod)
  method?: TransferMethod;
}

/**
 * Transfer response DTO
 */
export class TransferResponseDto {
  @ApiProperty({
    description: 'Internal transfer ID',
    example: 'uuid-of-transfer',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'External DailyPay transfer ID',
    example: 'dp_txn_789012',
  })
  externalTransferId?: string;

  @ApiProperty({
    description: 'Transfer amount',
    example: 50,
  })
  amount: number;

  @ApiProperty({
    description: 'Transfer fee',
    example: 2.99,
  })
  fee: number;

  @ApiProperty({
    description: 'Net amount after fee',
    example: 47.01,
  })
  netAmount: number;

  @ApiProperty({
    description: 'Transfer status',
    enum: TransferStatus,
    example: TransferStatus.PENDING,
  })
  status: TransferStatus;

  @ApiProperty({
    description: 'When the transfer was requested',
  })
  requestedAt: Date;

  @ApiPropertyOptional({
    description: 'When the transfer was processed',
  })
  processedAt?: Date;

  @ApiPropertyOptional({
    description: 'Estimated arrival time',
  })
  estimatedArrival?: Date;
}

/**
 * Transfer history query DTO
 */
export class TransferHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Start date filter (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO 8601)',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: TransferStatus,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TransferStatus, { each: true })
  status?: TransferStatus[];

  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Transfer history item DTO
 */
export class TransferHistoryItemDto {
  @ApiProperty({ description: 'Transfer ID' })
  id: string;

  @ApiProperty({ description: 'Transfer amount' })
  amount: number;

  @ApiProperty({ description: 'Transfer fee' })
  fee: number;

  @ApiProperty({ description: 'Net amount' })
  netAmount: number;

  @ApiProperty({ enum: TransferStatus })
  status: TransferStatus;

  @ApiProperty()
  requestedAt: Date;

  @ApiPropertyOptional()
  processedAt?: Date;

  @ApiPropertyOptional()
  failureReason?: string;
}

/**
 * Transfer history response DTO
 */
export class TransferHistoryDto {
  @ApiProperty({ type: [TransferHistoryItemDto] })
  transfers: TransferHistoryItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  hasMore: boolean;
}

// ==================== Earned Wage DTOs ====================

/**
 * Earned wage balance response DTO
 */
export class EarnedWageResponseDto {
  @ApiProperty({
    description: 'Total earned wages (not yet paid)',
    example: 450.5,
  })
  totalEarned: number;

  @ApiProperty({
    description: 'Amount available for instant transfer',
    example: 360.4,
  })
  availableForTransfer: number;

  @ApiProperty({
    description: 'Amount pending in transfers',
    example: 50,
  })
  pendingTransfers: number;

  @ApiProperty({
    description: 'Already transferred this pay period',
    example: 100,
  })
  transferredThisPeriod: number;

  @ApiProperty({
    description: 'Remaining transfer limit for today',
    example: 400,
  })
  dailyLimitRemaining: number;

  @ApiProperty({
    description: 'Remaining transfer limit for this week',
    example: 900,
  })
  weeklyLimitRemaining: number;

  @ApiProperty({
    description: 'Fee for transfer (current rate)',
    example: 2.99,
  })
  currentFee: number;

  @ApiProperty({
    description: 'When balance was last updated',
  })
  lastUpdated: Date;
}

// ==================== Payroll DTOs ====================

/**
 * Pay period specification
 */
export class PayPeriodDto {
  @ApiProperty({
    description: 'Start of pay period (ISO 8601)',
    example: '2024-01-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End of pay period (ISO 8601)',
    example: '2024-01-14',
  })
  @IsDateString()
  endDate: string;
}

/**
 * Worker payroll summary
 */
export class WorkerPayrollSummaryDto {
  @ApiProperty({ description: 'Worker profile ID' })
  workerId: string;

  @ApiProperty({ description: 'Worker name' })
  workerName: string;

  @ApiProperty({ description: 'Total hours worked' })
  hoursWorked: number;

  @ApiProperty({ description: 'Gross earnings' })
  grossEarnings: number;

  @ApiProperty({ description: 'Tips earned' })
  tips: number;

  @ApiProperty({ description: 'Total earnings (gross + tips)' })
  totalEarnings: number;

  @ApiProperty({ description: 'Already paid via instant pay' })
  instantPayWithdrawals: number;

  @ApiProperty({ description: 'Amount for regular payroll' })
  regularPayAmount: number;

  @ApiProperty({ description: 'Number of shifts completed' })
  shiftCount: number;
}

/**
 * Payroll report response DTO
 */
export class PayrollReportDto {
  @ApiProperty({ description: 'Restaurant ID' })
  restaurantId: string;

  @ApiProperty({ description: 'Restaurant name' })
  restaurantName: string;

  @ApiProperty({ type: PayPeriodDto })
  payPeriod: PayPeriodDto;

  @ApiProperty({ type: [WorkerPayrollSummaryDto] })
  workers: WorkerPayrollSummaryDto[];

  @ApiProperty({ description: 'Total hours worked by all workers' })
  totalHours: number;

  @ApiProperty({ description: 'Total gross earnings' })
  totalGrossEarnings: number;

  @ApiProperty({ description: 'Total tips' })
  totalTips: number;

  @ApiProperty({ description: 'Total instant pay withdrawals' })
  totalInstantPayWithdrawals: number;

  @ApiProperty({ description: 'Total for regular payroll' })
  totalRegularPayroll: number;

  @ApiProperty({ description: 'When report was generated' })
  generatedAt: Date;
}

/**
 * Pay period summary response DTO
 */
export class PayPeriodSummaryDto {
  @ApiProperty({ type: PayPeriodDto })
  payPeriod: PayPeriodDto;

  @ApiProperty({ description: 'Total shifts in period' })
  totalShifts: number;

  @ApiProperty({ description: 'Completed shifts' })
  completedShifts: number;

  @ApiProperty({ description: 'Total hours worked' })
  totalHours: number;

  @ApiProperty({ description: 'Total earnings' })
  totalEarnings: number;

  @ApiProperty({ description: 'Instant pay transfers count' })
  instantPayTransferCount: number;

  @ApiProperty({ description: 'Instant pay total amount' })
  instantPayTotalAmount: number;

  @ApiProperty({ description: 'Workers with completed shifts' })
  activeWorkerCount: number;
}

// ==================== Worker Pay History DTOs ====================

/**
 * Pay history item
 */
export class PayHistoryItemDto {
  @ApiProperty({ description: 'Payment ID' })
  id: string;

  @ApiProperty({
    description: 'Payment type',
    enum: ['INSTANT', 'REGULAR'],
  })
  type: 'INSTANT' | 'REGULAR';

  @ApiProperty({ description: 'Gross amount' })
  grossAmount: number;

  @ApiProperty({ description: 'Fees (if any)' })
  fees: number;

  @ApiProperty({ description: 'Net amount received' })
  netAmount: number;

  @ApiProperty({ description: 'Payment date' })
  paidAt: Date;

  @ApiProperty({ description: 'Status' })
  status: string;

  @ApiPropertyOptional({ description: 'Related shift IDs' })
  shiftIds?: string[];
}

/**
 * Worker pay history response
 */
export class WorkerPayHistoryDto {
  @ApiProperty({ type: [PayHistoryItemDto] })
  payments: PayHistoryItemDto[];

  @ApiProperty({ description: 'Total instant pay received' })
  totalInstantPay: number;

  @ApiProperty({ description: 'Total regular pay received' })
  totalRegularPay: number;

  @ApiProperty({ description: 'Total fees paid' })
  totalFees: number;

  @ApiProperty({ description: 'Total net pay received' })
  totalNetPay: number;
}

// ==================== Sync DTOs ====================

/**
 * Earnings sync request DTO
 */
export class SyncEarningsDto {
  @ApiProperty({
    description: 'Restaurant ID',
    example: 'uuid-of-restaurant',
  })
  @IsUUID()
  restaurantId: string;

  @ApiPropertyOptional({
    description: 'Specific worker IDs to sync (defaults to all)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  workerIds?: string[];

  @ApiPropertyOptional({
    description: 'Only sync shifts completed after this date',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  since?: string;
}

/**
 * Sync result response
 */
export class SyncResultDto {
  @ApiProperty({ description: 'Number of shifts synced' })
  shiftsProcessed: number;

  @ApiProperty({ description: 'Number of workers updated' })
  workersUpdated: number;

  @ApiProperty({ description: 'Total earnings synced' })
  totalEarningsSynced: number;

  @ApiProperty({ description: 'Any errors encountered' })
  errors: string[];

  @ApiProperty({ description: 'Sync completion time' })
  completedAt: Date;
}
