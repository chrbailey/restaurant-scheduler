import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { RedisService } from '@/common/redis/redis.service';

/**
 * Worker performance report
 */
export interface WorkerPerformanceReport {
  workerId: string;
  workerProfileId: string;
  workerName: string;
  restaurantId: string;
  restaurantName: string;
  generatedAt: Date;
  employmentSummary: {
    hiredAt: Date;
    tenureDays: number;
    status: string;
    tier: string;
    positions: string[];
    hourlyRate: number;
  };
  performanceMetrics: {
    shiftsCompleted: number;
    shiftsScheduled: number;
    completionRate: number;
    averageRating: number;
    ratingCount: number;
    reliabilityScore: number;
    noShowCount: number;
    lateCount: number;
    noShowRate: number;
    lateRate: number;
  };
  attendanceAnalysis: {
    totalScheduledHours: number;
    totalWorkedHours: number;
    overtimeHours: number;
    averageHoursPerWeek: number;
    preferredDays: string[];
    preferredShiftTimes: string[];
  };
  shiftPatterns: {
    byPosition: {
      position: string;
      count: number;
      percentage: number;
    }[];
    byDayOfWeek: {
      day: string;
      count: number;
    }[];
    byTimeSlot: {
      slot: string;
      count: number;
    }[];
  };
  recentActivity: {
    shiftsLast30Days: number;
    swapRequestsLast30Days: number;
    swapAcceptanceLast30Days: number;
    claimsLast30Days: number;
    claimSuccessRate: number;
  };
  comparisonToTeam: {
    reliabilityPercentile: number;
    completionRatePercentile: number;
    ratingPercentile: number;
    hoursPercentile: number;
  };
  recommendations: string[];
}

/**
 * Churn risk assessment
 */
export interface ChurnRiskAssessment {
  workerId: string;
  workerProfileId: string;
  workerName: string;
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: {
    factor: string;
    impact: number; // 0-100
    description: string;
    trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  }[];
  indicators: {
    shiftAcceptanceDecline: number; // Percentage decline
    swapRequestIncrease: number; // Percentage increase
    dropRequestsLast30Days: number;
    hoursWorkedDecline: number; // Percentage decline
    attendanceIssuesLast30Days: number;
    daysSinceLastShift: number;
  };
  predictedRetentionDays: number;
  confidence: number;
  lastAssessed: Date;
}

/**
 * Engagement score breakdown
 */
export interface EngagementScore {
  workerId: string;
  workerProfileId: string;
  overallScore: number; // 0-100
  level: 'HIGHLY_ENGAGED' | 'ENGAGED' | 'NEUTRAL' | 'DISENGAGED' | 'AT_RISK';
  components: {
    availability: number; // How available they make themselves
    responsiveness: number; // How quickly they respond to offers
    flexibility: number; // Willingness to take various shifts
    consistency: number; // Regular shift patterns
    initiative: number; // Claiming extra shifts
    teamwork: number; // Swap/trade activity
  };
  trends: {
    last30Days: number;
    last60Days: number;
    last90Days: number;
    direction: 'UP' | 'STABLE' | 'DOWN';
  };
  lastCalculated: Date;
}

/**
 * Retention action suggestion
 */
export interface RetentionAction {
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  expectedImpact: number; // 0-100
  description: string;
  timeline: string;
}

/**
 * Team comparison result
 */
export interface TeamComparison {
  workerId: string;
  workerProfileId: string;
  workerName: string;
  teamSize: number;
  metrics: {
    metric: string;
    yourValue: number;
    teamAverage: number;
    teamMedian: number;
    percentile: number;
    rank: number;
  }[];
  strengths: string[];
  areasForImprovement: string[];
}

/**
 * Worker Analytics Service
 *
 * Provides individual worker insights including:
 * - Comprehensive performance reports
 * - Churn risk prediction
 * - Engagement scoring
 * - Retention action suggestions
 * - Team comparison metrics
 */
@Injectable()
export class WorkerAnalyticsService {
  private readonly logger = new Logger(WorkerAnalyticsService.name);

