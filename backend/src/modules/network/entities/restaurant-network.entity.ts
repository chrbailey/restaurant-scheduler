/**
 * Restaurant Network Entity
 *
 * Represents a trusted group of restaurants that can share workers.
 * Networks enable cross-restaurant shift coverage and worker flexibility.
 */
export interface NetworkSettings {
  /** Whether workers can claim shifts at other network restaurants */
  shiftSharingEnabled: boolean;

  /** Minimum reliability score for auto-approval of network claims */
  autoApproveThreshold: number;

  /** Hours before shifts become visible to network workers */
  visibilityDelayHours: number;

  /** Maximum distance (miles) for network shift visibility */
  maxDistanceMiles: number;

  /** Require cross-training certification for network shifts */
  requireCrossTraining: boolean;

  /** Minimum number of shifts completed at home restaurant */
  minHomeShifts: number;
}

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  shiftSharingEnabled: true,
  autoApproveThreshold: 4.0,
  visibilityDelayHours: 2,
  maxDistanceMiles: 25,
  requireCrossTraining: true,
  minHomeShifts: 10,
};

export interface RestaurantNetwork {
  id: string;
  name: string;
  description: string | null;
  settings: NetworkSettings;
  createdAt: Date;
  updatedAt: Date;
}

export enum NetworkRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
}
