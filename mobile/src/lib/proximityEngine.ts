/**
 * ProximityEngine — evaluates context rules against nearby places.
 *
 * Does NOT require a geofence crossing. Works from the current GPS + nearby search results.
 * Results are surfaced as local notifications. Cooldowns are persisted to AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { DEFAULT_CONTEXT_RULES } from './contextRules';
import type { ContextRule, NearbyPlaceResult, PlaceSearchSettings } from '../types';

const COOLDOWNS_KEY = 'veda_proximity_cooldowns';

class ProximityEngine {
  private _cooldowns: Record<string, number> = {};
  private _loaded = false;

  async evaluate(
    nearbyPlaces: NearbyPlaceResult[],
    userContext: { hasShoppingListItems?: boolean } = {},
  ): Promise<void> {
    await this._loadCooldowns();

    const settings = await this._getSettings();
    if (!settings.proximityRecommendationsEnabled) return;

    const now = Date.now();
    const fired: string[] = [];

    for (const rule of DEFAULT_CONTEXT_RULES) {
      const match = nearbyPlaces.find((p) =>
        rule.placeCategories.includes(p.category as any),
      );
      if (!match) continue;

      if (!this._passesCondition(rule, userContext)) continue;

      const lastFired = this._cooldowns[rule.id] ?? 0;
      if (now - lastFired < rule.cooldownMinutes * 60 * 1000) continue;

      const title = rule.notificationTitle
        .replace('{{placeName}}', match.name)
        .replace('{{distanceM}}', String(Math.round(match.distanceMetres ?? 0)));
      const body = rule.notificationBody
        .replace('{{placeName}}', match.name)
        .replace('{{distanceM}}', String(Math.round(match.distanceMetres ?? 0)));

      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      }).catch(() => undefined);

      fired.push(rule.id);
    }

    if (fired.length > 0) {
      for (const id of fired) this._cooldowns[id] = now;
      await this._persistCooldowns();
    }
  }

  async clearCooldowns(): Promise<void> {
    this._cooldowns = {};
    await AsyncStorage.removeItem(COOLDOWNS_KEY);
  }

  private _passesCondition(rule: ContextRule, ctx: { hasShoppingListItems?: boolean }): boolean {
    if (!rule.conditionKey) return true;
    if (rule.conditionKey === 'has_shopping_list_items') return !!ctx.hasShoppingListItems;
    return true;
  }

  private async _loadCooldowns(): Promise<void> {
    if (this._loaded) return;
    try {
      const raw = await AsyncStorage.getItem(COOLDOWNS_KEY);
      this._cooldowns = raw ? JSON.parse(raw) : {};
    } catch {
      this._cooldowns = {};
    }
    this._loaded = true;
  }

  private async _persistCooldowns(): Promise<void> {
    try {
      await AsyncStorage.setItem(COOLDOWNS_KEY, JSON.stringify(this._cooldowns));
    } catch {
      // best-effort
    }
  }

  private async _getSettings(): Promise<PlaceSearchSettings> {
    try {
      const { placeSearchService } = require('./placeSearchService') as typeof import('./placeSearchService');
      return placeSearchService.getSettings();
    } catch {
      return { placeSearchEnabled: false, proximityRecommendationsEnabled: false };
    }
  }
}

export const proximityEngine = new ProximityEngine();
