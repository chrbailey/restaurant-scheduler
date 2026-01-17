/**
 * Distance Utility Functions
 *
 * Provides geographic distance calculations for cross-restaurant scheduling.
 * Uses the Haversine formula for accurate distance between coordinates.
 */

/**
 * Earth's radius in miles (used for Haversine formula)
 */
const EARTH_RADIUS_MILES = 3959;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the distance between two geographic points using the Haversine formula
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in miles
 *
 * @example
 * ```ts
 * const distance = calculateDistance(40.7128, -74.006, 40.758, -73.9855);
 * console.log(distance); // ~3.5 miles (Times Square to Lower Manhattan)
 * ```
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Configuration for commute time estimation
 */
export interface CommuteConfig {
  /** Base commute time in minutes (walking to car, parking, etc.) */
  baseMinutes: number;
  /** Average speed in miles per hour for driving */
  averageSpeedMph: number;
  /** Traffic factor multiplier (1.0 = no traffic, 1.5 = moderate, 2.0 = heavy) */
  trafficFactor: number;
}

/**
 * Default commute configuration (moderate urban traffic)
 */
export const DEFAULT_COMMUTE_CONFIG: CommuteConfig = {
  baseMinutes: 15, // Time to leave one job, walk to car, park at next, etc.
  averageSpeedMph: 25, // Urban driving speed
  trafficFactor: 1.3, // Moderate traffic assumption
};

/**
 * Estimate commute time between two locations
 *
 * This provides a simple estimate based on distance and average driving speed.
 * For production use, consider integrating with a maps API (Google Maps, MapBox)
 * for real-time traffic-aware estimates.
 *
 * @param distanceMiles - Distance between locations in miles
 * @param config - Optional commute configuration
 * @returns Estimated commute time in minutes
 *
 * @example
 * ```ts
 * const distance = calculateDistance(lat1, lon1, lat2, lon2);
 * const commuteTime = estimateCommuteTime(distance);
 * console.log(`Estimated commute: ${commuteTime} minutes`);
 * ```
 */
export function estimateCommuteTime(
  distanceMiles: number,
  config: CommuteConfig = DEFAULT_COMMUTE_CONFIG,
): number {
  if (distanceMiles <= 0) {
    return 0;
  }

  // Calculate driving time (distance / speed * 60 for minutes)
  const drivingTimeMinutes = (distanceMiles / config.averageSpeedMph) * 60;

  // Apply traffic factor
  const adjustedDrivingTime = drivingTimeMinutes * config.trafficFactor;

  // Add base time (parking, walking, etc.)
  const totalTime = config.baseMinutes + adjustedDrivingTime;

  // Round up to nearest minute
  return Math.ceil(totalTime);
}

/**
 * Check if a worker can reasonably commute between two shifts
 *
 * @param shift1End - End time of first shift
 * @param shift2Start - Start time of second shift
 * @param distanceMiles - Distance between shift locations
 * @param config - Optional commute configuration
 * @returns Object indicating if commute is possible and details
 */
export function canCommuteBetweenShifts(
  shift1End: Date,
  shift2Start: Date,
  distanceMiles: number,
  config: CommuteConfig = DEFAULT_COMMUTE_CONFIG,
): {
  canCommute: boolean;
  estimatedCommuteMinutes: number;
  availableMinutes: number;
  bufferMinutes: number;
} {
  const estimatedCommuteMinutes = estimateCommuteTime(distanceMiles, config);
  const availableMinutes = (shift2Start.getTime() - shift1End.getTime()) / (1000 * 60);
  const bufferMinutes = availableMinutes - estimatedCommuteMinutes;

  // Consider commute possible if there's at least 10 minutes buffer
  const MIN_BUFFER_MINUTES = 10;

  return {
    canCommute: bufferMinutes >= MIN_BUFFER_MINUTES,
    estimatedCommuteMinutes,
    availableMinutes: Math.floor(availableMinutes),
    bufferMinutes: Math.floor(bufferMinutes),
  };
}

/**
 * Calculate the bounding box for a given center point and radius
 * Useful for database queries to pre-filter by approximate location
 *
 * @param lat - Center latitude
 * @param lon - Center longitude
 * @param radiusMiles - Search radius in miles
 * @returns Bounding box coordinates
 */
export function getBoundingBox(
  lat: number,
  lon: number,
  radiusMiles: number,
): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  // Approximate degrees per mile at this latitude
  const latDegrees = radiusMiles / 69.0; // ~69 miles per degree latitude
  const lonDegrees = radiusMiles / (69.0 * Math.cos(toRadians(lat)));

  return {
    minLat: lat - latDegrees,
    maxLat: lat + latDegrees,
    minLon: lon - lonDegrees,
    maxLon: lon + lonDegrees,
  };
}
