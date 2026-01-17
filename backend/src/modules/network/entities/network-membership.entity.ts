/**
 * Network Membership Entity
 *
 * Links a restaurant to a network with a specific role and status.
 * Supports hierarchical network management (OWNER, ADMIN, MEMBER).
 */
export interface NetworkMembership {
  id: string;
  networkId: string;
  restaurantId: string;
  role: MembershipRole;
  joinedAt: Date;
  status: MembershipStatus;
  invitedById: string | null;
  respondedAt: Date | null;
}

export enum MembershipRole {
  /** Full control over network settings and membership */
  OWNER = 'OWNER',
  /** Can invite/remove members, cannot delete network */
  ADMIN = 'ADMIN',
  /** Standard member, can only manage own restaurant's participation */
  MEMBER = 'MEMBER',
}

export enum MembershipStatus {
  /** Full active membership */
  ACTIVE = 'ACTIVE',
  /** Invitation sent, awaiting response */
  PENDING = 'PENDING',
  /** Temporarily suspended from network activities */
  SUSPENDED = 'SUSPENDED',
}

export const MEMBERSHIP_ROLE_HIERARCHY: Record<MembershipRole, number> = {
  [MembershipRole.OWNER]: 3,
  [MembershipRole.ADMIN]: 2,
  [MembershipRole.MEMBER]: 1,
};

/**
 * Check if a role can perform actions on another role
 */
export function canManageRole(actorRole: MembershipRole, targetRole: MembershipRole): boolean {
  return MEMBERSHIP_ROLE_HIERARCHY[actorRole] > MEMBERSHIP_ROLE_HIERARCHY[targetRole];
}
