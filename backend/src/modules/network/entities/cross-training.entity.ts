/**
 * Cross-Training Entity
 *
 * Represents a worker's certification to work at another restaurant
 * within the network. Required before a worker can claim shifts
 * at restaurants other than their primary employer.
 */
export interface CrossTraining {
  id: string;
  workerProfileId: string;
  targetRestaurantId: string;
  positions: string[];
  certifiedAt: Date | null;
  certifiedBy: string | null;
  status: CrossTrainingStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export enum CrossTrainingStatus {
  /** Request submitted, awaiting review */
  PENDING = 'PENDING',
  /** Cross-training approved, worker can claim shifts */
  APPROVED = 'APPROVED',
  /** Cross-training revoked, worker cannot claim shifts */
  REVOKED = 'REVOKED',
  /** Request was rejected */
  REJECTED = 'REJECTED',
  /** Cross-training expired (if time-limited) */
  EXPIRED = 'EXPIRED',
}

/**
 * Cross-training request with worker and restaurant details
 */
export interface CrossTrainingWithDetails extends CrossTraining {
  workerProfile: {
    id: string;
    userId: string;
    restaurantId: string;
    positions: string[];
    reliabilityScore: number;
    shiftsCompleted: number;
    user: {
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    };
    restaurant: {
      id: string;
      name: string;
    };
  };
  targetRestaurant: {
    id: string;
    name: string;
  };
  certifier?: {
    firstName: string;
    lastName: string;
  };
}
