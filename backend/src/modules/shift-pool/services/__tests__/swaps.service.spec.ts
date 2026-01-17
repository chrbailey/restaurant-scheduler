import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SwapsService } from '../swaps.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ShiftStateMachine } from '@/modules/scheduling/services/shift-state-machine.service';
import { ShiftMatcherService } from '../shift-matcher.service';
import { ShiftStatus, Position } from '@restaurant-scheduler/shared';

describe('SwapsService', () => {
  let service: SwapsService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let stateMachine: jest.Mocked<ShiftStateMachine>;
  let matcher: jest.Mocked<ShiftMatcherService>;

  // Test fixtures
  const mockRestaurant = {
    id: 'restaurant-1',
    name: 'Test Restaurant',
    networkId: 'network-1',
    allowCrossRestaurantSwaps: true,
    autoApproveThreshold: 4.0,
  };

  const mockUser1 = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    avatarUrl: null,
  };

  const mockUser2 = {
    id: 'user-2',
    firstName: 'Jane',
    lastName: 'Smith',
    avatarUrl: null,
  };

  const mockWorkerProfile1 = {
    id: 'worker-1',
    userId: 'user-1',
    restaurantId: 'restaurant-1',
    positions: [Position.SERVER, Position.HOST],
    status: 'ACTIVE',
    reliabilityScore: 4.5,
    user: mockUser1,
    restaurant: mockRestaurant,
  };

  const mockWorkerProfile2 = {
    id: 'worker-2',
    userId: 'user-2',
    restaurantId: 'restaurant-1',
    positions: [Position.SERVER, Position.BARTENDER],
    status: 'ACTIVE',
    reliabilityScore: 4.2,
    user: mockUser2,
    restaurant: mockRestaurant,
  };

  const mockShift1 = {
    id: 'shift-1',
    restaurantId: 'restaurant-1',
    position: Position.SERVER,
    status: ShiftStatus.CONFIRMED,
    startTime: new Date(Date.now() + 172800000), // 2 days from now
    endTime: new Date(Date.now() + 172800000 + 28800000),
    assignedToId: 'worker-1',
    assignedTo: mockWorkerProfile1,
    restaurant: mockRestaurant,
  };

  const mockShift2 = {
    id: 'shift-2',
    restaurantId: 'restaurant-1',
    position: Position.SERVER,
    status: ShiftStatus.CONFIRMED,
    startTime: new Date(Date.now() + 259200000), // 3 days from now
    endTime: new Date(Date.now() + 259200000 + 28800000),
    assignedToId: 'worker-2',
    assignedTo: mockWorkerProfile2,
    restaurant: mockRestaurant,
  };

  const mockSwapRequest = {
    id: 'swap-1',
    sourceShiftId: 'shift-1',
    sourceWorkerId: 'worker-1',
    targetShiftId: 'shift-2',
    targetWorkerId: 'worker-2',
    status: 'PENDING',
    requiresApproval: true,
    managerApproved: null,
    approvedById: null,
    message: 'Need to swap due to personal conflict',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 172800000), // 48 hours default
    resolvedAt: null,
    sourceShift: mockShift1,
    targetShift: mockShift2,
    sourceWorker: mockWorkerProfile1,
    targetWorker: mockWorkerProfile2,
    approvedBy: null,
  };

  const mockPrisma = {
    shiftSwap: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    shift: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    workerProfile: {
      findUnique: jest.fn(),
    },
    restaurant: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockRedis = {
    invalidateShiftCache: jest.fn(),
  };

  const mockStateMachine = {
    releaseToPool: jest.fn(),
  };

  const mockMatcher = {
    isWorkerAvailable: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwapsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ShiftStateMachine, useValue: mockStateMachine },
        { provide: ShiftMatcherService, useValue: mockMatcher },
      ],
    }).compile();

    service = module.get<SwapsService>(SwapsService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    stateMachine = module.get(ShiftStateMachine);
    matcher = module.get(ShiftMatcherService);
  });

  describe('createSwap', () => {
    beforeEach(() => {
      mockPrisma.shift.findUnique.mockImplementation((args: any) => {
        if (args.where.id === 'shift-1') return Promise.resolve(mockShift1);
        if (args.where.id === 'shift-2') return Promise.resolve(mockShift2);
        return Promise.resolve(null);
      });
      mockPrisma.workerProfile.findUnique.mockImplementation((args: any) => {
        if (args.where.id === 'worker-1') return Promise.resolve(mockWorkerProfile1);
        if (args.where.id === 'worker-2') return Promise.resolve(mockWorkerProfile2);
        return Promise.resolve(null);
      });
      mockMatcher.isWorkerAvailable.mockResolvedValue(true);
      mockPrisma.shiftSwap.create.mockResolvedValue(mockSwapRequest);
    });

    it('should create a valid swap request', async () => {
      const result = await service.createSwap('shift-1', 'worker-1', {
        targetShiftId: 'shift-2',
        targetWorkerId: 'worker-2',
        message: 'Need to swap',
      });

      expect(result.id).toBe('swap-1');
      expect(mockPrisma.shiftSwap.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when source shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.createSwap('nonexistent', 'worker-1', {
          targetWorkerId: 'worker-2',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when source worker is not assigned to source shift', async () => {
      const wrongAssignmentShift = { ...mockShift1, assignedToId: 'worker-3' };
      mockPrisma.shift.findUnique.mockResolvedValue(wrongAssignmentShift);

      await expect(
        service.createSwap('shift-1', 'worker-1', {
          targetWorkerId: 'worker-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when target worker not qualified for source position', async () => {
      // Worker-2 doesn't have HOST in their positions
      const hostShift = { ...mockShift1, position: Position.HOST };
      mockPrisma.shift.findUnique.mockImplementation((args: any) => {
        if (args.where.id === 'shift-1') return Promise.resolve(hostShift);
        if (args.where.id === 'shift-2') return Promise.resolve(mockShift2);
        return Promise.resolve(null);
      });

      await expect(
        service.createSwap('shift-1', 'worker-1', {
          targetWorkerId: 'worker-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when target worker has scheduling conflict', async () => {
      mockMatcher.isWorkerAvailable.mockResolvedValue(false);

      await expect(
        service.createSwap('shift-1', 'worker-1', {
          targetWorkerId: 'worker-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set expiresAt based on expiresInHours option', async () => {
      await service.createSwap('shift-1', 'worker-1', {
        targetWorkerId: 'worker-2',
        expiresInHours: 24,
      });

      expect(mockPrisma.shiftSwap.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('dropToPool', () => {
    beforeEach(() => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift1);
    });

    it('should release shift to pool', async () => {
      await service.dropToPool('shift-1', 'worker-1', 'Personal conflict');

      expect(mockStateMachine.releaseToPool).toHaveBeenCalledWith(
        'shift-1',
        'worker-1',
        'Personal conflict',
      );
      expect(mockRedis.invalidateShiftCache).toHaveBeenCalledWith('restaurant-1');
    });

    it('should throw NotFoundException when shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.dropToPool('nonexistent', 'worker-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when worker is not assigned to shift', async () => {
      const shift = { ...mockShift1, assignedToId: 'worker-3' };
      mockPrisma.shift.findUnique.mockResolvedValue(shift);

      await expect(
        service.dropToPool('shift-1', 'worker-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('respondToSwap', () => {
    beforeEach(() => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(mockSwapRequest);
      mockPrisma.shiftSwap.update.mockResolvedValue({ ...mockSwapRequest, status: 'ACCEPTED' });
      mockPrisma.shift.update.mockResolvedValue(mockShift1);
    });

    it('should reject swap when accepted is false', async () => {
      mockPrisma.shiftSwap.update.mockResolvedValue({ ...mockSwapRequest, status: 'REJECTED' });

      await service.respondToSwap('swap-1', 'worker-2', false, 'Cannot work');

      expect(mockPrisma.shiftSwap.update).toHaveBeenCalledWith({
        where: { id: 'swap-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should throw NotFoundException when swap not found', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(null);

      await expect(
        service.respondToSwap('nonexistent', 'worker-2', true),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when wrong worker responds', async () => {
      await expect(
        service.respondToSwap('swap-1', 'worker-1', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when swap already resolved', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue({
        ...mockSwapRequest,
        status: 'ACCEPTED',
      });

      await expect(
        service.respondToSwap('swap-1', 'worker-2', true),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveSwap', () => {
    beforeEach(() => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue({
        ...mockSwapRequest,
        status: 'ACCEPTED',
        sourceShift: mockShift1,
        targetShift: mockShift2,
      });
      mockPrisma.shiftSwap.update.mockResolvedValue({
        ...mockSwapRequest,
        status: 'ACCEPTED',
        managerApproved: true,
      });
      mockPrisma.shift.update.mockResolvedValue(mockShift1);
    });

    it('should approve swap and update shifts', async () => {
      await service.approveSwap('swap-1', 'manager-1');

      expect(mockPrisma.shiftSwap.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'swap-1' },
          data: expect.objectContaining({
            managerApproved: true,
            approvedById: 'manager-1',
          }),
        }),
      );
    });

    it('should throw NotFoundException when swap not found', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(null);

      await expect(
        service.approveSwap('nonexistent', 'manager-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when swap in wrong status', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue({
        ...mockSwapRequest,
        status: 'REJECTED',
      });

      await expect(
        service.approveSwap('swap-1', 'manager-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectSwap (manager)', () => {
    beforeEach(() => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue({
        ...mockSwapRequest,
        status: 'ACCEPTED',
      });
      mockPrisma.shiftSwap.update.mockResolvedValue({
        ...mockSwapRequest,
        status: 'REJECTED',
        managerApproved: false,
      });
    });

    it('should reject swap with reason', async () => {
      await service.rejectSwap('swap-1', 'manager-1', 'Insufficient coverage');

      expect(mockPrisma.shiftSwap.update).toHaveBeenCalledWith({
        where: { id: 'swap-1' },
        data: expect.objectContaining({
          status: 'REJECTED',
          managerApproved: false,
          approvedById: 'manager-1',
        }),
      });
    });

    it('should throw NotFoundException when swap not found', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectSwap('nonexistent', 'manager-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelSwap', () => {
    beforeEach(() => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(mockSwapRequest);
      mockPrisma.shiftSwap.update.mockResolvedValue({
        ...mockSwapRequest,
        status: 'CANCELLED',
      });
    });

    it('should allow source worker to cancel swap', async () => {
      await service.cancelSwap('swap-1', 'worker-1');

      expect(mockPrisma.shiftSwap.update).toHaveBeenCalledWith({
        where: { id: 'swap-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should throw NotFoundException when swap not found', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelSwap('nonexistent', 'worker-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when wrong worker cancels', async () => {
      await expect(
        service.cancelSwap('swap-1', 'worker-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when swap already resolved', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue({
        ...mockSwapRequest,
        status: 'ACCEPTED',
      });

      await expect(
        service.cancelSwap('swap-1', 'worker-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSwap', () => {
    it('should return swap with full details', async () => {
      mockPrisma.shiftSwap.findUnique.mockResolvedValue(mockSwapRequest);

      const result = await service.getSwap('swap-1');

      expect(result).toEqual(mockSwapRequest);
      expect(mockPrisma.shiftSwap.findUnique).toHaveBeenCalledWith({
        where: { id: 'swap-1' },
        include: expect.any(Object),
      });
    });
  });

  describe('getSwapsForWorker', () => {
    it('should return swaps where worker is source or target', async () => {
      mockPrisma.shiftSwap.findMany.mockResolvedValue([mockSwapRequest]);

      const result = await service.getSwapsForWorker('worker-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.shiftSwap.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: [
            { sourceWorkerId: 'worker-1' },
            { targetWorkerId: 'worker-1' },
          ],
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by status when provided', async () => {
      mockPrisma.shiftSwap.findMany.mockResolvedValue([]);

      await service.getSwapsForWorker('worker-1', 'PENDING');

      expect(mockPrisma.shiftSwap.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'PENDING',
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getPendingSwapsForRestaurant', () => {
    it('should return swaps requiring approval for restaurant', async () => {
      mockPrisma.shiftSwap.findMany.mockResolvedValue([
        { ...mockSwapRequest, status: 'PENDING' },
      ]);

      const result = await service.getPendingSwapsForRestaurant('restaurant-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.shiftSwap.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'ACCEPTED'] },
          requiresApproval: true,
          sourceShift: { restaurantId: 'restaurant-1' },
        }),
        include: expect.any(Object),
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
