import { Position } from './shift.types.js';

/**
 * Multi-Employer Identity Model
 *
 * A single User can have multiple WorkerProfiles, one per restaurant.
 * Restaurants can belong to Networks for cross-restaurant scheduling.
 *
 * User (global identity)
 *   └── WorkerProfile[] (per-restaurant employment)
 *         ├── restaurant_id
 *         ├── positions[] (qualified roles)
 *         ├── hourly_rate
 *         └── certifications[]
 */

export enum UserRole {
  /** Platform administrator */
  ADMIN = 'ADMIN',
  /** Restaurant owner with full access */
  OWNER = 'OWNER',
  /** Restaurant manager with scheduling access */
  MANAGER = 'MANAGER',
  /** Supervisor with limited approval access */
  SUPERVISOR = 'SUPERVISOR',
  /** Regular staff member */
  WORKER = 'WORKER',
}

/** Employment status at a specific restaurant */
export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

/** Tier determines visibility and priority for network shifts */
export enum WorkerTier {
  /** Primary employee, highest priority */
  PRIMARY = 'PRIMARY',
  /** Part-time or secondary, medium priority */
  SECONDARY = 'SECONDARY',
  /** On-call or network floater, lowest priority */
  ON_CALL = 'ON_CALL',
}

/** Global user identity (one per person) */
export interface User {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;

  /** Profile photo URL */
  avatarUrl: string | null;

  /** Phone verification status */
  phoneVerified: boolean;

  /** Email verification status */
  emailVerified: boolean;

  /** Platform-level role (usually WORKER, can be ADMIN) */
  platformRole: 'USER' | 'ADMIN';

  /** User's preferred locale */
  locale: string;

  /** Timezone for shift displays */
  timezone: string;

  /** Push notification tokens */
  fcmTokens: string[];

  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/** Worker profile at a specific restaurant */
export interface WorkerProfile {
  id: string;
  userId: string;
  restaurantId: string;

  /** Role at this specific restaurant */
  role: UserRole;

  /** Employment status */
  status: EmploymentStatus;

  /** Tier for shift prioritization */
  tier: WorkerTier;

  /** Positions this worker is qualified for */
  positions: Position[];

  /** Default hourly rate at this restaurant */
  hourlyRate: number;

  /** Certifications (food safety, alcohol service, etc.) */
  certifications: Certification[];

  /** Date of hire at this restaurant */
  hiredAt: string;

  /** Manager who approved this profile */
  approvedByUserId: string | null;

  /** Aggregate stats for this restaurant */
  stats: WorkerStats;

  createdAt: string;
  updatedAt: string;
}

/** Certification record */
export interface Certification {
  type: CertificationType;
  issuedAt: string;
  expiresAt: string | null;
  verificationUrl: string | null;
}

export enum CertificationType {
  FOOD_HANDLER = 'FOOD_HANDLER',
  ALCOHOL_SERVICE = 'ALCOHOL_SERVICE',
  ALLERGEN_AWARENESS = 'ALLERGEN_AWARENESS',
  MANAGER_CERTIFICATION = 'MANAGER_CERTIFICATION',
}

/** Worker statistics for reputation scoring */
export interface WorkerStats {
  /** Total shifts completed */
  shiftsCompleted: number;
  /** Total no-shows */
  noShowCount: number;
  /** Total late arrivals (>5 min) */
  lateCount: number;
  /** Average rating from managers (1-5) */
  averageRating: number;
  /** Number of ratings received */
  ratingCount: number;
  /** Calculated reliability score (0-5) */
  reliabilityScore: number;
  /** Last shift worked */
  lastShiftAt: string | null;
}

/** Calculate reliability score from stats */
export function calculateReliabilityScore(stats: WorkerStats): number {
  if (stats.shiftsCompleted === 0) return 3.0; // Default for new workers

  const noShowPenalty = (stats.noShowCount / stats.shiftsCompleted) * 5;
  const latePenalty = (stats.lateCount / stats.shiftsCompleted) * 1;

  // Start at 5.0 and subtract penalties
  let score = 5.0 - noShowPenalty - latePenalty;

  // Factor in manager ratings (weighted 30%)
  if (stats.ratingCount > 0) {
    score = score * 0.7 + stats.averageRating * 0.3;
  }

  return Math.max(0, Math.min(5, score)); // Clamp to 0-5
}

/** Availability preference for a worker */
export interface Availability {
  id: string;
  workerProfileId: string;

  /** Day of week (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number;

  /** Start time in HH:MM format */
  startTime: string;
  /** End time in HH:MM format */
  endTime: string;

  /** Whether this is a preferred time (vs just available) */
  isPreferred: boolean;

  /** Effective date range */
  effectiveFrom: string;
  effectiveUntil: string | null;
}

/** Time-off request */
export interface TimeOffRequest {
  id: string;
  workerProfileId: string;

  startDate: string;
  endDate: string;

  /** All day or specific times */
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;

  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';

  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;

  createdAt: string;
}

/** Restaurant entity */
export interface Restaurant {
  id: string;
  name: string;
  networkId: string | null;

  /** Address components */
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    lat: number;
    lng: number;
  };

  /** Timezone for this location */
  timezone: string;

  /** Contact info */
  phone: string;
  email: string;

  /** Operating hours by day */
  operatingHours: OperatingHours[];

  /** Ghost kitchen configuration */
  ghostKitchenEnabled: boolean;
  ghostKitchenConfig: GhostKitchenConfig | null;

  /** Shift claiming settings */
  shiftSettings: ShiftSettings;

  createdAt: string;
  updatedAt: string;
}

export interface OperatingHours {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface GhostKitchenConfig {
  /** KitchenHub integration ID */
  aggregatorIntegrationId: string | null;
  /** Maximum concurrent orders */
  maxConcurrentOrders: number;
  /** Enabled delivery platforms */
  enabledPlatforms: ('DOORDASH' | 'UBEREATS' | 'GRUBHUB')[];
  /** Auto-disable ghost mode at this capacity % */
  autoDisableThreshold: number;
}

export interface ShiftSettings {
  /** Require manager approval for shift claims */
  requireClaimApproval: boolean;
  /** Auto-approve if worker reputation above this score */
  autoApproveThreshold: number;
  /** Hours before shift when it opens to network workers */
  networkVisibilityHours: number;
  /** Minimum reputation to claim shifts at this restaurant */
  minReputationScore: number;
  /** Allow cross-restaurant swaps */
  allowCrossRestaurantSwaps: boolean;
}

/** Restaurant network for cross-restaurant scheduling */
export interface RestaurantNetwork {
  id: string;
  name: string;
  description: string | null;

  /** Network owner (usually the parent restaurant) */
  ownerRestaurantId: string;

  /** Member restaurants */
  memberRestaurantIds: string[];

  /** Network-wide settings */
  settings: NetworkSettings;

  createdAt: string;
  updatedAt: string;
}

export interface NetworkSettings {
  /** Allow workers to see shifts at other network restaurants */
  enableCrossRestaurantShifts: boolean;
  /** Require approval for cross-restaurant claims */
  requireCrossRestaurantApproval: boolean;
  /** Maximum distance (miles) for network shift visibility */
  maxDistanceMiles: number;
  /** Minimum reputation for network shift claims */
  minNetworkReputationScore: number;
}
