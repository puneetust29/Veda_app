import * as Location from 'expo-location';

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  label: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(latitude: number, longitude: number): string {
  const precision = 4;
  return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
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

  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!places.length) return 'Current location';

    const place = places[0];
    const locality = place.city ?? place.subregion ?? place.region;
    const country = place.country;
    const label = (locality && country) ? `${locality}, ${country}` : (locality ?? country ?? 'Current location');

    cache.set(key, { label, timestamp: Date.now() });
    return label;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('rate limit') || error.message.includes('too many')) {
        const fallback = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        if (__DEV__) console.warn('[Geocode] Rate limit hit, using fallback:', fallback);
        return fallback;
      }
    }
    if (__DEV__) console.error('[Geocode] Reverse geocoding failed:', error);
    return 'Current location';
  }
}

export function clearGeocodeCache(): void {
  cache.clear();
}
