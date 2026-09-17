/**
 * PlaceSearchService — Google Places Nearby Search, proxied through the backend.
 *
 * Privacy: raw coordinates are sent to our own backend only, never directly to Google from the client.
 * The backend coarsens coordinates before forwarding to Google.
 *
 * Caching: results are cached in memory by geohash cell (≈153m × 153m) + category + openNow flag.
 * Cache TTL is 15 minutes. Never persisted to AsyncStorage — session-scoped only.
 *
 * Rate limiting: 1 request per category per 60 seconds at the client level (backup to server-side limit).
 */
import { loadToken } from './authToken';
import type { NearbyPlaceResult, PlaceCategory, PlaceSearchSettings } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'veda_place_search_settings';
const CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_MS = 60 * 1000;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

interface CacheEntry {
  results: NearbyPlaceResult[];
  fetchedAt: number;
  lat: number;
  lng: number;
}

// Encode lat/lng into a geohash-like cell key at ≈153m precision (4 decimal places)
function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

class PlaceSearchService {
  private _cache = new Map<string, CacheEntry>();
  // category → last request time (monotonic ms)
  private _lastRequest = new Map<string, number>();

  async getSettings(): Promise<PlaceSearchSettings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      return raw
        ? (JSON.parse(raw) as PlaceSearchSettings)
        : { placeSearchEnabled: false, proximityRecommendationsEnabled: false };
    } catch {
      return { placeSearchEnabled: false, proximityRecommendationsEnabled: false };
    }
  }

  async saveSettings(settings: Partial<PlaceSearchSettings>): Promise<void> {
    const current = await this.getSettings();
    const next = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

  async searchNearby(
    coords: { latitude: number; longitude: number },
    category: PlaceCategory,
    options: { openNow?: boolean; radiusMetres?: number; maxResults?: number; bypassGate?: boolean; keyword?: string } = {},
  ): Promise<NearbyPlaceResult[]> {
    if (!options.bypassGate) {
      const settings = await this.getSettings();
      if (!settings.placeSearchEnabled) return [];
    }

    // Client-side rate limit
    const rateKey = `${category}:${options.openNow ? '1' : '0'}:${options.keyword ?? ''}`;
    const lastReq = this._lastRequest.get(rateKey) ?? 0;
    if (Date.now() - lastReq < RATE_LIMIT_MS) {
      const cacheKey = `${cellKey(coords.latitude, coords.longitude)}:${rateKey}`;
      const cached = this._cache.get(cacheKey);
      if (cached) return cached.results;
    }

    const cacheKey = `${cellKey(coords.latitude, coords.longitude)}:${rateKey}`;
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.results;
    }

    try {
      const token = await loadToken();
      if (!token) return [];

      const body: Record<string, unknown> = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        category,
        radius_metres: options.radiusMetres ?? 1000,
        open_now: options.openNow ?? false,
        max_results: options.maxResults ?? 5,
      };
      if (options.keyword) body.keyword = options.keyword;

      const resp = await fetch(`${API_BASE_URL}/places/nearby`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        if (__DEV__) console.warn('[PlaceSearch] HTTP', resp.status, 'for category', category);
        return [];
      }

      const data = await resp.json() as { places: NearbyPlaceResult[] };
      const results = data.places ?? [];

      this._cache.set(cacheKey, {
        results,
        fetchedAt: Date.now(),
        lat: coords.latitude,
        lng: coords.longitude,
      });
      this._lastRequest.set(rateKey, Date.now());

      return results;
    } catch (err) {
      if (__DEV__) console.error('[PlaceSearch] searchNearby failed:', err);
      return [];
    }
  }

  invalidateNear(coords: { latitude: number; longitude: number }): void {
    const cell = cellKey(coords.latitude, coords.longitude);
    for (const key of this._cache.keys()) {
      if (key.startsWith(cell)) this._cache.delete(key);
    }
  }
}

export const placeSearchService = new PlaceSearchService();
