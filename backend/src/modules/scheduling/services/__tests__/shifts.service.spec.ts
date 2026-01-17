import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ShiftsService } from '../shifts.service';
import { ShiftStateMachine } from '../shift-state-machine.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ShiftStatus, ShiftType, Position } from '@restaurant-scheduler/shared';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let stateMachine: jest.Mocked<ShiftStateMachine>;

  // Test data
  const mockRestaurant = {
    id: 'restaurant-1',
    name: 'Test Restaurant',
    timezone: 'America/New_York',
    networkId: 'network-1',
  };

  const mockUser = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    avatarUrl: null,
  };

  const mockWorkerProfile = {
    id: 'worker-1',
    userId: 'user-1',
    restaurantId: 'restaurant-1',
    positions: [Position.SERVER, Position.HOST],
    status: 'ACTIVE',
    reliabilityScore: 4.5,
    shiftsCompleted: 50,
    noShowCount: 1,
    user: mockUser,
  };

  const mockShift = {
    id: 'shift-1',
    restaurantId: 'restaurant-1',
    position: Position.SERVER,
    status: ShiftStatus.DRAFT,
    type: ShiftType.DINE_IN,
    startTime: new Date(Date.now() + 86400000), // Tomorrow
    endTime: new Date(Date.now() + 86400000 + 28800000), // Tomorrow + 8 hours
    breakMinutes: 30,
    notes: null,
    autoApprove: false,
    minReputationScore: null,
    hourlyRateOverride: null,
    assignedToId: null,
    createdById: 'user-1',
    restaurant: mockRestaurant,
    assignedTo: null,
    createdBy: mockUser,
    claims: [],
  };

  const mockPrisma = {
    shift: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    shiftStatusHistory: {
      create: jest.fn(),
    },
    workerProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    restaurant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockRedis = {
    invalidateShiftCache: jest.fn(),
  };

  const mockStateMachine = {
    publish: jest.fn(),
    assign: jest.fn(),
    confirm: jest.fn(),
    releaseToPool: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
    markNoShow: jest.fn(),
    cancel: jest.fn(),
    getHistory: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RedisService,
          useValue: mockRedis,
        },
        {
          provide: ShiftStateMachine,
          useValue: mockStateMachine,
        },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    stateMachine = module.get(ShiftStateMachine);
  });

  describe('create', () => {
    it('should create a new shift as draft', async () => {
      const createData = {
        restaurantId: 'restaurant-1',
        position: Position.SERVER,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 28800000),
        breakMinutes: 30,
      };

      mockPrisma.shift.create.mockResolvedValue({
        ...mockShift,
        ...createData,
      });

      const result = await service.create('user-1', createData);

      expect(result.status).toBe(ShiftStatus.DRAFT);
      expect(mockPrisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ShiftStatus.DRAFT,
            position: Position.SERVER,
          }),
        }),
      );
      expect(mockPrisma.shiftStatusHistory.create).toHaveBeenCalled();
    });

    it('should throw error if start time is after end time', async () => {
      const createData = {
        restaurantId: 'restaurant-1',
        position: Position.SERVER,
        startTime: new Date(Date.now() + 86400000 + 28800000),
        endTime: new Date(Date.now() + 86400000),
      };

      await expect(service.create('user-1', createData)).rejects.toThrow(
        'Start time must be before end time',
      );
    });

    it('should throw error if start time is in the past', async () => {
      const createData = {
        restaurantId: 'restaurant-1',
        position: Position.SERVER,
        startTime: new Date(Date.now() - 86400000),
        endTime: new Date(Date.now() - 86400000 + 28800000),
      };

      await expect(service.create('user-1', createData)).rejects.toThrow(
        'Cannot create a shift in the past',
      );
    });

    it('should throw error for invalid position', async () => {
      const createData = {
        restaurantId: 'restaurant-1',
        position: 'INVALID_POSITION',
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 28800000),
      };

      await expect(service.create('user-1', createData)).rejects.toThrow(
        'Invalid position',
      );
    });

    it('should set default values for optional fields', async () => {
      const createData = {
        restaurantId: 'restaurant-1',
        position: Position.SERVER,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 86400000 + 28800000),
      };

      mockPrisma.shift.create.mockResolvedValue({
        ...mockShift,
        breakMinutes: 0,
        autoApprove: false,
        type: ShiftType.DINE_IN,
      });

      await service.create('user-1', createData);

      expect(mockPrisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            breakMinutes: 0,
            autoApprove: false,
            type: ShiftType.DINE_IN,
          }),
        }),
      );
    });
  });

  describe('createBulk', () => {
    it('should create multiple shifts', async () => {
      const shifts = [
        {
          restaurantId: 'restaurant-1',
          position: Position.SERVER,
          startTime: new Date(Date.now() + 86400000),
          endTime: new Date(Date.now() + 86400000 + 28800000),
        },
        {
          restaurantId: 'restaurant-1',
          position: Position.HOST,
          startTime: new Date(Date.now() + 86400000),
          endTime: new Date(Date.now() + 86400000 + 28800000),
        },
      ];

      mockPrisma.shift.create.mockResolvedValue(mockShift);

      const result = await service.createBulk('user-1', 'restaurant-1', shifts);

      expect(result.length).toBe(2);
      expect(mockPrisma.shift.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('findById', () => {
    it('should return a shift with relations', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      const result = await service.findById('shift-1');

      expect(result).toEqual(mockShift);
      expect(mockPrisma.shift.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shift-1' },
          include: expect.any(Object),
        }),
      );
    });

    it('should throw NotFoundException if shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findMany', () => {
    it('should return paginated shifts', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockPrisma.shift.count.mockResolvedValue(1);

      const result = await service.findMany({
        restaurantId: 'restaurant-1',
        page: 1,
        pageSize: 50,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([]);
      mockPrisma.shift.count.mockResolvedValue(0);

      await service.findMany({
        status: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED_UNASSIGNED],
      });

      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED_UNASSIGNED] },
          }),
        }),
      );
    });

    it('should filter by position', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([]);
      mockPrisma.shift.count.mockResolvedValue(0);

      await service.findMany({
        position: [Position.SERVER, Position.HOST],
      });

      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            position: { in: [Position.SERVER, Position.HOST] },
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockPrisma.shift.findMany.mockResolvedValue([]);
      mockPrisma.shift.count.mockResolvedValue(0);

      await service.findMany({ startDate, endDate });

      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: { gte: startDate, lte: endDate },
          }),
        }),
      );
    });
  });

  describe('getWeekSchedule', () => {
    it('should return shifts grouped by day', async () => {
      const weekStart = new Date('2024-01-01');
      const shift1 = { ...mockShift, startTime: new Date('2024-01-01T09:00:00Z') };
      const shift2 = { ...mockShift, startTime: new Date('2024-01-02T09:00:00Z') };

      mockPrisma.shift.findMany.mockResolvedValue([shift1, shift2]);

      const result = await service.getWeekSchedule('restaurant-1', weekStart);

      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should include network restaurants when includeNetwork is true', async () => {
      const weekStart = new Date('2024-01-01');

      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        networkId: 'network-1',
      });
      mockPrisma.restaurant.findMany.mockResolvedValue([
        { id: 'restaurant-1' },
        { id: 'restaurant-2' },
      ]);
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);

      await service.getWeekSchedule('restaurant-1', weekStart, true);

      expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { networkId: 'network-1' },
        }),
      );
    });
  });

  describe('update', () => {
    it('should update a draft shift', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.shift.update.mockResolvedValue({
        ...mockShift,
        notes: 'Updated notes',
      });

      const result = await service.update('shift-1', { notes: 'Updated notes' });

      expect(result.notes).toBe('Updated notes');
    });

    it('should update an unassigned shift', async () => {
      const unassignedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(unassignedShift);
      mockPrisma.shift.update.mockResolvedValue(unassignedShift);

      await service.update('shift-1', { breakMinutes: 45 });

      expect(mockPrisma.shift.update).toHaveBeenCalled();
    });

    it('should throw error when updating confirmed shift', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(
        service.update('shift-1', { notes: 'Updated' }),
      ).rejects.toThrow('Can only update draft or unassigned shifts');
    });

    it('should validate times on update', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      await expect(
        service.update('shift-1', {
          startTime: new Date(Date.now() + 86400000 + 28800000),
          endTime: new Date(Date.now() + 86400000),
        }),
      ).rejects.toThrow('Start time must be before end time');
    });
  });

  describe('publishMany', () => {
    it('should publish multiple shifts', async () => {
      mockStateMachine.publish.mockResolvedValue(undefined);
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      const result = await service.publishMany(['shift-1', 'shift-2'], 'user-1');

      expect(result.published).toContain('shift-1');
      expect(result.published).toContain('shift-2');
      expect(mockRedis.invalidateShiftCache).toHaveBeenCalled();
    });

    it('should handle partial failures', async () => {
      mockStateMachine.publish
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Shift in past'));
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      const result = await service.publishMany(['shift-1', 'shift-2'], 'user-1');

      expect(result.published).toContain('shift-1');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('shift-2');
    });
  });

  describe('assignWorker', () => {
    it('should assign a qualified worker to a shift', async () => {
      const publishedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(publishedShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      mockPrisma.shift.findFirst.mockResolvedValue(null); // No conflicts
      mockStateMachine.assign.mockResolvedValue(undefined);

      await service.assignWorker('shift-1', 'worker-1', 'user-1');

      expect(mockStateMachine.assign).toHaveBeenCalledWith(
        'shift-1',
        'worker-1',
        'user-1',
      );
      expect(mockRedis.invalidateShiftCache).toHaveBeenCalled();
    });

    it('should throw error if worker not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.assignWorker('shift-1', 'nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if worker not qualified for position', async () => {
      const barShift = { ...mockShift, position: Position.BARTENDER };
      mockPrisma.shift.findUnique.mockResolvedValue(barShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        positions: [Position.SERVER], // Not BARTENDER
      });

      await expect(
        service.assignWorker('shift-1', 'worker-1', 'user-1'),
      ).rejects.toThrow('Worker is not qualified for position');
    });

    it('should throw error if worker is not active', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        status: 'INACTIVE',
      });

      await expect(
        service.assignWorker('shift-1', 'worker-1', 'user-1'),
      ).rejects.toThrow('Worker profile is not active');
    });

    it('should throw error if worker has conflicting shift', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      mockPrisma.shift.findFirst.mockResolvedValue({ id: 'conflict-shift' }); // Has conflict

      await expect(
        service.assignWorker('shift-1', 'worker-1', 'user-1'),
      ).rejects.toThrow('Worker has a conflicting shift');
    });
  });

  describe('confirm', () => {
    it('should confirm a claimed shift', async () => {
      const claimedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_CLAIMED,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(claimedShift);
      mockStateMachine.confirm.mockResolvedValue(undefined);

      await service.confirm('shift-1', 'user-1');

      expect(mockStateMachine.confirm).toHaveBeenCalledWith('shift-1', 'user-1');
    });
  });

  describe('releaseToPool', () => {
    it('should release a shift back to the pool', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);
      mockStateMachine.releaseToPool.mockResolvedValue(undefined);

      await service.releaseToPool('shift-1', 'user-1', 'Worker called out');

      expect(mockStateMachine.releaseToPool).toHaveBeenCalledWith(
        'shift-1',
        'user-1',
        'Worker called out',
      );
      expect(mockRedis.invalidateShiftCache).toHaveBeenCalled();
    });
  });

  describe('clockIn', () => {
    it('should allow assigned worker to clock in', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);
      mockStateMachine.start.mockResolvedValue(undefined);

      await service.clockIn('shift-1', 'worker-1');

      expect(mockStateMachine.start).toHaveBeenCalledWith('shift-1', 'worker-1');
    });

    it('should throw ForbiddenException for non-assigned worker', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(service.clockIn('shift-1', 'worker-2')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('clockOut', () => {
    it('should allow assigned worker to clock out', async () => {
      const inProgressShift = {
        ...mockShift,
        status: ShiftStatus.IN_PROGRESS,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(inProgressShift);
      mockStateMachine.complete.mockResolvedValue(undefined);
      mockPrisma.workerProfile.update.mockResolvedValue(mockWorkerProfile);

      await service.clockOut('shift-1', 'worker-1');

      expect(mockStateMachine.complete).toHaveBeenCalledWith(
        'shift-1',
        'worker-1',
      );
      expect(mockPrisma.workerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'worker-1' },
          data: expect.objectContaining({
            shiftsCompleted: { increment: 1 },
          }),
        }),
      );
    });

    it('should throw ForbiddenException for non-assigned worker', async () => {
      const inProgressShift = {
        ...mockShift,
        status: ShiftStatus.IN_PROGRESS,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(inProgressShift);

      await expect(service.clockOut('shift-1', 'worker-2')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('markNoShow', () => {
    it('should mark shift as no-show and update worker stats', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-1',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);
      mockStateMachine.markNoShow.mockResolvedValue(undefined);
      mockPrisma.workerProfile.update.mockResolvedValue(mockWorkerProfile);

      await service.markNoShow('shift-1', 'user-1');

      expect(mockStateMachine.markNoShow).toHaveBeenCalledWith(
        'shift-1',
        'user-1',
      );
      expect(mockPrisma.workerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'worker-1' },
          data: expect.objectContaining({
            noShowCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a shift', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockStateMachine.cancel.mockResolvedValue(undefined);

      await service.cancel('shift-1', 'user-1', 'Event cancelled');

      expect(mockStateMachine.cancel).toHaveBeenCalledWith(
        'shift-1',
        'user-1',
        'Event cancelled',
      );
      expect(mockRedis.invalidateShiftCache).toHaveBeenCalled();
    });
  });

  describe('getCoverageGaps', () => {
    it('should return open shifts grouped by position', async () => {
      const openShifts = [
        { ...mockShift, position: Position.SERVER, status: ShiftStatus.PUBLISHED_UNASSIGNED },
        { ...mockShift, position: Position.SERVER, status: ShiftStatus.PUBLISHED_UNASSIGNED },
        { ...mockShift, position: Position.HOST, status: ShiftStatus.PUBLISHED_OFFERED },
      ];
      mockPrisma.shift.findMany.mockResolvedValue(openShifts);

      const startDate = new Date();
      const endDate = new Date(Date.now() + 604800000); // 1 week

      const result = await service.getCoverageGaps('restaurant-1', startDate, endDate);

      expect(result.totalGaps).toBe(3);
      expect(result.byPosition[Position.SERVER]).toBe(2);
      expect(result.byPosition[Position.HOST]).toBe(1);
    });

    it('should identify urgent gaps within 24 hours', async () => {
      const urgentShift = {
        ...mockShift,
        startTime: new Date(Date.now() + 3600000), // 1 hour from now
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      const normalShift = {
        ...mockShift,
        startTime: new Date(Date.now() + 172800000), // 2 days from now
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      mockPrisma.shift.findMany.mockResolvedValue([urgentShift, normalShift]);

      const result = await service.getCoverageGaps(
        'restaurant-1',
        new Date(),
        new Date(Date.now() + 604800000),
      );

      expect(result.urgentGaps).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('should return shift history', async () => {
      const mockHistory = [
        { id: 'h1', fromStatus: 'NONE', toStatus: ShiftStatus.DRAFT },
        { id: 'h2', fromStatus: ShiftStatus.DRAFT, toStatus: ShiftStatus.PUBLISHED_UNASSIGNED },
      ];
      mockStateMachine.getHistory.mockResolvedValue(mockHistory);

      const result = await service.getHistory('shift-1');

      expect(result).toEqual(mockHistory);
      expect(mockStateMachine.getHistory).toHaveBeenCalledWith('shift-1');
    });
  });

  describe('RLS and authorization patterns', () => {
    it('should only return shifts for the specified restaurant', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([]);
      mockPrisma.shift.count.mockResolvedValue(0);

      await service.findMany({ restaurantId: 'restaurant-1' });

      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restaurantId: 'restaurant-1',
          }),
        }),
      );
    });

    it('should filter shifts by worker when workerId is specified', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([]);
      mockPrisma.shift.count.mockResolvedValue(0);

      await service.findMany({ workerId: 'worker-1' });

      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToId: 'worker-1',
          }),
        }),
      );
    });
  });
});
