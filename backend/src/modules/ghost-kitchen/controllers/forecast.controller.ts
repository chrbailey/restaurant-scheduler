import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { AnalyticsService } from '../services/analytics.service';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/identity/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ForecastQueryDto,
  OpportunityActionDto,
} from '../dto/ghost-mode.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';

/**
 * Forecast Controller
 *
 * REST API endpoints for ghost kitchen demand forecasting:
 * - Get demand forecasts
 * - View upcoming opportunities
 * - Accept/decline opportunities
 * - Get staffing recommendations
 */
@ApiTags('ghost-kitchen')
@Controller('ghost-kitchen')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ForecastController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('forecast')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get demand forecast',
    description:
      'Get predicted order volumes and revenue for upcoming time slots based on historical data.',
  })
  @ApiResponse({ status: 200, description: 'Demand forecast data' })
  async getForecast(@Query() query: ForecastQueryDto) {
    const forecast = await this.analyticsService.getDemandForecast(
      query.restaurantId,
      query.days || 7,
    );

    // Calculate summary statistics
    const totalPredictedOrders = forecast.reduce(
      (sum, opp) => sum + opp.predictedOrders,
      0,
    );
    const totalPredictedRevenue = forecast.reduce(
      (sum, opp) => sum + opp.predictedRevenue,
      0,
    );
    const avgConfidence =
      forecast.length > 0
        ? forecast.reduce((sum, opp) => sum + opp.confidence, 0) /
          forecast.length
        : 0;

    return {
      restaurantId: query.restaurantId,
      days: query.days || 7,
      generatedAt: new Date(),
      summary: {
        totalOpportunities: forecast.length,
        totalPredictedOrders,
        totalPredictedRevenue: Math.round(totalPredictedRevenue * 100) / 100,
        avgConfidence: Math.round(avgConfidence),
      },
      forecast,
    };
  }

  @Get('opportunities')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get upcoming opportunities',
    description:
      'Get list of high-potential ghost kitchen opportunities with staffing recommendations.',
  })
  @ApiResponse({ status: 200, description: 'List of upcoming opportunities' })
  async getOpportunities(@Query() query: ForecastQueryDto) {
    const forecast = await this.analyticsService.getDemandForecast(
      query.restaurantId,
      query.days || 7,
    );

    // Filter to high-confidence opportunities
    const opportunities = forecast.filter((opp) => opp.confidence >= 50);

    // Get previously accepted/declined opportunities from cache
    const acceptedKey = `ghost:opportunities:${query.restaurantId}:accepted`;
    const declinedKey = `ghost:opportunities:${query.restaurantId}:declined`;
    const accepted = (await this.redis.getJson<string[]>(acceptedKey)) || [];
    const declined = (await this.redis.getJson<string[]>(declinedKey)) || [];

    // Categorize opportunities
    const pending = opportunities.filter(
      (opp) => !accepted.includes(opp.id) && !declined.includes(opp.id),
    );
    const acceptedOpps = opportunities.filter((opp) =>
      accepted.includes(opp.id),
    );

    // Calculate total potential
    const totalPotentialRevenue = pending.reduce(
      (sum, opp) => sum + opp.predictedRevenue,
      0,
    );

    return {
      restaurantId: query.restaurantId,
      summary: {
        pending: pending.length,
        accepted: acceptedOpps.length,
        declined: declined.length,
        totalPotentialRevenue: Math.round(totalPotentialRevenue * 100) / 100,
      },
      opportunities: {
        pending: pending.sort(
          (a, b) => b.predictedRevenue - a.predictedRevenue,
        ),
        accepted: acceptedOpps,
      },
    };
  }

  @Post('opportunities/:opportunityId/accept')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Accept opportunity',
    description:
      'Mark an opportunity as accepted, signaling intent to run ghost kitchen during this slot.',
  })
  @ApiParam({ name: 'opportunityId', description: 'Opportunity ID' })
  @ApiResponse({ status: 200, description: 'Opportunity accepted' })
  async acceptOpportunity(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: OpportunityActionDto,
    @CurrentUser('id') userId: string,
  ) {
    const acceptedKey = `ghost:opportunities:${dto.restaurantId}:accepted`;
    const declinedKey = `ghost:opportunities:${dto.restaurantId}:declined`;

    // Get current lists
    const accepted = (await this.redis.getJson<string[]>(acceptedKey)) || [];
    const declined = (await this.redis.getJson<string[]>(declinedKey)) || [];

    // Remove from declined if present
    const filteredDeclined = declined.filter((id) => id !== opportunityId);
    if (filteredDeclined.length !== declined.length) {
      await this.redis.setJson(declinedKey, filteredDeclined, 7 * 24 * 3600);
    }

    // Add to accepted if not already
    if (!accepted.includes(opportunityId)) {
      accepted.push(opportunityId);
      await this.redis.setJson(acceptedKey, accepted, 7 * 24 * 3600);
    }

    // Log the action
    await this.logOpportunityAction(
      dto.restaurantId,
      opportunityId,
      'ACCEPTED',
      userId,
      dto.notes,
    );

    return {
      success: true,
      opportunityId,
      action: 'ACCEPTED',
      message: 'Opportunity has been accepted. Consider scheduling staff for this time slot.',
    };
  }

  @Post('opportunities/:opportunityId/decline')
  @Roles('MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Decline opportunity',
    description: 'Mark an opportunity as declined.',
  })
  @ApiParam({ name: 'opportunityId', description: 'Opportunity ID' })
  @ApiResponse({ status: 200, description: 'Opportunity declined' })
  async declineOpportunity(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: OpportunityActionDto,
    @CurrentUser('id') userId: string,
  ) {
    const acceptedKey = `ghost:opportunities:${dto.restaurantId}:accepted`;
    const declinedKey = `ghost:opportunities:${dto.restaurantId}:declined`;

    // Get current lists
    const accepted = (await this.redis.getJson<string[]>(acceptedKey)) || [];
    const declined = (await this.redis.getJson<string[]>(declinedKey)) || [];

    // Remove from accepted if present
    const filteredAccepted = accepted.filter((id) => id !== opportunityId);
    if (filteredAccepted.length !== accepted.length) {
      await this.redis.setJson(acceptedKey, filteredAccepted, 7 * 24 * 3600);
    }

    // Add to declined if not already
    if (!declined.includes(opportunityId)) {
      declined.push(opportunityId);
      await this.redis.setJson(declinedKey, declined, 7 * 24 * 3600);
    }

    // Log the action
    await this.logOpportunityAction(
      dto.restaurantId,
      opportunityId,
      'DECLINED',
      userId,
      dto.notes,
    );

    return {
      success: true,
      opportunityId,
      action: 'DECLINED',
      message: 'Opportunity has been declined.',
    };
  }

  @Get('staffing-recommendation')
  @Roles('SUPERVISOR', 'MANAGER', 'OWNER')
  @ApiOperation({
    summary: 'Get staffing recommendation',
    description:
      'Get staffing recommendations based on accepted opportunities and forecast demand.',
  })
  @ApiResponse({ status: 200, description: 'Staffing recommendations' })
  async getStaffingRecommendation(@Query() query: ForecastQueryDto) {
    const forecast = await this.analyticsService.getDemandForecast(
      query.restaurantId,
      query.days || 7,
    );

    // Get accepted opportunities
    const acceptedKey = `ghost:opportunities:${query.restaurantId}:accepted`;
    const accepted = (await this.redis.getJson<string[]>(acceptedKey)) || [];

    // Filter to accepted opportunities
    const acceptedOpps = forecast.filter((opp) =>
      accepted.includes(opp.id),
    );

    // If no accepted opportunities, recommend based on high-potential slots
    const relevantOpps =
      acceptedOpps.length > 0
        ? acceptedOpps
        : forecast.filter((opp) => opp.confidence >= 70).slice(0, 5);

    // Aggregate staffing needs
    const staffingByDate: Map<
      string,
      {
        date: string;
        slots: Array<{
          timeSlot: string;
          minWorkers: number;
          optimalWorkers: number;
          positions: string[];
          estimatedRevenue: number;
        }>;
        totalMinWorkers: number;
        totalOptimalWorkers: number;
        totalEstimatedRevenue: number;
      }
    > = new Map();

    for (const opp of relevantOpps) {
      const dateKey = opp.date.toISOString().split('T')[0];
      const existing = staffingByDate.get(dateKey) || {
        date: dateKey,
        slots: [],
        totalMinWorkers: 0,
        totalOptimalWorkers: 0,
        totalEstimatedRevenue: 0,
      };

      existing.slots.push({
        timeSlot: opp.timeSlot,
        minWorkers: opp.staffingRecommendation.minWorkers,
        optimalWorkers: opp.staffingRecommendation.optimalWorkers,
        positions: opp.staffingRecommendation.positions,
        estimatedRevenue: opp.predictedRevenue,
      });

      existing.totalMinWorkers += opp.staffingRecommendation.minWorkers;
      existing.totalOptimalWorkers += opp.staffingRecommendation.optimalWorkers;
      existing.totalEstimatedRevenue += opp.predictedRevenue;

      staffingByDate.set(dateKey, existing);
    }

    // Get available workers
    const availableWorkers = await this.getDeliveryCertifiedWorkers(
      query.restaurantId,
    );

    // Build recommendations
    const recommendations = Array.from(staffingByDate.values()).map((day) => ({
      ...day,
      totalEstimatedRevenue:
        Math.round(day.totalEstimatedRevenue * 100) / 100,
      workerShortage: Math.max(
        0,
        day.totalOptimalWorkers - availableWorkers.length,
      ),
      recommendation:
        availableWorkers.length >= day.totalOptimalWorkers
          ? 'Sufficient staff available'
          : availableWorkers.length >= day.totalMinWorkers
            ? 'Consider calling in additional staff for optimal performance'
            : 'Staff shortage - may need to limit operations or recruit additional workers',
    }));

    return {
      restaurantId: query.restaurantId,
      availableWorkers: {
        count: availableWorkers.length,
        workers: availableWorkers.slice(0, 10), // Top 10
      },
      recommendations: recommendations.sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      summary: {
        totalDaysWithRecommendations: recommendations.length,
        totalSlotsRecommended: recommendations.reduce(
          (sum, r) => sum + r.slots.length,
          0,
        ),
        totalEstimatedRevenue: recommendations.reduce(
          (sum, r) => sum + r.totalEstimatedRevenue,
          0,
        ),
        daysWithShortage: recommendations.filter((r) => r.workerShortage > 0)
          .length,
      },
    };
  }

  // ==================== Helper Methods ====================

  private async logOpportunityAction(
    restaurantId: string,
    opportunityId: string,
    action: 'ACCEPTED' | 'DECLINED',
    userId: string,
    notes?: string,
  ): Promise<void> {
    // Log to a simple audit trail in Redis
    const logKey = `ghost:opportunities:${restaurantId}:log`;
    const existing = (await this.redis.getJson<any[]>(logKey)) || [];

    existing.push({
      opportunityId,
      action,
      userId,
      notes,
      timestamp: new Date().toISOString(),
    });

    // Keep last 100 entries
    const trimmed = existing.slice(-100);
    await this.redis.setJson(logKey, trimmed, 30 * 24 * 3600); // 30 days
  }

  private async getDeliveryCertifiedWorkers(
    restaurantId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      reliabilityScore: number;
    }>
  > {
    const workers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        certifications: {
          some: {
            type: 'DELIVERY',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
      select: {
        id: true,
        reliabilityScore: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        reliabilityScore: 'desc',
      },
    });

    return workers.map((w) => ({
      id: w.id,
      name: `${w.user.firstName} ${w.user.lastName}`,
      reliabilityScore: Number(w.reliabilityScore),
    }));
  }
}
