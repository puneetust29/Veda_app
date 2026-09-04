import * as Location from 'expo-location';

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MIN_REQUEST_INTERVAL_MS = 5 * 1000; // 5 seconds between requests for same area
const LOCATION_PROXIMITY_THRESHOLD = 0.001; // ~111 meters

interface CacheEntry {
  label: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
let lastRequestCoords: { latitude: number; longitude: number; timestamp: number } | null = null;

function getCacheKey(latitude: number, longitude: number): string {
  const precision = 4;
  return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
}

function isNearLastRequest(latitude: number, longitude: number): boolean {
  if (!lastRequestCoords) return false;
  const timeSinceLastRequest = Date.now() - lastRequestCoords.timestamp;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const latDiff = Math.abs(latitude - lastRequestCoords.latitude);
    const lngDiff = Math.abs(longitude - lastRequestCoords.longitude);
    return latDiff < LOCATION_PROXIMITY_THRESHOLD && lngDiff < LOCATION_PROXIMITY_THRESHOLD;
  }
  return false;
}

export async function getCachedReverseGeocode(
  latitude: number,
  longitude: number
): Promise<string> {
  const key = getCacheKey(latitude, longitude);
  const cached = cache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.label;
  }

  // Throttle: avoid repeated requests for the same location within 5 seconds
  if (isNearLastRequest(latitude, longitude)) {
    return cached?.label ?? 'Current location';
  }

  try {
    lastRequestCoords = { latitude, longitude, timestamp: Date.now() };
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!places.length) return 'Current location';

    const place = places[0];
    const locality = place.city ?? place.subregion ?? place.region;
    const country = place.country;
    const label = (locality && country) ? `${locality}, ${country}` : (locality ?? country ?? 'Current location');

    cache.set(key, { label, timestamp: Date.now() });
    return label;
  } catch (error) {
    if (__DEV__) console.error('[Geocode] Reverse geocoding failed:', error);
    return 'Current location';
  }
}

export function clearGeocodeCache(): void {
  cache.clear();
}