  // Cache TTL
  private readonly CACHE_TTL = 1800; // 30 minutes

  // Churn risk weights
  private readonly CHURN_WEIGHTS = {
    shiftAcceptanceDecline: 0.20,
    swapRequestIncrease: 0.15,
    dropRequests: 0.15,
    hoursWorkedDecline: 0.20,
    attendanceIssues: 0.15,
    daysSinceShift: 0.15,
  };

  // Engagement weights
  private readonly ENGAGEMENT_WEIGHTS = {
    availability: 0.20,
    responsiveness: 0.15,
    flexibility: 0.15,
    consistency: 0.20,
    initiative: 0.15,
    teamwork: 0.15,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Generate comprehensive worker performance report
   */
  async getWorkerPerformanceReport(
    workerProfileId: string,
  ): Promise<WorkerPerformanceReport> {
    const cacheKey = `worker-report:${workerProfileId}`;
    const cached = await this.redis.getJson<WorkerPerformanceReport>(cacheKey);
    if (cached) {
      return cached;
    }

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: true,
        restaurant: true,
        availability: true,
        assignedShifts: {
          take: 200,
          orderBy: { startTime: 'desc' },
        },
        shiftClaims: {
          take: 100,
          orderBy: { claimedAt: 'desc' },
        },
        sourceSwaps: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException(`Worker profile not found: ${workerProfileId}`);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate tenure
    const tenureDays = Math.floor(
      (now.getTime() - new Date(worker.hiredAt).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Performance metrics
    const completedShifts = worker.assignedShifts.filter(s => s.status === 'COMPLETED');
    const scheduledShifts = worker.assignedShifts.filter(
      s => s.status !== 'CANCELLED' && s.status !== 'DRAFT',
    );

    // Attendance analysis
    let totalScheduledHours = 0;
    let totalWorkedHours = 0;
    let overtimeHours = 0;
    const weeklyHours: Map<string, number> = new Map();

    for (const shift of scheduledShifts) {
      const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      totalScheduledHours += hours;

      if (shift.status === 'COMPLETED') {
        totalWorkedHours += hours;
      }

      // Track weekly hours
      const weekKey = this.getWeekKey(shift.startTime);
      const current = weeklyHours.get(weekKey) || 0;
      weeklyHours.set(weekKey, current + hours);
    }

    // Calculate overtime
    for (const [, hours] of weeklyHours) {
      if (hours > 40) {
        overtimeHours += hours - 40;
      }
    }

    const averageHoursPerWeek = weeklyHours.size > 0
      ? Array.from(weeklyHours.values()).reduce((a, b) => a + b, 0) / weeklyHours.size
      : 0;

    // Shift patterns by position
    const positionCounts = new Map<string, number>();
    for (const shift of completedShifts) {
      positionCounts.set(shift.position, (positionCounts.get(shift.position) || 0) + 1);
    }

    const byPosition = Array.from(positionCounts.entries())
      .map(([position, count]) => ({
        position,
        count,
        percentage: Math.round((count / completedShifts.length) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Shift patterns by day of week
    const dayCounts = new Map<number, number>();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const shift of completedShifts) {
      const day = new Date(shift.startTime).getDay();
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }

    const byDayOfWeek = Array.from(dayCounts.entries())
      .map(([day, count]) => ({
        day: dayNames[day],
        count,
      }))
      .sort((a, b) => dayNames.indexOf(a.day) - dayNames.indexOf(b.day));

    // Shift patterns by time slot
    const timeSlotCounts = new Map<string, number>();
    for (const shift of completedShifts) {
      const hour = new Date(shift.startTime).getHours();
      let slot: string;
      if (hour < 11) slot = 'Morning (before 11am)';
      else if (hour < 15) slot = 'Lunch (11am-3pm)';
      else if (hour < 18) slot = 'Afternoon (3pm-6pm)';
      else slot = 'Evening (after 6pm)';

      timeSlotCounts.set(slot, (timeSlotCounts.get(slot) || 0) + 1);
    }

    const byTimeSlot = Array.from(timeSlotCounts.entries())
      .map(([slot, count]) => ({ slot, count }))
      .sort((a, b) => b.count - a.count);

    // Recent activity
    const recentShifts = worker.assignedShifts.filter(
      s => new Date(s.startTime) >= thirtyDaysAgo,
    );
    const recentSwaps = worker.sourceSwaps.filter(
      s => new Date(s.createdAt) >= thirtyDaysAgo,
    );
    const recentClaims = worker.shiftClaims.filter(
      s => new Date(s.claimedAt) >= thirtyDaysAgo,
    );
    const approvedClaims = recentClaims.filter(c => c.status === 'APPROVED');

    // Get preferred days from availability
    const preferredDays = worker.availability
      .filter(a => a.isPreferred)
      .map(a => dayNames[a.dayOfWeek]);

    const preferredShiftTimes = worker.availability
      .filter(a => a.isPreferred)
      .map(a => `${a.startTime}-${a.endTime}`);

    // Compare to team
    const teamComparison = await this.compareToTeam(workerProfileId);

    // Generate recommendations
    const recommendations = this.generatePerformanceRecommendations(
      worker,
      scheduledShifts.length,
      completedShifts.length,
      teamComparison,
    );

    const report: WorkerPerformanceReport = {
      workerId: worker.userId,
      workerProfileId: worker.id,
      workerName: `${worker.user.firstName} ${worker.user.lastName}`,
      restaurantId: worker.restaurantId,
      restaurantName: worker.restaurant.name,
      generatedAt: new Date(),
      employmentSummary: {
        hiredAt: worker.hiredAt,
        tenureDays,
        status: worker.status,
        tier: worker.tier,
        positions: worker.positions,
        hourlyRate: Number(worker.hourlyRate),
      },
      performanceMetrics: {
        shiftsCompleted: worker.shiftsCompleted,
        shiftsScheduled: scheduledShifts.length,
        completionRate: scheduledShifts.length > 0
          ? Math.round((completedShifts.length / scheduledShifts.length) * 100)
          : 0,
        averageRating: Number(worker.averageRating),
        ratingCount: worker.ratingCount,
        reliabilityScore: Number(worker.reliabilityScore),
        noShowCount: worker.noShowCount,
        lateCount: worker.lateCount,
        noShowRate: scheduledShifts.length > 0
          ? Math.round((worker.noShowCount / scheduledShifts.length) * 10000) / 100
          : 0,
        lateRate: scheduledShifts.length > 0
          ? Math.round((worker.lateCount / scheduledShifts.length) * 10000) / 100
          : 0,
      },
      attendanceAnalysis: {
        totalScheduledHours: Math.round(totalScheduledHours * 100) / 100,
        totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        averageHoursPerWeek: Math.round(averageHoursPerWeek * 100) / 100,
        preferredDays,
        preferredShiftTimes,
      },
      shiftPatterns: {
        byPosition,
        byDayOfWeek,
        byTimeSlot,
      },
      recentActivity: {
        shiftsLast30Days: recentShifts.length,
        swapRequestsLast30Days: recentSwaps.length,
        swapAcceptanceLast30Days: recentSwaps.filter(s => s.status === 'ACCEPTED').length,
        claimsLast30Days: recentClaims.length,
        claimSuccessRate: recentClaims.length > 0
          ? Math.round((approvedClaims.length / recentClaims.length) * 100)
          : 0,
      },
      comparisonToTeam: {
        reliabilityPercentile: teamComparison.metrics.find(m => m.metric === 'Reliability')?.percentile || 0,
        completionRatePercentile: teamComparison.metrics.find(m => m.metric === 'Completion Rate')?.percentile || 0,
        ratingPercentile: teamComparison.metrics.find(m => m.metric === 'Average Rating')?.percentile || 0,
        hoursPercentile: teamComparison.metrics.find(m => m.metric === 'Hours Worked')?.percentile || 0,
      },
      recommendations,
    };

    // Cache result
    await this.redis.setJson(cacheKey, report, this.CACHE_TTL);

    return report;
  }

  /**
   * Predict churn risk for a worker
   */
  async predictChurnRisk(workerProfileId: string): Promise<ChurnRiskAssessment> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: true,
        assignedShifts: {
          take: 100,
          orderBy: { startTime: 'desc' },
        },
        shiftClaims: {
          take: 50,
          orderBy: { claimedAt: 'desc' },
        },
        sourceSwaps: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        shiftOffers: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException(`Worker profile not found: ${workerProfileId}`);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Calculate shift acceptance decline
    const recentOffers = worker.shiftOffers.filter(o => new Date(o.createdAt) >= thirtyDaysAgo);
    const olderOffers = worker.shiftOffers.filter(
      o => new Date(o.createdAt) >= sixtyDaysAgo && new Date(o.createdAt) < thirtyDaysAgo,
    );

    const recentAcceptRate = recentOffers.length > 0
      ? recentOffers.filter(o => o.status === 'ACCEPTED').length / recentOffers.length
      : 1;
    const olderAcceptRate = olderOffers.length > 0
      ? olderOffers.filter(o => o.status === 'ACCEPTED').length / olderOffers.length
      : 1;

    const shiftAcceptanceDecline = olderAcceptRate > 0
      ? Math.max(0, ((olderAcceptRate - recentAcceptRate) / olderAcceptRate) * 100)
      : 0;

    // Calculate swap request increase
    const recentSwaps = worker.sourceSwaps.filter(s => new Date(s.createdAt) >= thirtyDaysAgo);
    const olderSwaps = worker.sourceSwaps.filter(
      s => new Date(s.createdAt) >= sixtyDaysAgo && new Date(s.createdAt) < thirtyDaysAgo,
    );

    const swapRequestIncrease = olderSwaps.length > 0
      ? Math.max(0, ((recentSwaps.length - olderSwaps.length) / olderSwaps.length) * 100)
      : (recentSwaps.length > 2 ? 50 : 0);

    // Count drop requests (swaps where worker gave away shift with no return)
    const dropRequestsLast30Days = recentSwaps.filter(
      s => !s.targetShiftId && s.status !== 'CANCELLED',
    ).length;

    // Calculate hours worked decline
    const recentShifts = worker.assignedShifts.filter(s => new Date(s.startTime) >= thirtyDaysAgo);
    const olderShifts = worker.assignedShifts.filter(
      s => new Date(s.startTime) >= sixtyDaysAgo && new Date(s.startTime) < thirtyDaysAgo,
    );

    const recentHours = this.calculateTotalHours(recentShifts);
    const olderHours = this.calculateTotalHours(olderShifts);

    const hoursWorkedDecline = olderHours > 0
      ? Math.max(0, ((olderHours - recentHours) / olderHours) * 100)
      : 0;

    // Count attendance issues
    const attendanceIssuesLast30Days = worker.noShowCount + worker.lateCount; // Simplified

    // Days since last shift
    const lastShift = worker.assignedShifts.find(s => s.status === 'COMPLETED');
    const daysSinceLastShift = lastShift
      ? Math.floor((now.getTime() - new Date(lastShift.startTime).getTime()) / (1000 * 60 * 60 * 24))
      : 365;

    // Calculate individual risk factors
    const riskFactors: ChurnRiskAssessment['riskFactors'] = [];

    if (shiftAcceptanceDecline > 20) {
      riskFactors.push({
        factor: 'Declining Shift Acceptance',
        impact: Math.min(100, shiftAcceptanceDecline * 2),
        description: `Shift acceptance rate dropped ${shiftAcceptanceDecline.toFixed(0)}% in the last 30 days`,
        trend: shiftAcceptanceDecline > 40 ? 'WORSENING' : 'STABLE',
      });
    }

    if (swapRequestIncrease > 50) {
      riskFactors.push({
        factor: 'Increased Swap Requests',
        impact: Math.min(100, swapRequestIncrease),
        description: `Swap requests increased ${swapRequestIncrease.toFixed(0)}% compared to previous period`,
        trend: swapRequestIncrease > 100 ? 'WORSENING' : 'STABLE',
      });
    }

    if (dropRequestsLast30Days > 2) {
      riskFactors.push({
        factor: 'Shift Drop Requests',
        impact: Math.min(100, dropRequestsLast30Days * 20),
        description: `${dropRequestsLast30Days} shift drops in the last 30 days`,
        trend: 'WORSENING',
      });
    }

    if (hoursWorkedDecline > 25) {
      riskFactors.push({
        factor: 'Reduced Hours',
        impact: Math.min(100, hoursWorkedDecline * 1.5),
        description: `Hours worked decreased ${hoursWorkedDecline.toFixed(0)}% from previous period`,
        trend: hoursWorkedDecline > 50 ? 'WORSENING' : 'STABLE',
      });
    }

    if (daysSinceLastShift > 14) {
      riskFactors.push({
        factor: 'Extended Absence',
        impact: Math.min(100, daysSinceLastShift * 3),
        description: `${daysSinceLastShift} days since last completed shift`,
        trend: daysSinceLastShift > 30 ? 'WORSENING' : 'STABLE',
      });
    }

    // Calculate overall risk score
    const riskScore = Math.min(100, Math.round(
      shiftAcceptanceDecline * this.CHURN_WEIGHTS.shiftAcceptanceDecline +
      swapRequestIncrease * this.CHURN_WEIGHTS.swapRequestIncrease +
      dropRequestsLast30Days * 10 * this.CHURN_WEIGHTS.dropRequests +
      hoursWorkedDecline * this.CHURN_WEIGHTS.hoursWorkedDecline +
      attendanceIssuesLast30Days * 5 * this.CHURN_WEIGHTS.attendanceIssues +
      Math.min(100, daysSinceLastShift * 2) * this.CHURN_WEIGHTS.daysSinceShift,
    ));

    // Determine risk level
    let riskLevel: ChurnRiskAssessment['riskLevel'];
    if (riskScore >= 70) riskLevel = 'CRITICAL';
    else if (riskScore >= 50) riskLevel = 'HIGH';
    else if (riskScore >= 30) riskLevel = 'MEDIUM';
    else riskLevel = 'LOW';

    // Estimate retention
    const predictedRetentionDays = Math.max(7, Math.round(180 * (1 - riskScore / 100)));

    return {
      workerId: worker.userId,
      workerProfileId: worker.id,
      workerName: `${worker.user.firstName} ${worker.user.lastName}`,
      riskScore,
      riskLevel,
      riskFactors,
      indicators: {
        shiftAcceptanceDecline: Math.round(shiftAcceptanceDecline * 100) / 100,
        swapRequestIncrease: Math.round(swapRequestIncrease * 100) / 100,
        dropRequestsLast30Days,
        hoursWorkedDecline: Math.round(hoursWorkedDecline * 100) / 100,
        attendanceIssuesLast30Days,
        daysSinceLastShift,
      },
      predictedRetentionDays,
      confidence: Math.min(90, 50 + worker.assignedShifts.length),
      lastAssessed: new Date(),
    };
  }

  /**
   * Calculate engagement score for a worker
   */
  async getEngagementScore(workerProfileId: string): Promise<EngagementScore> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: true,
        availability: true,
        assignedShifts: {
          take: 100,
          orderBy: { startTime: 'desc' },
        },
        shiftClaims: {
          take: 50,
          orderBy: { claimedAt: 'desc' },
        },
        sourceSwaps: {
          take: 30,
          orderBy: { createdAt: 'desc' },
        },
        targetSwaps: {
          take: 30,
          orderBy: { createdAt: 'desc' },
        },
        shiftOffers: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException(`Worker profile not found: ${workerProfileId}`);
    }

    // Calculate availability score (based on set availability hours)
    const availabilityHours = worker.availability.reduce((sum, a) => {
      const start = parseInt(a.startTime.split(':')[0], 10);
      const end = parseInt(a.endTime.split(':')[0], 10) || 24;
      return sum + (end - start);
    }, 0);
    const availability = Math.min(100, (availabilityHours / 40) * 100);

    // Calculate responsiveness (how quickly they respond to offers)
    const respondedOffers = worker.shiftOffers.filter(o => o.respondedAt);
    const avgResponseTime = respondedOffers.length > 0
      ? respondedOffers.reduce((sum, o) => {
          const responseTime = new Date(o.respondedAt!).getTime() - new Date(o.createdAt).getTime();
          return sum + responseTime;
        }, 0) / respondedOffers.length / (1000 * 60 * 60) // In hours
      : 24;
    const responsiveness = Math.max(0, 100 - (avgResponseTime * 4));

    // Calculate flexibility (variety of positions and times worked)
    const positionsWorked = new Set(worker.assignedShifts.map(s => s.position)).size;
    const timeSlotsWorked = new Set(
      worker.assignedShifts.map(s => {
        const hour = new Date(s.startTime).getHours();
        return hour < 12 ? 'AM' : 'PM';
      }),
    ).size;
    const flexibility = Math.min(100, (positionsWorked / worker.positions.length) * 50 + timeSlotsWorked * 25);

    // Calculate consistency (regular shift patterns)
    const last12Weeks = new Map<string, number>();
    const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);
    for (const shift of worker.assignedShifts) {
      if (new Date(shift.startTime) >= twelveWeeksAgo) {
        const weekKey = this.getWeekKey(shift.startTime);
        last12Weeks.set(weekKey, (last12Weeks.get(weekKey) || 0) + 1);
      }
    }
    const weeksWithShifts = last12Weeks.size;
    const consistency = (weeksWithShifts / 12) * 100;

    // Calculate initiative (claiming extra shifts)
    const approvedClaims = worker.shiftClaims.filter(c => c.status === 'APPROVED').length;
    const initiative = Math.min(100, approvedClaims * 10);

    // Calculate teamwork (swap participation)
    const acceptedSwaps = worker.targetSwaps.filter(s => s.status === 'ACCEPTED').length;
    const teamwork = Math.min(100, acceptedSwaps * 15);

    // Calculate overall score
    const overallScore = Math.round(
      availability * this.ENGAGEMENT_WEIGHTS.availability +
      responsiveness * this.ENGAGEMENT_WEIGHTS.responsiveness +
      flexibility * this.ENGAGEMENT_WEIGHTS.flexibility +
      consistency * this.ENGAGEMENT_WEIGHTS.consistency +
      initiative * this.ENGAGEMENT_WEIGHTS.initiative +
      teamwork * this.ENGAGEMENT_WEIGHTS.teamwork,
    );

    // Determine engagement level
    let level: EngagementScore['level'];
    if (overallScore >= 80) level = 'HIGHLY_ENGAGED';
    else if (overallScore >= 60) level = 'ENGAGED';
    else if (overallScore >= 40) level = 'NEUTRAL';
    else if (overallScore >= 20) level = 'DISENGAGED';
    else level = 'AT_RISK';

    // Calculate trends
    const now = new Date();
    const scores30 = overallScore;
    const scores60 = Math.round(overallScore * 0.95); // Simplified - would need historical data
    const scores90 = Math.round(overallScore * 0.90);

    const direction = scores30 > scores60 + 5 ? 'UP' : scores30 < scores60 - 5 ? 'DOWN' : 'STABLE';

    return {
      workerId: worker.userId,
      workerProfileId: worker.id,
      overallScore,
      level,
      components: {
        availability: Math.round(availability),
        responsiveness: Math.round(responsiveness),
        flexibility: Math.round(flexibility),
        consistency: Math.round(consistency),
        initiative: Math.round(initiative),
        teamwork: Math.round(teamwork),
      },
      trends: {
        last30Days: scores30,
        last60Days: scores60,
        last90Days: scores90,
        direction,
      },
      lastCalculated: new Date(),
    };
  }

  /**
   * Suggest retention actions for at-risk worker
   */
  async suggestRetentionActions(workerProfileId: string): Promise<RetentionAction[]> {
    const [churnRisk, engagement] = await Promise.all([
      this.predictChurnRisk(workerProfileId),
      this.getEngagementScore(workerProfileId),
    ]);

    const actions: RetentionAction[] = [];

    if (churnRisk.riskLevel === 'LOW') {
      return [{
        action: 'No immediate action needed',
        priority: 'LOW',
        expectedImpact: 0,
        description: 'Worker appears to be engaged and stable',
        timeline: 'Ongoing monitoring',
      }];
    }

    // Check specific risk factors and suggest actions
    for (const factor of churnRisk.riskFactors) {
      if (factor.factor === 'Declining Shift Acceptance') {
        actions.push({
          action: 'Discuss scheduling preferences',
          priority: factor.impact > 50 ? 'HIGH' : 'MEDIUM',
          expectedImpact: 30,
          description: 'Have a conversation about preferred shifts and any scheduling conflicts',
          timeline: 'Within 1 week',
        });
      }

      if (factor.factor === 'Increased Swap Requests') {
        actions.push({
          action: 'Review work-life balance',
          priority: 'MEDIUM',
          expectedImpact: 25,
          description: 'Understand if there are personal circumstances affecting availability',
          timeline: 'Within 2 weeks',
        });
      }

      if (factor.factor === 'Reduced Hours') {
        actions.push({
          action: 'Offer additional shifts',
          priority: 'HIGH',
          expectedImpact: 35,
          description: 'Proactively offer preferred shifts to re-engage the worker',
          timeline: 'Immediate',
        });
      }

      if (factor.factor === 'Extended Absence') {
        actions.push({
          action: 'Check-in call or meeting',
          priority: 'HIGH',
          expectedImpact: 40,
          description: 'Reach out to understand the reason for absence and express value',
          timeline: 'Within 2 days',
        });
      }
    }

    // Add general retention actions based on engagement
    if (engagement.components.initiative < 30) {
      actions.push({
        action: 'Create growth opportunities',
        priority: 'MEDIUM',
        expectedImpact: 25,
        description: 'Offer cross-training or leadership opportunities',
        timeline: 'Within 1 month',
      });
    }

    if (churnRisk.riskScore > 50) {
      actions.push({
        action: 'Recognition and appreciation',
        priority: 'HIGH',
        expectedImpact: 30,
        description: 'Publicly recognize contributions and express appreciation',
        timeline: 'Immediate',
      });

      actions.push({
        action: 'Compensation review',
        priority: 'MEDIUM',
        expectedImpact: 40,
        description: 'Consider if compensation is competitive for the role',
        timeline: 'Within 2 weeks',
      });
    }

    return actions.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Compare worker performance to team
   */
  async compareToTeam(workerProfileId: string): Promise<TeamComparison> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        user: true,
        assignedShifts: {
          take: 100,
          orderBy: { startTime: 'desc' },
        },
      },
    });

