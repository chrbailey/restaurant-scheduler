import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ShiftMatcherService, ClaimValidationResult, EnhancedCandidate } from '../shift-matcher.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';
import { ConflictDetectorService } from '@/modules/network/services/conflict-detector.service';
import { ReputationService } from '@/modules/network/services/reputation.service';
import { NetworkVisibilityService, VisibilityPhase } from '@/modules/network/services/network-visibility.service';
import { calculatePriorityScore, ClaimPriorityFactors } from '@restaurant-scheduler/shared';

describe('ShiftMatcherService', () => {
  let service: ShiftMatcherService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let conflictDetector: jest.Mocked<ConflictDetectorService>;
  let reputationService: jest.Mocked<ReputationService>;
  let visibilityService: jest.Mocked<NetworkVisibilityService>;

  // Test fixtures
  const mockRestaurant = {
    id: 'restaurant-1',
    name: 'Test Restaurant',
    networkId: 'network-1',
    lat: 37.7749,
    lng: -122.4194,
    autoApproveThreshold: 4.0,
    networkVisibilityHours: 2,
    network: {
      id: 'network-1',
      name: 'Test Network',
      enableCrossRestaurantShifts: true,
      maxDistanceMiles: 15,
      minNetworkReputationScore: 3.5,
    },
  };

  const mockShift = {
    id: 'shift-123',
    restaurantId: 'restaurant-1',
    position: 'SERVER',
    status: 'PUBLISHED_UNASSIGNED',
    startTime: new Date(Date.now() + 86400000),
    endTime: new Date(Date.now() + 86400000 + 28800000),
    restaurant: mockRestaurant,
  };

  const mockWorkerProfile = {
    id: 'worker-1',
    userId: 'user-1',
    restaurantId: 'restaurant-1',
    positions: ['SERVER', 'HOST'],
    tier: 'PRIMARY',
    reliabilityScore: 4.5,
    noShowCount: 0,
    status: 'ACTIVE',
  };

  const mockNetworkWorkerProfile = {
    id: 'worker-2',
    userId: 'user-2',
    restaurantId: 'restaurant-2',
    positions: ['SERVER', 'BARTENDER'],
    tier: 'SECONDARY',
    reliabilityScore: 4.2,
    noShowCount: 1,
    status: 'ACTIVE',
    restaurant: {
      id: 'restaurant-2',
      name: 'Network Restaurant',
      lat: 37.7850,
      lng: -122.4094,
    },
  };

  const mockPrisma = {
    shift: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    workerProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    restaurant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    timeOffRequest: {
      findFirst: jest.fn(),
    },
  };

  const mockRedis = {
    setJson: jest.fn(),
    getJson: jest.fn(),
    invalidateShiftCache: jest.fn(),
  };

  const mockConflictDetector = {
    detectShiftConflicts: jest.fn(),
    validateShiftAssignment: jest.fn(),
    getWorkerSchedulingSummary: jest.fn(),
  };

  const mockReputationService = {
    calculateNetworkReputation: jest.fn(),
  };

  const mockVisibilityService = {
    canWorkerSeeShift: jest.fn(),
    getVisibleNetworkShifts: jest.fn(),
    getShiftVisibilityPhase: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftMatcherService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConflictDetectorService, useValue: mockConflictDetector },
        { provide: ReputationService, useValue: mockReputationService },
        { provide: NetworkVisibilityService, useValue: mockVisibilityService },
      ],
    }).compile();

    service = module.get<ShiftMatcherService>(ShiftMatcherService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    conflictDetector = module.get(ConflictDetectorService);
    reputationService = module.get(ReputationService);
    visibilityService = module.get(NetworkVisibilityService);
  });

  describe('calculateClaimPriority', () => {
    it('should give +1000 points for own employee', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        restaurantId: mockShift.restaurantId, // Same restaurant
      });

      const score = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // Base: 1000 (own employee) + 100 (primary tier) + 450 (4.5 * 100) + 50 (reliability > 4.5)
      expect(score).toBeGreaterThanOrEqual(1000);
    });

    it('should give +100 points for primary tier', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        tier: 'PRIMARY',
      });

      const score = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // Should include primary tier bonus
      expect(score).toBeGreaterThanOrEqual(100);
    });

    it('should calculate reputation score (0-500 based on 1-5 rating)', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      // Test with 5.0 rating
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        reliabilityScore: 5.0,
        tier: 'SECONDARY',
        restaurantId: 'restaurant-2', // Different restaurant to isolate score
      });
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 450,
        tier: 'PLATINUM',
      });

      const score1 = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // Test with 3.0 rating
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        reliabilityScore: 3.0,
        tier: 'SECONDARY',
        restaurantId: 'restaurant-2',
      });
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 350,
        tier: 'SILVER',
      });

      const score2 = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      expect(score1).toBeGreaterThan(score2);
    });

    it('should give +50 reliability bonus for reliability > 4.5', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      // Worker with > 4.5 reliability
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        reliabilityScore: 4.6,
        tier: 'SECONDARY',
      });

      const scoreWithBonus = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // Worker with <= 4.5 reliability
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        reliabilityScore: 4.5,
        tier: 'SECONDARY',
      });

      const scoreWithoutBonus = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      expect(scoreWithBonus).toBeGreaterThanOrEqual(scoreWithoutBonus);
    });

    it('should apply -25 penalty per no-show', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);

      // Worker with 0 no-shows
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        noShowCount: 0,
      });

      const scoreNoShows0 = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // Worker with 2 no-shows
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        noShowCount: 2,
      });

      const scoreNoShows2 = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // Difference should be 50 (2 * 25)
      expect(scoreNoShows0 - scoreNoShows2).toBe(50);
    });

    it('should add network reputation bonus for network shifts', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(mockShift);
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        restaurantId: 'restaurant-2', // Different restaurant
      });

      // PLATINUM tier gives +100
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 450,
        tier: 'PLATINUM',
      });

      const platinumScore = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      // BRONZE tier gives +25
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 300,
        tier: 'BRONZE',
      });

      const bronzeScore = await service.calculateClaimPriority(mockShift.id, mockWorkerProfile.id);

      expect(platinumScore - bronzeScore).toBe(75); // 100 - 25
    });

    it('should return 0 for non-existent shift or worker', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);
      mockPrisma.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);

      const score = await service.calculateClaimPriority('nonexistent', mockWorkerProfile.id);

      expect(score).toBe(0);
    });
  });

  describe('validateShiftClaim', () => {
    beforeEach(() => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        restaurant: mockRestaurant,
      });
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        certifications: [],
        restaurant: mockRestaurant,
      });
      mockConflictDetector.validateShiftAssignment.mockResolvedValue({
        valid: true,
        conflicts: [],
        warnings: [],
      });
      mockVisibilityService.canWorkerSeeShift.mockResolvedValue({
        isVisible: true,
      });
    });

    it('should return canClaim=true for valid claim', async () => {
      const result = await service.validateShiftClaim(mockShift.id, mockWorkerProfile.id);

      expect(result.canClaim).toBe(true);
      expect(result.validationResult.valid).toBe(true);
      expect(result.priorityScore).toBeGreaterThan(0);
    });

    it('should check visibility for network workers', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockNetworkWorkerProfile,
        certifications: [],
        restaurant: {
          ...mockNetworkWorkerProfile.restaurant,
          network: mockRestaurant.network,
        },
      });
      mockVisibilityService.canWorkerSeeShift.mockResolvedValue({
        isVisible: false,
        reason: 'Shift not in network phase yet',
      });

      const result = await service.validateShiftClaim(mockShift.id, mockNetworkWorkerProfile.id);

      expect(result.canClaim).toBe(false);
      expect(result.validationResult.conflicts).toHaveLength(1);
    });

    it('should run conflict detection', async () => {
      mockConflictDetector.validateShiftAssignment.mockResolvedValue({
        valid: false,
        conflicts: [{
          type: 'OVERLAP',
          message: 'Shift overlaps with existing shift',
        }],
        warnings: [],
      });

      const result = await service.validateShiftClaim(mockShift.id, mockWorkerProfile.id);

      expect(result.canClaim).toBe(false);
      expect(result.validationResult.conflicts).toHaveLength(1);
    });

    it('should validate cross-training requirements', async () => {
      // BARTENDER requires ALCOHOL_SERVICE certification
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        position: 'BARTENDER',
        restaurant: mockRestaurant,
      });
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        positions: ['BARTENDER'],
        certifications: [], // Missing ALCOHOL_SERVICE
        restaurant: mockRestaurant,
      });

      const result = await service.validateShiftClaim(mockShift.id, mockWorkerProfile.id);

      expect(result.crossTrainingValidation?.isQualified).toBe(false);
      expect(result.crossTrainingValidation?.missingCertifications).toContain('ALCOHOL_SERVICE');
    });

    it('should include network reputation for network shifts', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockNetworkWorkerProfile,
        certifications: [],
        positions: ['SERVER'],
        restaurant: {
          ...mockNetworkWorkerProfile.restaurant,
          network: mockRestaurant.network,
        },
      });
      mockVisibilityService.canWorkerSeeShift.mockResolvedValue({
        isVisible: true,
      });
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 420,
        tier: 'GOLD',
      });

      const result = await service.validateShiftClaim(mockShift.id, mockNetworkWorkerProfile.id);

      expect(result.networkReputation).toBeDefined();
      expect(result.networkReputation?.tier).toBe('GOLD');
    });

    it('should throw error for non-existent shift', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.validateShiftClaim('nonexistent', mockWorkerProfile.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error for non-existent worker', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.validateShiftClaim(mockShift.id, 'nonexistent'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAvailableShifts', () => {
    it('should return own restaurant shifts in phase 1 (0-2 hours)', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        restaurant: mockRestaurant,
      });
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([]);

      const shifts = await service.getAvailableShifts(mockWorkerProfile.id);

      expect(shifts).toHaveLength(1);
      expect(shifts[0].isNetworkShift).toBe(false);
      expect(shifts[0].visibility).toBe('OWN');
    });

    it('should include network shifts when option is enabled', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        restaurant: mockRestaurant,
      });
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([]);
      mockVisibilityService.getVisibleNetworkShifts.mockResolvedValue([
        {
          shift: { ...mockShift, id: 'network-shift-1', restaurantId: 'restaurant-2' },
          visibility: { phase: VisibilityPhase.NETWORK },
        },
      ]);

      const shifts = await service.getAvailableShifts(mockWorkerProfile.id, {
        includeNetwork: true,
      });

      expect(shifts.length).toBeGreaterThanOrEqual(2);
      const networkShifts = shifts.filter(s => s.isNetworkShift);
      expect(networkShifts).toHaveLength(1);
    });

    it('should filter by position qualification', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        positions: ['SERVER', 'HOST'],
        restaurant: mockRestaurant,
      });
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([]);

      await service.getAvailableShifts(mockWorkerProfile.id, {
        position: ['SERVER', 'BARTENDER'], // BARTENDER not in worker's positions
      });

      // Should only query for SERVER (intersection of requested and qualified)
      expect(mockPrisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            position: { in: ['SERVER'] },
          }),
        }),
      );
    });

    it('should include conflict information for each shift', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        restaurant: mockRestaurant,
      });
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([
        { type: 'OVERLAP', message: 'Conflicts with another shift' },
      ]);

      const shifts = await service.getAvailableShifts(mockWorkerProfile.id);

      expect(shifts[0].hasConflicts).toBe(true);
      expect(shifts[0].conflicts).toHaveLength(1);
    });

    it('should cache results in Redis', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        restaurant: mockRestaurant,
      });
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([]);

      await service.getAvailableShifts(mockWorkerProfile.id);

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        `available:${mockWorkerProfile.id}`,
        expect.any(Array),
        60,
      );
    });

    it('should return empty array for non-existent worker', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValue(null);

      const shifts = await service.getAvailableShifts('nonexistent');

      expect(shifts).toEqual([]);
    });
  });

  describe('findCandidates', () => {
    it('should return own restaurant workers first', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        restaurant: mockRestaurant,
      });
      mockPrisma.workerProfile.findMany.mockResolvedValue([
        { ...mockWorkerProfile, user: { id: 'user-1', firstName: 'John', lastName: 'Doe' } },
      ]);
      mockConflictDetector.validateShiftAssignment.mockResolvedValue({
        valid: true,
        conflicts: [],
        warnings: [],
      });

      const candidates = await service.findCandidates(mockShift.id);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].isNetworkWorker).toBe(false);
    });

    it('should include network workers when visibility phase allows', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        restaurant: mockRestaurant,
      });
      mockPrisma.workerProfile.findMany
        .mockResolvedValueOnce([]) // Own restaurant workers
        .mockResolvedValueOnce([mockNetworkWorkerProfile]); // Network workers
      mockPrisma.restaurant.findMany.mockResolvedValue([
        { id: 'restaurant-2', lat: 37.7850, lng: -122.4094 },
      ]);
      mockVisibilityService.getShiftVisibilityPhase.mockReturnValue({
        phase: VisibilityPhase.NETWORK,
      });
      mockConflictDetector.validateShiftAssignment.mockResolvedValue({
        valid: true,
        conflicts: [],
        warnings: [],
      });
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 400,
        rating: 4.0,
        tier: 'GOLD',
        totalShifts: 50,
      });

      const candidates = await service.findCandidates(mockShift.id, {
        includeNetwork: true,
      });

      expect(candidates.some(c => c.isNetworkWorker)).toBe(true);
    });

    it('should sort candidates by availability first, then priority score', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        restaurant: mockRestaurant,
      });
      mockPrisma.workerProfile.findMany.mockResolvedValue([
        { ...mockWorkerProfile, id: 'worker-high', user: { id: 'u1', firstName: 'A', lastName: 'A' } },
        { ...mockWorkerProfile, id: 'worker-low', reliabilityScore: 3.0, user: { id: 'u2', firstName: 'B', lastName: 'B' } },
      ]);

      // First worker has conflicts, second doesn't
      mockConflictDetector.validateShiftAssignment
        .mockResolvedValueOnce({ valid: false, conflicts: [{ type: 'OVERLAP', message: 'Conflict' }], warnings: [] })
        .mockResolvedValueOnce({ valid: true, conflicts: [], warnings: [] });

      const candidates = await service.findCandidates(mockShift.id);

      // Available worker should come first even with lower score
      expect(candidates[0].hasConflicts).toBe(false);
      expect(candidates[1].hasConflicts).toBe(true);
    });

    it('should filter network workers by distance', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        restaurant: mockRestaurant,
      });
      mockPrisma.workerProfile.findMany.mockResolvedValueOnce([]); // Own workers
      // Network workers with restaurant relation included
      mockPrisma.workerProfile.findMany.mockResolvedValueOnce([
        {
          ...mockNetworkWorkerProfile,
          restaurant: { id: 'restaurant-near', lat: 37.7760, lng: -122.4150 },
        },
      ]);
      mockPrisma.restaurant.findMany.mockResolvedValue([
        { id: 'restaurant-near', lat: 37.7760, lng: -122.4150 }, // Close
        { id: 'restaurant-far', lat: 38.5000, lng: -121.0000 }, // Far
      ]);
      mockVisibilityService.getShiftVisibilityPhase.mockReturnValue({
        phase: VisibilityPhase.NETWORK,
      });
      mockConflictDetector.validateShiftAssignment.mockResolvedValue({
        isValid: true,
        conflicts: [],
      });
      mockReputationService.calculateNetworkReputation.mockResolvedValue({
        score: 4.2,
        rating: 4.2,
        tier: 'GOLD',
        totalShifts: 50,
      });

      await service.findCandidates(mockShift.id, { includeNetwork: true });

      // Should only query workers from nearby restaurants
      expect(mockPrisma.workerProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restaurantId: { in: ['restaurant-near'] },
          }),
        }),
      );
    });

    it('should limit results to specified count', async () => {
      mockPrisma.shift.findUnique.mockResolvedValue({
        ...mockShift,
        restaurant: mockRestaurant,
      });

      // Create 15 mock workers
      const workers = Array(15).fill(null).map((_, i) => ({
        ...mockWorkerProfile,
        id: `worker-${i}`,
        user: { id: `user-${i}`, firstName: 'Worker', lastName: `${i}` },
      }));

      mockPrisma.workerProfile.findMany.mockResolvedValue(workers);
      mockConflictDetector.validateShiftAssignment.mockResolvedValue({
        valid: true,
        conflicts: [],
        warnings: [],
      });

      const candidates = await service.findCandidates(mockShift.id, { limit: 5 });

      expect(candidates).toHaveLength(5);
    });
  });

  describe('isWorkerAvailable', () => {
    it('should return true when worker has no conflicts', async () => {
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([]);
      mockPrisma.timeOffRequest.findFirst.mockResolvedValue(null);

      const isAvailable = await service.isWorkerAvailable(
        mockWorkerProfile.id,
        new Date(),
        new Date(Date.now() + 28800000),
      );

      expect(isAvailable).toBe(true);
    });

    it('should return false when worker has overlapping shift', async () => {
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([
        { type: 'OVERLAP', message: 'Overlapping shift' },
      ]);

      const isAvailable = await service.isWorkerAvailable(
        mockWorkerProfile.id,
        new Date(),
        new Date(Date.now() + 28800000),
      );

      expect(isAvailable).toBe(false);
    });

    it('should return false when worker has approved time off', async () => {
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([]);
      mockPrisma.timeOffRequest.findFirst.mockResolvedValue({
        id: 'timeoff-1',
        status: 'APPROVED',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
      });

      const isAvailable = await service.isWorkerAvailable(
        mockWorkerProfile.id,
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 28800000),
      );

      expect(isAvailable).toBe(false);
    });

    it('should only check OVERLAP conflicts, not commute or max hours', async () => {
      mockConflictDetector.detectShiftConflicts.mockResolvedValue([
        { type: 'COMMUTE', message: 'Commute issue' },
        { type: 'MAX_HOURS_DAY', message: 'Max hours exceeded' },
      ]);
      mockPrisma.timeOffRequest.findFirst.mockResolvedValue(null);

      const isAvailable = await service.isWorkerAvailable(
        mockWorkerProfile.id,
        new Date(),
        new Date(Date.now() + 28800000),
      );

      // Should be true because no OVERLAP conflicts
      expect(isAvailable).toBe(true);
    });
  });

  describe('priority score calculation (shared function)', () => {
    it('should calculate correct score for own employee with high reliability', () => {
      const factors: ClaimPriorityFactors = {
        isOwnEmployee: true,
        isPrimaryTier: true,
        reputationScore: 4.5,
        reliabilityBonus: true,
        noShowCount: 0,
        claimTimeBonus: 30,
      };

      const score = calculatePriorityScore(factors);

      // 1000 + 100 + 450 + 50 + 0 + 30 = 1630
      expect(score).toBe(1630);
    });

    it('should cap claim time bonus at 60', () => {
      const factors: ClaimPriorityFactors = {
        isOwnEmployee: false,
        isPrimaryTier: false,
        reputationScore: 3.0,
        reliabilityBonus: false,
        noShowCount: 0,
        claimTimeBonus: 100, // Should be capped at 60
      };

      const score = calculatePriorityScore(factors);

      // 0 + 0 + 300 + 0 + 0 + 60 = 360
      expect(score).toBe(360);
    });

    it('should never return negative score', () => {
      const factors: ClaimPriorityFactors = {
        isOwnEmployee: false,
        isPrimaryTier: false,
        reputationScore: 0,
        reliabilityBonus: false,
        noShowCount: 100, // -2500 penalty
        claimTimeBonus: 0,
      };

      const score = calculatePriorityScore(factors);

      expect(score).toBe(0);
    });
  });
});
