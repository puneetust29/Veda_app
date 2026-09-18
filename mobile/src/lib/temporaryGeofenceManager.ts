import type { Geofence, LocationAction } from '../types';

function generateId(): string {
  return `gf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildTemporaryGeofence(action: LocationAction): Geofence | null {
  if (action.kind !== 'create_temporary_geofence' || !action.newGeofence) return null;
  const { newGeofence } = action;
  return {
    id: generateId(),
    label: newGeofence.label,
    type: 'temporary',
    latitude: newGeofence.latitude,
    longitude: newGeofence.longitude,
    radiusMeters: newGeofence.radiusMeters,
    enabled: newGeofence.enabled,
    createdAt: new Date().toISOString(),
    temporaryMetadata: newGeofence.temporaryMetadata,
  };
}

export function isTemporaryExpired(geofence: Geofence): boolean {
  if (geofence.type !== 'temporary' || !geofence.temporaryMetadata) return false;
  return new Date(geofence.temporaryMetadata.expiresAt).getTime() < Date.now();
}

export function pruneExpiredTemporary(geofences: Geofence[]): {
  kept: Geofence[];
  removed: Geofence[];
} {
  const kept: Geofence[] = [];
  const removed: Geofence[] = [];
  for (const g of geofences) {
    if (isTemporaryExpired(g)) {
      removed.push(g);
    } else {
      kept.push(g);
    }
  }
  return { kept, removed };
}