    if (!worker) {
      throw new NotFoundException(`Worker profile not found: ${workerProfileId}`);
    }

    // Get all team members
    const teamMembers = await this.prisma.workerProfile.findMany({
      where: {
        restaurantId: worker.restaurantId,
        status: 'ACTIVE',
      },
      include: {
        assignedShifts: {
          take: 100,
          orderBy: { startTime: 'desc' },
        },
      },
    });

    const teamSize = teamMembers.length;

    // Calculate metrics for all team members
    const teamMetrics = teamMembers.map(m => ({
      id: m.id,
      reliability: Number(m.reliabilityScore),
      rating: Number(m.averageRating),
      completionRate: m.shiftsCompleted > 0
        ? (m.shiftsCompleted / (m.shiftsCompleted + m.noShowCount)) * 100
        : 0,
      hoursWorked: this.calculateTotalHours(m.assignedShifts),
    }));

    // Get worker's metrics
    const workerMetrics = teamMetrics.find(m => m.id === workerProfileId)!;

    // Calculate percentiles
    const calculatePercentile = (value: number, allValues: number[]): number => {
      const sorted = [...allValues].sort((a, b) => a - b);
      const index = sorted.findIndex(v => v >= value);
      return Math.round(((index + 1) / sorted.length) * 100);
    };

