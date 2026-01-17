import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ShiftStateMachine } from '../shift-state-machine.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ShiftStatus, SHIFT_TRANSITIONS } from '@restaurant-scheduler/shared';

describe('ShiftStateMachine', () => {
  let service: ShiftStateMachine;
  let prismaService: jest.Mocked<PrismaService>;

  // Test data
  const mockShift = {
    id: 'shift-123',
    restaurantId: 'restaurant-1',
    position: 'SERVER',
    status: ShiftStatus.DRAFT,
    startTime: new Date(Date.now() + 86400000), // Tomorrow
    endTime: new Date(Date.now() + 86400000 + 28800000), // Tomorrow + 8 hours
    assignedToId: null,
    breakMinutes: 30,
  };

  const mockPrisma = {
    shift: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    shiftStatusHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftStateMachine,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ShiftStateMachine>(ShiftStateMachine);
    prismaService = module.get(PrismaService);
  });

  describe('canTransition', () => {
    it('should return true for valid transitions from DRAFT', () => {
      expect(service.canTransition(ShiftStatus.DRAFT, ShiftStatus.PUBLISHED_UNASSIGNED)).toBe(true);
      expect(service.canTransition(ShiftStatus.DRAFT, ShiftStatus.CANCELLED)).toBe(true);
    });

    it('should return false for invalid transitions from DRAFT', () => {
      expect(service.canTransition(ShiftStatus.DRAFT, ShiftStatus.CONFIRMED)).toBe(false);
      expect(service.canTransition(ShiftStatus.DRAFT, ShiftStatus.COMPLETED)).toBe(false);
      expect(service.canTransition(ShiftStatus.DRAFT, ShiftStatus.IN_PROGRESS)).toBe(false);
    });

    it('should return true for valid transitions from PUBLISHED_UNASSIGNED', () => {
      expect(service.canTransition(ShiftStatus.PUBLISHED_UNASSIGNED, ShiftStatus.PUBLISHED_OFFERED)).toBe(true);
      expect(service.canTransition(ShiftStatus.PUBLISHED_UNASSIGNED, ShiftStatus.PUBLISHED_CLAIMED)).toBe(true);
      expect(service.canTransition(ShiftStatus.PUBLISHED_UNASSIGNED, ShiftStatus.CANCELLED)).toBe(true);
    });

    it('should return true for valid transitions from PUBLISHED_CLAIMED', () => {
      expect(service.canTransition(ShiftStatus.PUBLISHED_CLAIMED, ShiftStatus.CONFIRMED)).toBe(true);
      expect(service.canTransition(ShiftStatus.PUBLISHED_CLAIMED, ShiftStatus.PUBLISHED_UNASSIGNED)).toBe(true);
      expect(service.canTransition(ShiftStatus.PUBLISHED_CLAIMED, ShiftStatus.CANCELLED)).toBe(true);
    });

    it('should return true for valid transitions from CONFIRMED', () => {
      expect(service.canTransition(ShiftStatus.CONFIRMED, ShiftStatus.IN_PROGRESS)).toBe(true);
      expect(service.canTransition(ShiftStatus.CONFIRMED, ShiftStatus.PUBLISHED_UNASSIGNED)).toBe(true);
      expect(service.canTransition(ShiftStatus.CONFIRMED, ShiftStatus.CANCELLED)).toBe(true);
      expect(service.canTransition(ShiftStatus.CONFIRMED, ShiftStatus.NO_SHOW)).toBe(true);
    });

    it('should return true for valid transitions from IN_PROGRESS', () => {
      expect(service.canTransition(ShiftStatus.IN_PROGRESS, ShiftStatus.COMPLETED)).toBe(true);
      expect(service.canTransition(ShiftStatus.IN_PROGRESS, ShiftStatus.NO_SHOW)).toBe(true);
    });

    it('should return false for transitions from terminal states', () => {
      expect(service.canTransition(ShiftStatus.COMPLETED, ShiftStatus.DRAFT)).toBe(false);
      expect(service.canTransition(ShiftStatus.COMPLETED, ShiftStatus.CANCELLED)).toBe(false);
      expect(service.canTransition(ShiftStatus.CANCELLED, ShiftStatus.DRAFT)).toBe(false);
      expect(service.canTransition(ShiftStatus.NO_SHOW, ShiftStatus.COMPLETED)).toBe(false);
    });

    it('should validate all transitions match SHIFT_TRANSITIONS constant', () => {
      // Verify our service matches the shared type definitions
      for (const fromStatus of Object.values(ShiftStatus)) {
        const allowedTransitions = SHIFT_TRANSITIONS[fromStatus] || [];
        for (const toStatus of Object.values(ShiftStatus)) {
          const expected = allowedTransitions.includes(toStatus);
          expect(service.canTransition(fromStatus, toStatus)).toBe(expected);
        }
      }
    });
  });

  describe('transition', () => {
    it('should successfully transition from DRAFT to PUBLISHED_UNASSIGNED', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.transition(
        mockShift.id,
        ShiftStatus.PUBLISHED_UNASSIGNED,
        'user-123',
        'Publishing shift',
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]);
    });

    it('should throw error for shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.transition('nonexistent', ShiftStatus.PUBLISHED_UNASSIGNED, 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.transition('nonexistent', ShiftStatus.PUBLISHED_UNASSIGNED, 'user-123'),
      ).rejects.toThrow('Shift not found');
    });

    it('should throw error for invalid transition', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      await expect(
        service.transition(mockShift.id, ShiftStatus.COMPLETED, 'user-123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.transition(mockShift.id, ShiftStatus.COMPLETED, 'user-123'),
      ).rejects.toThrow('Invalid transition');
    });

    it('should throw error when publishing a shift in the past', async () => {
      const pastShift = {
        ...mockShift,
        status: ShiftStatus.DRAFT,
        startTime: new Date(Date.now() - 86400000), // Yesterday
      };
      mockPrisma.shift.findUnique.mockResolvedValue(pastShift);

      await expect(
        service.transition(pastShift.id, ShiftStatus.PUBLISHED_UNASSIGNED, 'user-123'),
      ).rejects.toThrow('Cannot publish a shift that starts in the past');
    });

    it('should throw error when confirming shift without assigned worker', async () => {
      const claimedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_CLAIMED,
        assignedToId: null,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(claimedShift);

      await expect(
        service.transition(claimedShift.id, ShiftStatus.CONFIRMED, 'user-123'),
      ).rejects.toThrow('Cannot confirm shift without an assigned worker');
    });

    it('should throw error when starting shift without assigned worker', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: null,
        startTime: new Date(Date.now() + 3600000), // 1 hour from now
        endTime: new Date(Date.now() + 36000000),
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(
        service.transition(confirmedShift.id, ShiftStatus.IN_PROGRESS, 'user-123'),
      ).rejects.toThrow('Cannot start shift without an assigned worker');
    });

    it('should throw error when starting shift too early', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-123',
        startTime: new Date(Date.now() + 10800000), // 3 hours from now
        endTime: new Date(Date.now() + 39600000),
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(
        service.transition(confirmedShift.id, ShiftStatus.IN_PROGRESS, 'user-123'),
      ).rejects.toThrow('Cannot start shift more than 2 hours before scheduled time');
    });

    it('should throw error when starting shift after it ended', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-123',
        startTime: new Date(Date.now() - 36000000), // 10 hours ago
        endTime: new Date(Date.now() - 7200000), // 2 hours ago
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(
        service.transition(confirmedShift.id, ShiftStatus.IN_PROGRESS, 'user-123'),
      ).rejects.toThrow('Cannot start a shift that has already ended');
    });

    it('should throw error when completing shift not in progress', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-123',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(
        service.transition(confirmedShift.id, ShiftStatus.COMPLETED, 'user-123'),
      ).rejects.toThrow('Invalid transition');
    });

    it('should throw error when marking no-show without assigned worker', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: null,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);

      await expect(
        service.transition(confirmedShift.id, ShiftStatus.NO_SHOW, 'user-123'),
      ).rejects.toThrow('Cannot mark no-show without an assigned worker');
    });

    it('should log transition with reason', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.transition(
        mockShift.id,
        ShiftStatus.PUBLISHED_UNASSIGNED,
        'user-123',
        'Test reason',
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test reason'),
      );
    });
  });

  describe('publish', () => {
    it('should publish a draft shift', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.publish(mockShift.id, 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('should assign a worker to a shift', async () => {
      const publishedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(publishedShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.assign(publishedShift.id, 'worker-123', 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]);
    });

    it('should throw error when shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.assign('nonexistent', 'worker-123', 'user-123'),
      ).rejects.toThrow('Shift not found');
    });
  });

  describe('confirm', () => {
    it('should confirm a claimed shift with assigned worker', async () => {
      const claimedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_CLAIMED,
        assignedToId: 'worker-123',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(claimedShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.confirm(claimedShift.id, 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('releaseToPool', () => {
    it('should release a shift back to the pool', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-123',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.releaseToPool(confirmedShift.id, 'user-123', 'Worker called out');

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({}),
        expect.objectContaining({}),
      ]);
    });

    it('should throw error when shift not found', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.releaseToPool('nonexistent', 'user-123'),
      ).rejects.toThrow('Shift not found');
    });
  });

  describe('start', () => {
    it('should start a confirmed shift within time window', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-123',
        startTime: new Date(Date.now() + 3600000), // 1 hour from now (within 2-hour window)
        endTime: new Date(Date.now() + 32400000), // 9 hours from now
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.start(confirmedShift.id, 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('should complete an in-progress shift', async () => {
      const inProgressShift = {
        ...mockShift,
        status: ShiftStatus.IN_PROGRESS,
        assignedToId: 'worker-123',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(inProgressShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.complete(inProgressShift.id, 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('markNoShow', () => {
    it('should mark a confirmed shift as no-show', async () => {
      const confirmedShift = {
        ...mockShift,
        status: ShiftStatus.CONFIRMED,
        assignedToId: 'worker-123',
      };
      mockPrisma.shift.findUnique.mockResolvedValue(confirmedShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.markNoShow(confirmedShift.id, 'user-123');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should cancel a shift', async () => {
      const publishedShift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(publishedShift);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await service.cancel(publishedShift.id, 'user-123', 'Event cancelled');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('should return shift status history', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          shiftId: mockShift.id,
          fromStatus: ShiftStatus.DRAFT,
          toStatus: ShiftStatus.PUBLISHED_UNASSIGNED,
          changedBy: 'user-123',
          reason: 'Published',
          createdAt: new Date(),
        },
        {
          id: 'history-2',
          shiftId: mockShift.id,
          fromStatus: ShiftStatus.PUBLISHED_UNASSIGNED,
          toStatus: ShiftStatus.PUBLISHED_CLAIMED,
          changedBy: 'worker-456',
          reason: 'Claimed',
          createdAt: new Date(),
        },
      ];
      mockPrisma.shiftStatusHistory.findMany.mockResolvedValue(mockHistory);

      const result = await service.getHistory(mockShift.id);

      expect(result).toEqual(mockHistory);
      expect(mockPrisma.shiftStatusHistory.findMany).toHaveBeenCalledWith({
        where: { shiftId: mockShift.id },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('concurrent transition handling', () => {
    it('should handle race conditions with transaction', async () => {
      const shift = {
        ...mockShift,
        status: ShiftStatus.PUBLISHED_UNASSIGNED,
      };
      mockPrisma.shift.findUnique.mockResolvedValue(shift);

      // Simulate concurrent attempts by mocking transaction behavior
      let transactionCount = 0;
      mockPrisma.$transaction.mockImplementation(async (operations) => {
        transactionCount++;
        // First call succeeds, subsequent calls would see changed status
        if (transactionCount === 1) {
          return [{}, {}];
        }
        throw new Error('Concurrent modification detected');
      });

      // First transition should succeed
      await service.transition(shift.id, ShiftStatus.PUBLISHED_CLAIMED, 'user-1');

      // Second concurrent transition would fail (simulated)
      await expect(
        service.transition(shift.id, ShiftStatus.PUBLISHED_CLAIMED, 'user-2'),
      ).rejects.toThrow();

      expect(transactionCount).toBe(2);
    });
  });
});
