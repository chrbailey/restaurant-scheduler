/**
 * Network E2E Tests
 *
 * Tests for restaurant network and cross-training endpoints:
 * - POST /networks - Create network
 * - POST /networks/:id/invite - Invite restaurant
 * - POST /networks/invitations/:id/respond - Accept/decline invitation
 * - GET /networks/:id/shifts - Network shifts
 * - POST /networks/cross-training - Request cross-training
 * - POST /networks/cross-training/:id/approve - Approve cross-training
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  seedDatabase,
  cleanDatabase,
  getPrisma,
  authenticateUser,
  authGet,
  authPost,
  authPut,
  authDelete,
  TestContext,
  TestUser,
  futureDate,
} from './setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Network E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let context: Omit<TestContext, 'app' | 'prisma' | 'config'>;
  let secondaryOwner: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    context = await seedDatabase(prisma);

    // Create owner for secondary restaurant
    const secOwnerUser = await prisma.user.create({
      data: {
        phone: '+15559990001',
        firstName: 'Secondary',
        lastName: 'Owner',
        phoneVerified: true,
        locale: 'en-US',
        timezone: 'America/New_York',
      },
    });

    await prisma.restaurantMember.create({
      data: {
        userId: secOwnerUser.id,
        restaurantId: context.restaurants.secondary.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });

    secondaryOwner = {
      id: secOwnerUser.id,
      phone: secOwnerUser.phone,
      firstName: 'Secondary',
      lastName: 'Owner',
      role: 'OWNER',
      restaurantId: context.restaurants.secondary.id,
    };

    await Promise.all([
      authenticateUser(app, context.users.owner),
      authenticateUser(app, context.users.manager),
      authenticateUser(app, context.users.worker1),
      authenticateUser(app, context.users.worker2),
      authenticateUser(app, secondaryOwner),
    ]);
  });

  // ==========================================================================
  // CREATE NETWORK TESTS
  // ==========================================================================

  describe('POST /api/networks', () => {
    it('should create a network as owner', async () => {
      const response = await authPost(
        app,
        context.users.owner,
        `/api/networks?restaurantId=${context.restaurants.primary.id}`,
        {
          name: 'Downtown Restaurant Alliance',
          description: 'Collaboration network for downtown restaurants',
          settings: {
            allowCrossShifts: true,
            requireCrossTraining: true,
            maxMemberCount: 10,
          },
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'Downtown Restaurant Alliance');
      expect(response.body).toHaveProperty('ownerRestaurantId', context.restaurants.primary.id);
    });

    it('should reject network creation by manager', async () => {
      await authPost(
        app,
        context.users.manager,
        `/api/networks?restaurantId=${context.restaurants.primary.id}`,
        {
          name: 'Manager Network',
        },
      ).expect(403);
    });

    it('should require network name', async () => {
      await authPost(
        app,
        context.users.owner,
        `/api/networks?restaurantId=${context.restaurants.primary.id}`,
        {
          description: 'No name provided',
        },
      ).expect(400);
    });
  });

  // ==========================================================================
  // GET NETWORK TESTS
  // ==========================================================================

  describe('GET /api/networks/:id', () => {
    let networkId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.create({
        data: {
          networkId,
          restaurantId: context.restaurants.primary.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
    });

    it('should get network by ID', async () => {
      const response = await authGet(
        app,
        context.users.owner,
        `/api/networks/${networkId}`,
      ).expect(200);

      expect(response.body).toHaveProperty('id', networkId);
      expect(response.body).toHaveProperty('name', 'Test Network');
    });

    it('should return 404 for non-existent network', async () => {
      await authGet(
        app,
        context.users.owner,
        '/api/networks/non-existent-id',
      ).expect(404);
    });
  });

  // ==========================================================================
  // INVITE RESTAURANT TESTS
  // ==========================================================================

  describe('POST /api/networks/:id/invite', () => {
    let networkId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.create({
        data: {
          networkId,
          restaurantId: context.restaurants.primary.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
    });

    it('should invite restaurant to network', async () => {
      const response = await authPost(
        app,
        context.users.owner,
        `/api/networks/${networkId}/invite?restaurantId=${context.restaurants.primary.id}`,
        {
          targetRestaurantId: context.restaurants.secondary.id,
          message: 'Join our network!',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('restaurantId', context.restaurants.secondary.id);
    });

    it('should reject invite from non-admin member', async () => {
      // First add secondary restaurant as regular member
      await prisma.networkMembership.create({
        data: {
          networkId,
          restaurantId: context.restaurants.secondary.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      });

      // Secondary owner tries to invite another restaurant (but they're just a member)
      await authPost(
        app,
        secondaryOwner,
        `/api/networks/${networkId}/invite?restaurantId=${context.restaurants.secondary.id}`,
        {
          targetRestaurantId: 'some-other-restaurant',
        },
      ).expect(403);
    });

    it('should reject duplicate invitation', async () => {
      // First invitation
      await authPost(
        app,
        context.users.owner,
        `/api/networks/${networkId}/invite?restaurantId=${context.restaurants.primary.id}`,
        {
          targetRestaurantId: context.restaurants.secondary.id,
        },
      ).expect(201);

      // Duplicate invitation
      await authPost(
        app,
        context.users.owner,
        `/api/networks/${networkId}/invite?restaurantId=${context.restaurants.primary.id}`,
        {
          targetRestaurantId: context.restaurants.secondary.id,
        },
      ).expect(409);
    });
  });

  // ==========================================================================
  // RESPOND TO INVITATION TESTS
  // ==========================================================================

  describe('POST /api/networks/invitations/:membershipId/respond', () => {
    let networkId: string;
    let invitationId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.create({
        data: {
          networkId,
          restaurantId: context.restaurants.primary.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      const invitation = await prisma.networkMembership.create({
        data: {
          networkId,
          restaurantId: context.restaurants.secondary.id,
          role: 'MEMBER',
          status: 'PENDING',
        },
      });
      invitationId = invitation.id;
    });

    it('should accept invitation', async () => {
      const response = await authPost(
        app,
        secondaryOwner,
        `/api/networks/invitations/${invitationId}/respond?restaurantId=${context.restaurants.secondary.id}`,
        {
          accepted: true,
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'ACTIVE');
    });

    it('should decline invitation', async () => {
      const response = await authPost(
        app,
        secondaryOwner,
        `/api/networks/invitations/${invitationId}/respond?restaurantId=${context.restaurants.secondary.id}`,
        {
          accepted: false,
          reason: 'Not interested at this time',
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'DECLINED');
    });

    it('should reject response from non-owner of invited restaurant', async () => {
      await authPost(
        app,
        context.users.owner, // Wrong restaurant's owner
        `/api/networks/invitations/${invitationId}/respond?restaurantId=${context.restaurants.primary.id}`,
        {
          accepted: true,
        },
      ).expect(403);
    });
  });

  // ==========================================================================
  // NETWORK RESTAURANTS TESTS
  // ==========================================================================

  describe('GET /api/networks/:id/restaurants', () => {
    let networkId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId,
            restaurantId: context.restaurants.secondary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });
    });

    it('should list all restaurants in network', async () => {
      const response = await authGet(
        app,
        context.users.owner,
        `/api/networks/${networkId}/restaurants`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });
  });

  // ==========================================================================
  // CROSS-TRAINING REQUEST TESTS
  // ==========================================================================

  describe('POST /api/networks/cross-training', () => {
    let networkId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId,
            restaurantId: context.restaurants.secondary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });
    });

    it('should request cross-training at another restaurant', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        '/api/networks/cross-training',
        {
          workerProfileId: context.users.worker1.workerProfileId,
          targetRestaurantId: context.restaurants.secondary.id,
          positions: ['SERVER', 'HOST'],
          notes: 'I would like to learn new skills',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('targetRestaurantId', context.restaurants.secondary.id);
    });

    it('should reject cross-training to restaurant not in same network', async () => {
      // Create a restaurant not in the network
      const outsideRestaurant = await prisma.restaurant.create({
        data: {
          name: 'Outside Restaurant',
          slug: 'outside-restaurant',
          timezone: 'America/New_York',
          address: '789 Outside St',
          latitude: 40.73,
          longitude: -74.02,
          phone: '+12125559999',
        },
      });

      await authPost(
        app,
        context.users.worker1,
        '/api/networks/cross-training',
        {
          workerProfileId: context.users.worker1.workerProfileId,
          targetRestaurantId: outsideRestaurant.id,
          positions: ['SERVER'],
        },
      ).expect(400);
    });
  });

  // ==========================================================================
  // CROSS-TRAINING APPROVAL TESTS
  // ==========================================================================

  describe('POST /api/networks/cross-training/:id/approve', () => {
    let crossTrainingId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId: network.id,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId: network.id,
            restaurantId: context.restaurants.secondary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });

      const crossTraining = await prisma.crossTraining.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          homeRestaurantId: context.restaurants.primary.id,
          targetRestaurantId: context.restaurants.secondary.id,
          networkId: network.id,
          status: 'PENDING',
          positions: ['SERVER'],
        },
      });
      crossTrainingId = crossTraining.id;
    });

    it('should approve cross-training as target restaurant manager', async () => {
      // Create manager for secondary restaurant
      const secManagerUser = await prisma.user.create({
        data: {
          phone: '+15559990002',
          firstName: 'Secondary',
          lastName: 'Manager',
          phoneVerified: true,
          locale: 'en-US',
          timezone: 'America/New_York',
        },
      });

      await prisma.restaurantMember.create({
        data: {
          userId: secManagerUser.id,
          restaurantId: context.restaurants.secondary.id,
          role: 'MANAGER',
          status: 'ACTIVE',
        },
      });

      const secManager = {
        id: secManagerUser.id,
        phone: secManagerUser.phone,
        firstName: 'Secondary',
        lastName: 'Manager',
        role: 'MANAGER' as const,
        restaurantId: context.restaurants.secondary.id,
      };

      await authenticateUser(app, secManager);

      const response = await authPost(
        app,
        secManager,
        `/api/networks/cross-training/${crossTrainingId}/approve?restaurantId=${context.restaurants.secondary.id}`,
        {
          approvedPositions: ['SERVER'],
          maxHoursPerWeek: 20,
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'APPROVED');
    });

    it('should reject approval from home restaurant manager', async () => {
      await authPost(
        app,
        context.users.manager, // Home restaurant manager
        `/api/networks/cross-training/${crossTrainingId}/approve?restaurantId=${context.restaurants.primary.id}`,
        {
          approvedPositions: ['SERVER'],
        },
      ).expect(403);
    });
  });

  // ==========================================================================
  // CROSS-TRAINING REJECTION TESTS
  // ==========================================================================

  describe('POST /api/networks/cross-training/:id/reject', () => {
    let crossTrainingId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId: network.id,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId: network.id,
            restaurantId: context.restaurants.secondary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });

      const crossTraining = await prisma.crossTraining.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          homeRestaurantId: context.restaurants.primary.id,
          targetRestaurantId: context.restaurants.secondary.id,
          networkId: network.id,
          status: 'PENDING',
          positions: ['SERVER'],
        },
      });
      crossTrainingId = crossTraining.id;
    });

    it('should reject cross-training request', async () => {
      const response = await authPost(
        app,
        secondaryOwner,
        `/api/networks/cross-training/${crossTrainingId}/reject?restaurantId=${context.restaurants.secondary.id}`,
        {
          reason: 'Not accepting new cross-trained workers at this time',
        },
      ).expect(200);

      expect(response.body).toHaveProperty('status', 'REJECTED');
    });
  });

  // ==========================================================================
  // NETWORK SHIFTS TESTS
  // ==========================================================================

  describe('GET /api/networks/worker/:workerProfileId/shifts/available', () => {
    let networkId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId,
            restaurantId: context.restaurants.secondary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });

      // Approve cross-training for worker
      await prisma.crossTraining.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          homeRestaurantId: context.restaurants.primary.id,
          targetRestaurantId: context.restaurants.secondary.id,
          networkId,
          status: 'APPROVED',
          positions: ['SERVER'],
          approvedAt: new Date(),
        },
      });

      // Create network shift at secondary restaurant
      await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.secondary.id,
          createdById: secondaryOwner.id,
          position: 'SERVER',
          startTime: futureDate(3, 9),
          endTime: futureDate(3, 17),
          status: 'OPEN',
          publishedAt: new Date(),
          isNetworkShift: true,
        },
      });
    });

    it('should list available network shifts for cross-trained worker', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `/api/networks/worker/${context.users.worker1.workerProfileId}/shifts/available`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should include network shift from secondary restaurant
      const networkShift = response.body.find(
        (s: any) => s.restaurantId === context.restaurants.secondary.id,
      );
      expect(networkShift).toBeDefined();
    });

    it('should filter by position', async () => {
      const response = await authGet(
        app,
        context.users.worker1,
        `/api/networks/worker/${context.users.worker1.workerProfileId}/shifts/available?position=HOST`,
      ).expect(200);

      // Worker is not cross-trained for HOST, should be empty
      response.body.forEach((shift: any) => {
        expect(shift.position).toBe('HOST');
      });
    });

    it('should filter by date range', async () => {
      const fromDate = futureDate(2).toISOString();
      const toDate = futureDate(5).toISOString();

      const response = await authGet(
        app,
        context.users.worker1,
        `/api/networks/worker/${context.users.worker1.workerProfileId}/shifts/available?fromDate=${fromDate}&toDate=${toDate}`,
      ).expect(200);

      response.body.forEach((shift: any) => {
        const shiftStart = new Date(shift.startTime);
        expect(shiftStart >= new Date(fromDate)).toBe(true);
        expect(shiftStart <= new Date(toDate)).toBe(true);
      });
    });
  });

  // ==========================================================================
  // CLAIM NETWORK SHIFT TESTS
  // ==========================================================================

  describe('POST /api/networks/shifts/:shiftId/claim', () => {
    let networkId: string;
    let networkShiftId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Test Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId,
            restaurantId: context.restaurants.secondary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });

      await prisma.crossTraining.create({
        data: {
          workerProfileId: context.users.worker1.workerProfileId!,
          homeRestaurantId: context.restaurants.primary.id,
          targetRestaurantId: context.restaurants.secondary.id,
          networkId,
          status: 'APPROVED',
          positions: ['SERVER'],
          approvedAt: new Date(),
        },
      });

      const shift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.secondary.id,
          createdById: secondaryOwner.id,
          position: 'SERVER',
          startTime: futureDate(3, 9),
          endTime: futureDate(3, 17),
          status: 'OPEN',
          publishedAt: new Date(),
          isNetworkShift: true,
        },
      });
      networkShiftId = shift.id;
    });

    it('should allow cross-trained worker to claim network shift', async () => {
      const response = await authPost(
        app,
        context.users.worker1,
        `/api/networks/shifts/${networkShiftId}/claim`,
        {
          workerProfileId: context.users.worker1.workerProfileId,
          notes: 'I can work this shift',
        },
      ).expect(201);

      expect(response.body).toHaveProperty('shiftId', networkShiftId);
    });

    it('should reject claim from non-cross-trained worker', async () => {
      await authPost(
        app,
        context.users.worker2, // Not cross-trained at secondary
        `/api/networks/shifts/${networkShiftId}/claim`,
        {
          workerProfileId: context.users.worker2.workerProfileId,
        },
      ).expect(403);
    });

    it('should reject claim for non-network shift', async () => {
      // Create regular (non-network) shift
      const regularShift = await prisma.shift.create({
        data: {
          restaurantId: context.restaurants.secondary.id,
          createdById: secondaryOwner.id,
          position: 'SERVER',
          startTime: futureDate(4, 9),
          endTime: futureDate(4, 17),
          status: 'OPEN',
          publishedAt: new Date(),
          isNetworkShift: false,
        },
      });

      await authPost(
        app,
        context.users.worker1,
        `/api/networks/shifts/${regularShift.id}/claim`,
        {
          workerProfileId: context.users.worker1.workerProfileId,
        },
      ).expect(400);
    });
  });

  // ==========================================================================
  // RESTAURANT NETWORKS LIST TESTS
  // ==========================================================================

  describe('GET /api/networks/restaurant/:restaurantId', () => {
    beforeEach(async () => {
      const network1 = await prisma.restaurantNetwork.create({
        data: {
          name: 'Network One',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });

      const network2 = await prisma.restaurantNetwork.create({
        data: {
          name: 'Network Two',
          ownerRestaurantId: context.restaurants.secondary.id,
          createdById: secondaryOwner.id,
        },
      });

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId: network1.id,
            restaurantId: context.restaurants.primary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId: network2.id,
            restaurantId: context.restaurants.primary.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        ],
      });
    });

    it('should list all networks a restaurant belongs to', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `/api/networks/restaurant/${context.restaurants.primary.id}`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });
  });

  // ==========================================================================
  // PENDING INVITATIONS TESTS
  // ==========================================================================

  describe('GET /api/networks/restaurant/:restaurantId/invitations', () => {
    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Inviting Network',
          ownerRestaurantId: context.restaurants.secondary.id,
          createdById: secondaryOwner.id,
        },
      });

      await prisma.networkMembership.createMany({
        data: [
          {
            networkId: network.id,
            restaurantId: context.restaurants.secondary.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
          {
            networkId: network.id,
            restaurantId: context.restaurants.primary.id,
            role: 'MEMBER',
            status: 'PENDING',
          },
        ],
      });
    });

    it('should list pending invitations for restaurant', async () => {
      const response = await authGet(
        app,
        context.users.manager,
        `/api/networks/restaurant/${context.restaurants.primary.id}/invitations`,
      ).expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].status).toBe('PENDING');
    });
  });

  // ==========================================================================
  // DELETE NETWORK TESTS
  // ==========================================================================

  describe('DELETE /api/networks/:id', () => {
    let networkId: string;

    beforeEach(async () => {
      const network = await prisma.restaurantNetwork.create({
        data: {
          name: 'Deletable Network',
          ownerRestaurantId: context.restaurants.primary.id,
          createdById: context.users.owner.id,
        },
      });
      networkId = network.id;

      await prisma.networkMembership.create({
        data: {
          networkId,
          restaurantId: context.restaurants.primary.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
    });

    it('should delete network as owner', async () => {
      await authDelete(
        app,
        context.users.owner,
        `/api/networks/${networkId}?restaurantId=${context.restaurants.primary.id}`,
      ).expect(200);

      // Verify network is deleted
      const deleted = await prisma.restaurantNetwork.findUnique({
        where: { id: networkId },
      });
      expect(deleted).toBeNull();
    });

    it('should reject deletion by non-owner', async () => {
      await authDelete(
        app,
        context.users.manager,
        `/api/networks/${networkId}?restaurantId=${context.restaurants.primary.id}`,
      ).expect(403);
    });
  });
});