    const calculateRank = (value: number, allValues: number[]): number => {
      const sorted = [...allValues].sort((a, b) => b - a);
      return sorted.findIndex(v => v === value) + 1;
    };

    const reliabilityValues = teamMetrics.map(m => m.reliability);
    const ratingValues = teamMetrics.map(m => m.rating);
    const completionValues = teamMetrics.map(m => m.completionRate);
    const hoursValues = teamMetrics.map(m => m.hoursWorked);

    const metrics: TeamComparison['metrics'] = [
      {
        metric: 'Reliability',
        yourValue: workerMetrics.reliability,
        teamAverage: this.average(reliabilityValues),
        teamMedian: this.median(reliabilityValues),
        percentile: calculatePercentile(workerMetrics.reliability, reliabilityValues),
        rank: calculateRank(workerMetrics.reliability, reliabilityValues),
      },
      {
        metric: 'Average Rating',
        yourValue: workerMetrics.rating,
        teamAverage: this.average(ratingValues),
        teamMedian: this.median(ratingValues),
        percentile: calculatePercentile(workerMetrics.rating, ratingValues),
        rank: calculateRank(workerMetrics.rating, ratingValues),
      },
      {
        metric: 'Completion Rate',
        yourValue: Math.round(workerMetrics.completionRate * 100) / 100,
        teamAverage: Math.round(this.average(completionValues) * 100) / 100,
        teamMedian: Math.round(this.median(completionValues) * 100) / 100,
        percentile: calculatePercentile(workerMetrics.completionRate, completionValues),
        rank: calculateRank(workerMetrics.completionRate, completionValues),
      },
      {
        metric: 'Hours Worked',
        yourValue: Math.round(workerMetrics.hoursWorked * 100) / 100,
        teamAverage: Math.round(this.average(hoursValues) * 100) / 100,
        teamMedian: Math.round(this.median(hoursValues) * 100) / 100,
        percentile: calculatePercentile(workerMetrics.hoursWorked, hoursValues),
        rank: calculateRank(workerMetrics.hoursWorked, hoursValues),
      },
    ];

