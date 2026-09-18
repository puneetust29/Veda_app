import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadGeofences, loadLocationSettings } from './geofenceStorage';
import { getCurrentPosition } from './locationService';
import type { GeofenceEvent, SemanticLocationContext } from '../types';

const STORAGE_KEY = 'veda_location_context';

const EMPTY_CONTEXT: SemanticLocationContext = {
  currentPlace: null,
  currentGeofenceId: null,
  currentGeofenceType: null,
  arrivedAt: null,
  lastDepartedPlace: null,
  lastDepartedAt: null,
  updatedAt: new Date().toISOString(),
};

class LocationContextService {
  private _cache: SemanticLocationContext | null = null;

  async load(): Promise<SemanticLocationContext> {
    if (this._cache) return this._cache;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this._cache = raw ? (JSON.parse(raw) as SemanticLocationContext) : { ...EMPTY_CONTEXT };
    } catch {
      this._cache = { ...EMPTY_CONTEXT };
    }
    return this._cache!;
  }

  async updateFromEvent(event: GeofenceEvent): Promise<void> {
    const current = await this.load();
    const now = event.timestamp;

    let next: SemanticLocationContext;
    if (event.type === 'GEOFENCE_ENTER') {
      next = {
        ...current,
        currentPlace: event.geofenceLabel,
        currentGeofenceId: event.geofenceId,
        currentGeofenceType: event.geofenceType,
        arrivedAt: now,
        updatedAt: now,
      };
    } else {
      next = {
        ...current,
        currentPlace: null,
        currentGeofenceId: null,
        currentGeofenceType: null,
        arrivedAt: null,
        lastDepartedPlace: event.geofenceLabel,
        lastDepartedAt: now,
        updatedAt: now,
      };
    }

    this._cache = next;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async get(): Promise<SemanticLocationContext> {
    return this.load();
  }

  async clear(): Promise<void> {
    this._cache = { ...EMPTY_CONTEXT, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
  }

  toPromptString(ctx: SemanticLocationContext): string | null {
    if (ctx.currentPlace) {
      const mins = ctx.arrivedAt
        ? Math.round((Date.now() - new Date(ctx.arrivedAt).getTime()) / 60000)
        : null;
      const arrivedStr = mins !== null ? `, arrived about ${mins} min ago` : '';
      return `User is currently at ${ctx.currentPlace}${arrivedStr}.`;
    }
    if (ctx.lastDepartedPlace && ctx.lastDepartedAt) {
      const mins = Math.round((Date.now() - new Date(ctx.lastDepartedAt).getTime()) / 60000);
      return `User recently left ${ctx.lastDepartedPlace} (${mins} min ago). Not currently at a known location.`;
    }
    return null;
  }
}

export const locationContextService = new LocationContextService();

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinA = Math.sin(dLat / 2);
  const sinB = Math.sin(dLon / 2);
  const h = sinA * sinA + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinB * sinB;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── Full location context for AI prompt injection ────────────────────────────

/**
 * Build the full location + routine context string for AI prompt injection.
 * Uses static imports — no dynamic import() calls.
 * Always returns a non-empty string, never throws.
 */
export async function buildFullLocationContext(): Promise<string> {
  try {
    const [ctx, settings] = await Promise.all([
      locationContextService.get(),
      loadLocationSettings(),
    ]);

    if (!settings.locationEnabled) {
      return 'Location tracking is disabled by the user.';
    }

    const parts: string[] = [];

    // 1. Cached current place (set by most recent ENTER event)
    if (ctx.currentPlace) {
      const mins = ctx.arrivedAt
        ? Math.round((Date.now() - new Date(ctx.arrivedAt).getTime()) / 60000)
        : null;
      const arrivedStr = mins !== null ? `, arrived about ${mins} min ago` : '';
      parts.push(`User is currently at ${ctx.currentPlace}${arrivedStr}.`);
    } else {
      // 2. No cached place — check current GPS against stored geofences.
      //    Handles "app opened while inside a geofence" (no ENTER fires in that case).
      let resolvedLabel: string | null = null;
      try {
        const [geofences, pos] = await Promise.all([
          loadGeofences(),
          getCurrentPosition(),
        ]);
        if (pos && geofences.length > 0) {
          const match = geofences
            .filter((g) => g.enabled && g.type !== 'temporary')
            .find((g) => haversineMetres(pos, g) <= g.radiusMeters);
          if (match) {
            resolvedLabel = match.label;
            // Backfill the cache so the next message is instant
            locationContextService.updateFromEvent({
              type: 'GEOFENCE_ENTER',
              geofenceId: match.id,
              geofenceLabel: match.label,
              geofenceType: match.type,
              timestamp: new Date().toISOString(),
              latitude: pos.latitude,
              longitude: pos.longitude,
            }).catch(() => undefined);
          }
        }
      } catch {
        // GPS check failed — fall through to other context
      }

      if (resolvedLabel) {
        parts.push(`User is currently at ${resolvedLabel} (detected from GPS).`);
      } else if (ctx.lastDepartedPlace && ctx.lastDepartedAt) {
        const mins = Math.round(
          (Date.now() - new Date(ctx.lastDepartedAt).getTime()) / 60000,
        );
        parts.push(
          `User recently left ${ctx.lastDepartedPlace} (${mins} min ago). Not currently within a saved location.`,
        );
      } else {
        // 3. Location enabled but no place info available
        const geofences = await loadGeofences().catch(() => []);
        const savedCount = geofences.filter((g) => g.enabled).length;
        if (savedCount === 0) {
          parts.push(
            'Location tracking is enabled. No saved locations (home, work, custom) have been set up yet — ' +
              'the user can add them in the Location & Geofences screen.',
          );
        } else {
          parts.push(
            `Location tracking is enabled. User is not currently within any of their ${savedCount} saved location(s).`,
          );
        }
      }
    }

    // 4. Append routine signals if available (lazy import to avoid circular dep)
    try {
      const { routineLearner } = require('./routineLearner') as typeof import('./routineLearner');
      const routineStr = await routineLearner.buildRoutinePromptString();
      if (routineStr) parts.push(routineStr);
    } catch {
      // Routine data not yet available — skip
    }

    const result = parts.join(' ');
    if (__DEV__) console.log('[locationContext] buildFullLocationContext:', result);
    return result;
  } catch (err) {
    if (__DEV__) console.error('[locationContext] buildFullLocationContext failed:', err);
    return 'Location context unavailable.';
  }
}
