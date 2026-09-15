/**
 * LocationIntelligenceService — top-level service composing all location sources.
 *
 * Single entry point for:
 *   1. Building EnrichedLocationContext (for AI prompt injection)
 *   2. Searching nearby places (delegating to PlaceSearchService)
 *   3. Managing saved places (delegating to SavedPlacesStore)
 *   4. Privacy reset (clearAllLocationData)
 *
 * Never exposes raw GPS coordinates in the output context.
 */
import { loadGeofences, loadLocationSettings } from './geofenceStorage';
import { locationContextService } from './locationContext';
import { placeSearchService } from './placeSearchService';
import { savedPlacesStore } from './savedPlacesStore';
import { getCurrentPosition } from './locationService';
import type {
  EnrichedLocationContext,
  NearbyPlaceResult,
  PlaceCategory,
  SavedPlace,
} from '../types';

class LocationIntelligenceService {
  async buildEnrichedLocationContext(): Promise<EnrichedLocationContext> {
    try {
      const [ctx, settings] = await Promise.all([
        locationContextService.get(),
        loadLocationSettings(),
      ]);

      if (!settings.locationEnabled) {
        return {
          currentPlace: null,
          nearbyPlaces: [],
          savedPlaces: [],
          locationMode: 'disabled',
          locationConfidence: 'low',
          recentTransition: null,
          routineSummary: null,
          privacyMode: false,
        };
      }

      const savedPlaces = await savedPlacesStore.getAll().catch(() => [] as SavedPlace[]);

      // Current place from semantic context
      let currentPlace: EnrichedLocationContext['currentPlace'] = null;
      if (ctx.currentPlace) {
        currentPlace = {
          semanticLabel: ctx.currentPlace,
          placeCategory: _inferCategory(ctx.currentGeofenceType),
          arrivedAt: ctx.arrivedAt ?? null,
          confidence: 'high',
        };
      } else {
        // No ENTER event yet — check current GPS against saved geofences.
        // Handles "app opened while already inside a geofence" (no ENTER fires in that case).
        try {
          const [geofences, pos] = await Promise.all([
            loadGeofences(),
            getCurrentPosition().catch(() => null),
          ]);
          if (pos && geofences.length > 0) {
            const match = geofences
              .filter((g) => g.enabled && g.type !== 'temporary')
              .find((g) => _haversineMetres(pos, g) <= g.radiusMeters);
            if (match) {
              currentPlace = {
                semanticLabel: match.label,
                placeCategory: _inferCategory(match.type),
                arrivedAt: null,
                confidence: 'medium',
              };
              // Backfill the semantic cache so next message is instant
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
          // GPS check failed — fall through with null currentPlace
        }
      }

      // Recent transition
      let recentTransition: EnrichedLocationContext['recentTransition'] = null;
      if (!currentPlace && ctx.lastDepartedPlace && ctx.lastDepartedAt) {
        const mins = Math.round((Date.now() - new Date(ctx.lastDepartedAt).getTime()) / 60000);
        recentTransition = { kind: 'departed', place: ctx.lastDepartedPlace, minutesAgo: mins };
      }

      // Nearby places — only if place search is enabled and we have a position
      let nearbyPlaces: NearbyPlaceResult[] = [];
      const placeSettings = await placeSearchService.getSettings();
      if (placeSettings.placeSearchEnabled) {
        const pos = await getCurrentPosition().catch(() => null);
        if (pos) {
          // Fetch a broad mix: grocery, pharmacy, coffee — common queries
          const results = await Promise.allSettled([
            placeSearchService.searchNearby(pos, 'grocery', { maxResults: 2 }),
            placeSearchService.searchNearby(pos, 'pharmacy', { maxResults: 2 }),
            placeSearchService.searchNearby(pos, 'coffee_shop', { maxResults: 1 }),
          ]);
          for (const r of results) {
            if (r.status === 'fulfilled') nearbyPlaces.push(...r.value);
          }
          nearbyPlaces.sort((a, b) => (a.distanceMetres ?? 9999) - (b.distanceMetres ?? 9999));
          nearbyPlaces = nearbyPlaces.slice(0, 5);
        }
      }

      // Routine summary
      let routineSummary: string | null = null;
      try {
        const { routineLearner } = require('./routineLearner') as typeof import('./routineLearner');
        routineSummary = await routineLearner.buildRoutinePromptString();
      } catch {
        // not available
      }

      return {
        currentPlace,
        nearbyPlaces,
        savedPlaces,
        locationMode: 'precise',
        locationConfidence: currentPlace ? 'high' : nearbyPlaces.length > 0 ? 'medium' : 'low',
        recentTransition,
        routineSummary,
        privacyMode: false,
      };
    } catch (err) {
      if (__DEV__) console.error('[LocationIntelligence] buildEnrichedLocationContext failed:', err);
      return {
        currentPlace: null,
        nearbyPlaces: [],
        savedPlaces: [],
        locationMode: 'offline',
        locationConfidence: 'low',
        recentTransition: null,
        routineSummary: null,
        privacyMode: false,
      };
    }
  }

  async searchNearby(
    category: PlaceCategory,
    options: { openNow?: boolean; radiusMetres?: number; bypassGate?: boolean; keyword?: string } = {},
  ): Promise<NearbyPlaceResult[]> {
    const pos = await getCurrentPosition().catch(() => null);
    if (!pos) return [];
    return placeSearchService.searchNearby(pos, category, options);
  }

  async getSavedPlaces(): Promise<SavedPlace[]> {
    return savedPlacesStore.getAll();
  }

  async saveFavoritePlace(place: Omit<SavedPlace, 'id' | 'addedAt'>): Promise<SavedPlace> {
    return savedPlacesStore.save(place);
  }

  async removeFavoritePlace(id: string): Promise<void> {
    return savedPlacesStore.remove(id);
  }

  async clearAllLocationData(): Promise<void> {
    await Promise.allSettled([
      locationContextService.clear(),
      savedPlacesStore.clear(),
      (async () => {
        const { proximityEngine } = require('./proximityEngine') as typeof import('./proximityEngine');
        await proximityEngine.clearCooldowns();
      })(),
      (async () => {
        const { routineLearner } = require('./routineLearner') as typeof import('./routineLearner');
        await routineLearner.clearAllData();
      })(),
    ]);
  }

  toContextString(ctx: EnrichedLocationContext): string {
    if (ctx.locationMode === 'disabled') return 'Location tracking is disabled by the user.';

    const parts: string[] = [];
    if (ctx.currentPlace) {
      const { semanticLabel, arrivedAt } = ctx.currentPlace;
      const mins = arrivedAt
        ? Math.round((Date.now() - new Date(arrivedAt).getTime()) / 60000)
        : null;
      const arrivedStr = mins !== null ? `, arrived about ${mins} min ago` : '';
      parts.push(`User is currently at ${semanticLabel}${arrivedStr}.`);
    } else if (ctx.recentTransition) {
      const { place, minutesAgo } = ctx.recentTransition;
      parts.push(`User recently left ${place} (${minutesAgo} min ago). Not at a known location.`);
    }

    if (ctx.nearbyPlaces.length > 0) {
      const nearby = ctx.nearbyPlaces
        .slice(0, 3)
        .map((p) => {
          const dist = p.distanceMetres ? ` (${Math.round(p.distanceMetres)}m)` : '';
          const open = p.isOpen === true ? ', open' : p.isOpen === false ? ', closed' : '';
          return `${p.name}${dist}${open}`;
        })
        .join(', ');
      parts.push(`Nearby: ${nearby}.`);
    }

    if (ctx.routineSummary) parts.push(ctx.routineSummary);

    return parts.join(' ') || 'Location context unavailable.';
  }
}

function _inferCategory(geofenceType: string | null): string {
  if (geofenceType === 'home') return 'home';
  if (geofenceType === 'work') return 'work';
  return 'frequent';
}

function _haversineMetres(
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

export const locationIntelligenceService = new LocationIntelligenceService();