    // Identify strengths and areas for improvement
    const strengths: string[] = [];
    const areasForImprovement: string[] = [];

    for (const m of metrics) {
      if (m.percentile >= 75) {
        strengths.push(`${m.metric} is in the top 25% of the team`);
      } else if (m.percentile <= 25) {
        areasForImprovement.push(`${m.metric} is below 75% of team members`);
      }
    }

    return {
      workerId: worker.userId,
      workerProfileId: worker.id,
      workerName: `${worker.user.firstName} ${worker.user.lastName}`,
      teamSize,
      metrics,
      strengths,
      areasForImprovement,
    };
  }

  // ==================== Private Helper Methods ====================

  private calculateTotalHours(shifts: any[]): number {
    return shifts.reduce((total, shift) => {
      if (shift.status === 'COMPLETED' || shift.status === 'ASSIGNED') {
        const hours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
        return total + hours;
      }
      return total;
    }, 0);
  }

  private getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.toISOString().split('T')[0];
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private generatePerformanceRecommendations(
    worker: any,
    scheduled: number,
    completed: number,
    comparison: TeamComparison,
  ): string[] {
    const recommendations: string[] = [];

    // Reliability issues
    if (worker.noShowCount > 2) {
      recommendations.push('Address no-show pattern - consider discussing scheduling conflicts');
    }

    if (worker.lateCount > 5) {
      recommendations.push('Discuss punctuality expectations and any barriers to on-time arrival');
    }

    // Performance compared to team
    const reliabilityMetric = comparison.metrics.find(m => m.metric === 'Reliability');
    if (reliabilityMetric && reliabilityMetric.percentile < 25) {
      recommendations.push('Reliability score is below team average - consider coaching');
    }

    // Engagement
    if (completed > 0 && completed / scheduled < 0.9) {
      recommendations.push('Shift completion rate could be improved - review barriers');
    }

    // Positive reinforcement
    if (comparison.strengths.length > 0 && Number(worker.averageRating) >= 4.5) {
      recommendations.push('Consider for leadership role or cross-training opportunities');
    }

    if (recommendations.length === 0) {
      recommendations.push('Worker is performing well - maintain current engagement');
    }

    return recommendations;
  }
}
