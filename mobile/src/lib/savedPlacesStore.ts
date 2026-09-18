/**
 * SavedPlacesStore — manages the user's saved and favorite places.
 *
 * Primary storage is AsyncStorage (on-device, always available, no auth required).
 * Supabase sync is optional and best-effort — called after local write succeeds.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadToken } from './authToken';
import type { PlaceCategory, SavedPlace } from '../types';

const STORAGE_KEY = 'veda_saved_places';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

class SavedPlacesStore {
  private _cache: SavedPlace[] | null = null;

  async getAll(): Promise<SavedPlace[]> {
    if (this._cache) return this._cache;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this._cache = raw ? (JSON.parse(raw) as SavedPlace[]) : [];
    } catch {
      this._cache = [];
    }
    return this._cache!;
  }

  async getFavorites(): Promise<SavedPlace[]> {
    return (await this.getAll()).filter((p) => p.isFavorite);
  }

  async save(place: Omit<SavedPlace, 'id' | 'addedAt'>): Promise<SavedPlace> {
    const places = await this.getAll();
    const newPlace: SavedPlace = {
      ...place,
      id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      addedAt: new Date().toISOString(),
    };
    const updated = [...places, newPlace];
    await this._persist(updated);
    this._syncToBackend(newPlace).catch(() => undefined);
    return newPlace;
  }

  async remove(id: string): Promise<void> {
    const places = await this.getAll();
    const updated = places.filter((p) => p.id !== id);
    await this._persist(updated);
    this._deleteFromBackend(id).catch(() => undefined);
  }

  async toggleFavorite(id: string): Promise<void> {
    const places = await this.getAll();
    const updated = places.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p));
    await this._persist(updated);
  }

  async clear(): Promise<void> {
    this._cache = [];
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  private async _persist(places: SavedPlace[]): Promise<void> {
    this._cache = places;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  }

  private async _syncToBackend(place: SavedPlace): Promise<void> {
    try {
      const token = await loadToken();
      if (!token) return;
      await fetch(`${API_BASE_URL}/places/saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          label: place.label,
          category: place.category,
          place_id: place.placeId ?? null,
          geofence_id: place.geofenceId ?? null,
          is_favorite: place.isFavorite,
        }),
      });
    } catch (err) {
      if (__DEV__) console.warn('[SavedPlaces] backend sync failed:', err);
    }
  }

  private async _deleteFromBackend(id: string): Promise<void> {
    try {
      const token = await loadToken();
      if (!token) return;
      await fetch(`${API_BASE_URL}/places/saved/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      if (__DEV__) console.warn('[SavedPlaces] backend delete failed:', err);
    }
  }
}

export const savedPlacesStore = new SavedPlacesStore();
