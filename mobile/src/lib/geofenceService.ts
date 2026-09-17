import * as Location from 'expo-location';

import type { Geofence } from '../types';

export const GEOFENCE_TASK_NAME = 'VEDA_GEOFENCE_TASK';

export async function registerGeofences(geofences: Geofence[]): Promise<void> {
  const active = geofences.filter((g) => g.enabled);

  if (!active.length) {
    await stopGeofencing();
    return;
  }

  const regions: Location.LocationRegion[] = active.map((g) => ({
    identifier: g.id,
    latitude: g.latitude,
    longitude: g.longitude,
    radius: g.radiusMeters,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
}

export async function stopGeofencing(): Promise<void> {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false);
  if (started) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => undefined);
  }
}

export async function isGeofencingActive(): Promise<boolean> {
  return Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false);
}
