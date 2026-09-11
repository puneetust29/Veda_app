import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Geofence, LocationSettings } from '../types';

const GEOFENCES_KEY = 'veda_geofences';
const LOCATION_SETTINGS_KEY = 'veda_location_settings';

export const DEFAULT_LOCATION_SETTINGS: LocationSettings = {
  locationEnabled: false,
  backgroundLocationEnabled: false,
  geofencingEnabled: false,
};

export async function loadGeofences(): Promise<Geofence[]> {
  const raw = await AsyncStorage.getItem(GEOFENCES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Geofence[];
  } catch {
    return [];
  }
}

export async function saveGeofences(geofences: Geofence[]): Promise<void> {
  await AsyncStorage.setItem(GEOFENCES_KEY, JSON.stringify(geofences));
}

export async function loadLocationSettings(): Promise<LocationSettings> {
  const raw = await AsyncStorage.getItem(LOCATION_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_LOCATION_SETTINGS };
  try {
    return { ...DEFAULT_LOCATION_SETTINGS, ...(JSON.parse(raw) as Partial<LocationSettings>) };
  } catch {
    return { ...DEFAULT_LOCATION_SETTINGS };
  }
}

export async function saveLocationSettings(settings: LocationSettings): Promise<void> {
  await AsyncStorage.setItem(LOCATION_SETTINGS_KEY, JSON.stringify(settings));
}

export async function clearAllGeofenceData(): Promise<void> {
  await AsyncStorage.multiRemove([GEOFENCES_KEY, LOCATION_SETTINGS_KEY]);
}
