import * as Location from 'expo-location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { geofenceEventBus } from '../lib/geofenceEventBus';
import { registerGeofences, stopGeofencing } from '../lib/geofenceService';
import {
  clearAllGeofenceData,
  DEFAULT_LOCATION_SETTINGS,
  loadGeofences,
  loadLocationSettings,
  saveGeofences,
  saveLocationSettings,
} from '../lib/geofenceStorage';
import type { Geofence, GeofenceEvent, LocationSettings } from '../types';

type GeofenceContextValue = {
  geofences: Geofence[];
  settings: LocationSettings;
  latestEvent: GeofenceEvent | null;
  loading: boolean;
  addGeofence: (data: Omit<Geofence, 'id' | 'createdAt'>) => Promise<void>;
  updateGeofence: (id: string, patch: Partial<Omit<Geofence, 'id' | 'createdAt'>>) => Promise<void>;
  removeGeofence: (id: string) => Promise<void>;
  toggleGeofence: (id: string, enabled: boolean) => Promise<void>;
  updateSettings: (patch: Partial<LocationSettings>) => Promise<void>;
  removeAllData: () => Promise<void>;
};

const GeofenceContext = createContext<GeofenceContextValue | undefined>(undefined);

function generateId(): string {
  return `gf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function syncWithOS(geofences: Geofence[], settings: LocationSettings): Promise<void> {
  if (settings.geofencingEnabled && settings.backgroundLocationEnabled) {
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) {
      await registerGeofences(geofences);
      return;
    }
  }
  await stopGeofencing();
}

export function GeofenceProvider({ children }: { children: ReactNode }) {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [settings, setSettings] = useState<LocationSettings>({ ...DEFAULT_LOCATION_SETTINGS });
  const [latestEvent, setLatestEvent] = useState<GeofenceEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadGeofences(), loadLocationSettings()])
      .then(([gfs, s]) => {
        setGeofences(gfs);
        setSettings(s);
      })
      .catch((err) => {
        if (__DEV__) console.warn('[GeofenceContext] load failed:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return geofenceEventBus.subscribe((event) => setLatestEvent(event));
  }, []);

  const addGeofence = useCallback(
    async (data: Omit<Geofence, 'id' | 'createdAt'>) => {
      const newGf: Geofence = { ...data, id: generateId(), createdAt: new Date().toISOString() };
      const updated = [...geofences, newGf];
      setGeofences(updated);
      await saveGeofences(updated);
      await syncWithOS(updated, settings);
    },
    [geofences, settings],
  );

  const updateGeofence = useCallback(
    async (id: string, patch: Partial<Omit<Geofence, 'id' | 'createdAt'>>) => {
      const updated = geofences.map((g) => (g.id === id ? { ...g, ...patch } : g));
      setGeofences(updated);
      await saveGeofences(updated);
      await syncWithOS(updated, settings);
    },
    [geofences, settings],
  );

  const removeGeofence = useCallback(
    async (id: string) => {
      const updated = geofences.filter((g) => g.id !== id);
      setGeofences(updated);
      await saveGeofences(updated);
      await syncWithOS(updated, settings);
    },
    [geofences, settings],
  );

  const toggleGeofence = useCallback(
    async (id: string, enabled: boolean) => {
      await updateGeofence(id, { enabled });
    },
    [updateGeofence],
  );

  const updateSettings = useCallback(
    async (patch: Partial<LocationSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveLocationSettings(next);
      await syncWithOS(geofences, next);
    },
    [settings, geofences],
  );

  const removeAllData = useCallback(async () => {
    await stopGeofencing();
    await clearAllGeofenceData();
    setGeofences([]);
    setSettings({ ...DEFAULT_LOCATION_SETTINGS });
  }, []);

  const value = useMemo<GeofenceContextValue>(
    () => ({
      geofences,
      settings,
      latestEvent,
      loading,
      addGeofence,
      updateGeofence,
      removeGeofence,
      toggleGeofence,
      updateSettings,
      removeAllData,
    }),
    [
      geofences,
      settings,
      latestEvent,
      loading,
      addGeofence,
      updateGeofence,
      removeGeofence,
      toggleGeofence,
      updateSettings,
      removeAllData,
    ],
  );

  return <GeofenceContext.Provider value={value}>{children}</GeofenceContext.Provider>;
}

export function useGeofence(): GeofenceContextValue {
  const ctx = useContext(GeofenceContext);
  if (!ctx) throw new Error('useGeofence must be used within a GeofenceProvider');
  return ctx;
}
