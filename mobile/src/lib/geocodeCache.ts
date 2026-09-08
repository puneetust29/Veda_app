import * as Location from 'expo-location';

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MIN_REQUEST_INTERVAL_MS = 5 * 1000; // minimum gap between any two requests
const RATE_LIMIT_BACKOFF_MS = 60 * 1000; // cooldown after hitting the provider's rate limit

interface CacheEntry {
  label: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
let lastRequestTimestamp = 0;
let lastLabel = 'Current location';
let rateLimitedUntil = 0;

function getCacheKey(latitude: number, longitude: number): string {
  const precision = 4;
  return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit/i.test(message);
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

  const now = Date.now();

  // Back off entirely for a while after the provider rate-limits us.
  if (now < rateLimitedUntil) {
    return cached?.label ?? lastLabel;
  }

  // Throttle: never fire more than one request per interval, regardless of
  // how far the coordinates moved (fast location updates would otherwise
  // bypass a proximity-only check and hammer the API).
  if (now - lastRequestTimestamp < MIN_REQUEST_INTERVAL_MS) {
    return cached?.label ?? lastLabel;
  }

  try {
    lastRequestTimestamp = now;
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!places.length) return 'Current location';

    const place = places[0];
    const locality = place.city ?? place.subregion ?? place.region;
    const country = place.country;
    const label = (locality && country) ? `${locality}, ${country}` : (locality ?? country ?? 'Current location');

    cache.set(key, { label, timestamp: Date.now() });
    lastLabel = label;
    return label;
  } catch (error) {
    if (isRateLimitError(error)) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    }
    if (__DEV__) console.error('[Geocode] Reverse geocoding failed:', error);
    return cached?.label ?? lastLabel;
  }
}

export function clearGeocodeCache(): void {
  cache.clear();
}
