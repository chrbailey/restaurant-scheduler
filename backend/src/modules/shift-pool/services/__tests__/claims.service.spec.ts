import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ClaimsService } from '../claims.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ShiftStateMachine } from '@/modules/scheduling/services/shift-state-machine.service';
import { ShiftMatcherService } from '../shift-matcher.service';
import { ShiftStatus } from '@restaurant-scheduler/shared';

describe('ClaimsService', () => {
  let service: ClaimsService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let stateMachine: jest.Mocked<ShiftStateMachine>;
  let matcher: jest.Mocked<ShiftMatcherService>;

  // Test fixtures
  const mockRestaurant = {
    id: 'restaurant-1',
    name: 'Test Restaurant',
    autoApproveThreshold: 4.0,
    requireClaimApproval: false,
  };

  const mockShift = {
    id: 'shift-123',
    restaurantId: 'restaurant-1',
    position: 'SERVER',
    status: ShiftStatus.PUBLISHED_UNASSIGNED,
    startTime: new Date(Date.now() + 86400000),
    endTime: new Date(Date.now() + 86400000 + 28800000),
    autoApprove: true,
    minReputationScore: null,
    restaurant: mockRestaurant,
  };

  const mockWorkerProfile = {
    id: 'worker-1',
    userId: 'user-1',
    restaurantId: 'restaurant-1',
    positions: ['SERVER', 'HOST'],
    reliabilityScore: 4.5,
    tier: 'PRIMARY',
    user: {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: null,
    },
  };

  const mockClaim = {
    id: 'claim-123',
    shiftId: 'shift-123',
    workerProfileId: 'worker-1',
    priorityScore: 1500,
    status: 'PENDING',
    notes: null,
    claimedAt: new Date(),
    resolvedAt: null,
    resolvedById: null,
    rejectionReason: null,
    workerProfile: mockWorkerProfile,
    shift: mockShift,
  };

  const mockPrisma = {
    shift: {
      findUnique: jest.fn(),
    },
    shiftClaim: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    workerProfile: {
      findUnique: jest.fn(),
    },
  };

  const mockRedis = {
    invalidateShiftCache: jest.fn(),
  };

  const mockStateMachine = {
    assign: jest.fn(),
    confirm: jest.fn(),
    transition: jest.fn(),
  };

  const mockMatcher = {
    calculateClaimPriority: jest.fn(),
    isWorkerAvailable: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ShiftStateMachine, useValue: mockStateMachine },
        { provide: ShiftMatcherService, useValue: mockMatcher },
      ],
    }).compile();

    service = module.get<ClaimsService>(ClaimsService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    stateMachine = module.get(ShiftStateMachine);
    matcher = module.get(ShiftMatcherService);
  });

  describe('claim', () => {
    // Use a shift with autoApprove: false for basic tests
    const nonAutoApproveShift = { ...mockShift, autoApprove: false };

    beforeEach(() => {
      mockPrisma.shift.findUnique.mockResolvedValue(nonAutoApproveShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(null);
      mockMatcher.isWorkerAvailable.mockResolvedValue(true);
      mockMatcher.calculateClaimPriority.mockResolvedValue(1500);
      mockPrisma.shiftClaim.create.mockResolvedValue(mockClaim);
    });

    it('should create a claim for valid shift and worker', async () => {
      const result = await service.claim(mockShift.id, mockWorkerProfile.id, 'Please assign me');

      expect(mockPrisma.shiftClaim.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shiftId: mockShift.id,
          workerProfileId: mockWorkerProfile.id,
          priorityScore: 1500,
          notes: 'Please assign me',
        }),
        include: expect.any(Object),
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.claim('nonexistent', mockWorkerProfile.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when shift is not available', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
      });

      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow('not available for claiming');
    });

    it('should throw ConflictException when worker already claimed', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(mockClaim);

      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow('already claimed');
    });

    it('should throw NotFoundException when worker profile not found', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.claim(mockShift.id, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when worker not qualified for position', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        position: 'BARTENDER',
      });

      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow('not qualified');
    });

    it('should throw BadRequestException when worker has scheduling conflict', async () => {
      mockMatcher.isWorkerAvailable.mockResolvedValue(false);

      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow('scheduling conflict');
    });

    it('should throw BadRequestException when worker does not meet reputation requirement', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        minReputationScore: 4.8, // Higher than worker's 4.5
      });

      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow('minimum reputation');
    });

    describe('auto-approval', () => {
      it('should auto-approve when all conditions are met', async () => {
        // Same restaurant + reliability >= threshold + autoApprove enabled
        // Use mockShift (which has autoApprove: true)
        mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
        mockPrisma.shiftClaim.create.mockResolvedValue(mockClaim);

        const approvedClaim = { ...mockClaim, status: 'APPROVED' };
        mockPrisma.shiftClaim.findUnique
          .mockResolvedValueOnce(null) // First call for duplicate check
          .mockResolvedValueOnce(mockClaim) // For approveClaim lookup
          .mockResolvedValueOnce(approvedClaim); // Final return

        mockPrisma.shiftClaim.update.mockResolvedValue(approvedClaim);
        mockPrisma.shiftClaim.updateMany.mockResolvedValue({ count: 0 });

        await service.claim(mockShift.id, mockWorkerProfile.id);

        // Should call approveClaim internally (via assign and confirm)
        expect(mockStateMachine.assign).toHaveBeenCalled();
      });

      it('should not auto-approve when worker is from different restaurant', async () => {
        mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
        mockPrisma.workerProfile.findUnique.mockResolvedValue({
          ...mockWorkerProfile,
          restaurantId: 'restaurant-2', // Different restaurant
        });

        await service.claim(mockShift.id, mockWorkerProfile.id);

        // Should not auto-approve - stateMachine.assign should not be called
        expect(mockStateMachine.assign).not.toHaveBeenCalled();
      });

      it('should not auto-approve when reliability is below threshold', async () => {
        mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
        mockPrisma.workerProfile.findUnique.mockResolvedValue({
          ...mockWorkerProfile,
          reliabilityScore: 3.5, // Below 4.0 threshold
        });

        await service.claim(mockShift.id, mockWorkerProfile.id);

        expect(mockStateMachine.assign).not.toHaveBeenCalled();
      });

      it('should not auto-approve when autoApprove is disabled on shift', async () => {
        // nonAutoApproveShift is already used in beforeEach
        // This test verifies the default behavior

        await service.claim(mockShift.id, mockWorkerProfile.id);

        expect(mockStateMachine.assign).not.toHaveBeenCalled();
      });
    });

    it('should invalidate cache after creating claim', async () => {
      await service.claim(mockShift.id, mockWorkerProfile.id);

      expect(mockRedis.invalidateShiftCache).toHaveBeenCalledWith(mockShift.restaurantId);
    });
  });

  describe('approveClaim', () => {
    beforeEach(() => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(mockClaim);
      mockPrisma.shiftClaim.update.mockResolvedValue({ ...mockClaim, status: 'APPROVED' });
      mockPrisma.shiftClaim.updateMany.mockResolvedValue({ count: 2 });
    });

    it('should approve a pending claim', async () => {
      const result = await service.approveClaim(mockClaim.id, 'manager-1');

      expect(mockPrisma.shiftClaim.update).toHaveBeenCalledWith({
        where: { id: mockClaim.id },
        data: expect.objectContaining({
          status: 'APPROVED',
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should reject all other pending claims for the shift', async () => {
      await service.approveClaim(mockClaim.id, 'manager-1');

      expect(mockPrisma.shiftClaim.updateMany).toHaveBeenCalledWith({
        where: {
          shiftId: mockClaim.shiftId,
          id: { not: mockClaim.id },
          status: 'PENDING',
        },
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Another claim was approved',
        }),
      });
    });

    it('should assign the shift to the worker', async () => {
      await service.approveClaim(mockClaim.id, 'manager-1');

      expect(mockStateMachine.assign).toHaveBeenCalledWith(
        mockClaim.shiftId,
        mockClaim.workerProfileId,
        'manager-1',
      );
    });

    it('should auto-confirm for same restaurant workers', async () => {
      await service.approveClaim(mockClaim.id, 'manager-1');

      expect(mockStateMachine.confirm).toHaveBeenCalledWith(
        mockClaim.shiftId,
        'manager-1',
      );
    });

    it('should not auto-confirm for network workers', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue({
        ...mockClaim,
        workerProfile: {
          ...mockWorkerProfile,
          restaurantId: 'restaurant-2', // Different restaurant
        },
      });

      await service.approveClaim(mockClaim.id, 'manager-1');

      expect(mockStateMachine.confirm).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when claim not found', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(null);

      await expect(
        service.approveClaim('nonexistent', 'manager-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when claim already resolved', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: 'APPROVED',
      });

      await expect(
        service.approveClaim(mockClaim.id, 'manager-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.approveClaim(mockClaim.id, 'manager-1'),
      ).rejects.toThrow('already been resolved');
    });

    it('should invalidate cache after approval', async () => {
      await service.approveClaim(mockClaim.id, 'manager-1');

      expect(mockRedis.invalidateShiftCache).toHaveBeenCalledWith(mockShift.restaurantId);
    });
  });

  describe('rejectClaim', () => {
    beforeEach(() => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(mockClaim);
      mockPrisma.shiftClaim.update.mockResolvedValue({ ...mockClaim, status: 'REJECTED' });
    });

    it('should reject a pending claim', async () => {
      await service.rejectClaim(mockClaim.id, 'manager-1', 'Position already filled');

      expect(mockPrisma.shiftClaim.update).toHaveBeenCalledWith({
        where: { id: mockClaim.id },
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Position already filled',
          resolvedAt: expect.any(Date),
          resolvedById: 'manager-1',
        }),
      });
    });

    it('should use default rejection reason when not provided', async () => {
      await service.rejectClaim(mockClaim.id, 'manager-1');

      expect(mockPrisma.shiftClaim.update).toHaveBeenCalledWith({
        where: { id: mockClaim.id },
        data: expect.objectContaining({
          rejectionReason: 'Rejected by manager',
        }),
      });
    });

    it('should throw NotFoundException when claim not found', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectClaim('nonexistent', 'manager-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when claim already resolved', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: 'REJECTED',
      });

      await expect(
        service.rejectClaim(mockClaim.id, 'manager-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('withdrawClaim', () => {
    beforeEach(() => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(mockClaim);
      mockPrisma.shiftClaim.delete.mockResolvedValue(mockClaim);
    });

    it('should allow worker to withdraw their pending claim', async () => {
      const result = await service.withdrawClaim(mockClaim.id, mockWorkerProfile.id);

      expect(mockPrisma.shiftClaim.delete).toHaveBeenCalledWith({
        where: { id: mockClaim.id },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException when claim not found', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(null);

      await expect(
        service.withdrawClaim('nonexistent', mockWorkerProfile.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when withdrawing another worker claim', async () => {
      await expect(
        service.withdrawClaim(mockClaim.id, 'other-worker'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.withdrawClaim(mockClaim.id, 'other-worker'),
      ).rejects.toThrow('only withdraw your own claims');
    });

    it('should throw BadRequestException when claim already resolved', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue({
        ...mockClaim,
        status: 'APPROVED',
      });

      await expect(
        service.withdrawClaim(mockClaim.id, mockWorkerProfile.id),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.withdrawClaim(mockClaim.id, mockWorkerProfile.id),
      ).rejects.toThrow('already been resolved');
    });
  });

  describe('getClaimsForShift', () => {
    it('should return claims ordered by priority score', async () => {
      const claims = [
        { ...mockClaim, id: 'claim-1', priorityScore: 1200 },
        { ...mockClaim, id: 'claim-2', priorityScore: 1500 },
        { ...mockClaim, id: 'claim-3', priorityScore: 800 },
      ];
      mockPrisma.shiftClaim.findMany.mockResolvedValue(claims);

      const result = await service.getClaimsForShift(mockShift.id);

      expect(mockPrisma.shiftClaim.findMany).toHaveBeenCalledWith({
        where: { shiftId: mockShift.id },
        include: expect.any(Object),
        orderBy: { priorityScore: 'desc' },
      });
      expect(result).toEqual(claims);
    });
  });

  describe('getClaimsByWorker', () => {
    it('should return all claims for a worker', async () => {
      const claims = [mockClaim, { ...mockClaim, id: 'claim-2', shiftId: 'shift-456' }];
      mockPrisma.shiftClaim.findMany.mockResolvedValue(claims);

      const result = await service.getClaimsByWorker(mockWorkerProfile.id);

      expect(mockPrisma.shiftClaim.findMany).toHaveBeenCalledWith({
        where: { workerProfileId: mockWorkerProfile.id },
        include: expect.any(Object),
        orderBy: { claimedAt: 'desc' },
      });
      expect(result).toEqual(claims);
    });

    it('should filter by status when provided', async () => {
      mockPrisma.shiftClaim.findMany.mockResolvedValue([mockClaim]);

      await service.getClaimsByWorker(mockWorkerProfile.id, 'PENDING');

      expect(mockPrisma.shiftClaim.findMany).toHaveBeenCalledWith({
        where: {
          workerProfileId: mockWorkerProfile.id,
          status: 'PENDING',
        },
        include: expect.any(Object),
        orderBy: { claimedAt: 'desc' },
      });
    });
  });

  describe('getPendingClaimsForRestaurant', () => {
    it('should return pending claims grouped by shift', async () => {
      const claims = [
        mockClaim,
        { ...mockClaim, id: 'claim-2', workerProfileId: 'worker-2' },
      ];
      mockPrisma.shiftClaim.findMany.mockResolvedValue(claims);

      const result = await service.getPendingClaimsForRestaurant(mockRestaurant.id);

      expect(mockPrisma.shiftClaim.findMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          shift: { restaurantId: mockRestaurant.id },
        },
        include: expect.any(Object),
        orderBy: [
          { shift: { startTime: 'asc' } },
          { priorityScore: 'desc' },
        ],
      });
      expect(result).toEqual(claims);
    });
  });

  describe('concurrent claim handling', () => {
    // Use a shift with autoApprove: false to avoid triggering auto-approval logic
    const nonAutoApproveShift = { ...mockShift, autoApprove: false };

    it('should handle multiple simultaneous claims using priority scoring', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(nonAutoApproveShift);
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(null);

      // Simulate two workers claiming at the same time with different priorities
      const worker1 = { ...mockWorkerProfile, id: 'worker-1', reliabilityScore: 4.8 };
      const worker2 = { ...mockWorkerProfile, id: 'worker-2', reliabilityScore: 3.5 };

      mockPrisma.workerProfile.findUnique
        .mockResolvedValueOnce(worker1)
        .mockResolvedValueOnce(worker2);

      mockMatcher.calculateClaimPriority
        .mockResolvedValueOnce(1650) // Higher priority for worker 1
        .mockResolvedValueOnce(1200); // Lower priority for worker 2

      mockPrisma.shiftClaim.create.mockImplementation((args) =>
        Promise.resolve({
          id: `claim-${args.data.workerProfileId}`,
          ...args.data,
          workerProfile: args.data.workerProfileId === 'worker-1' ? worker1 : worker2,
        }),
      );

      // Both claims should be created
      const claim1 = await service.claim(mockShift.id, 'worker-1');
      const claim2 = await service.claim(mockShift.id, 'worker-2');

      // Priority scores should be different
      expect(claim1?.priorityScore).toBe(1650);
      expect(claim2?.priorityScore).toBe(1200);
    });

    it('should reject claim if worker already has pending claim', async () => {
      mockPrisma.shiftClaim.findUnique.mockResolvedValue(mockClaim);

      await expect(
        service.claim(mockShift.id, mockWorkerProfile.id),
      ).rejects.toThrow(ConflictException);
    });
  });
});
