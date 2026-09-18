/**
 * Context rules — pure data definitions for ProximityEngine.
 *
 * Each rule describes when a recommendation fires: which place category triggers it,
 * an optional condition, a notification template, and cooldown/fire limits.
 * No business logic lives here — all evaluation is in proximityEngine.ts.
 */
import type { ContextRule } from '../types';

export const DEFAULT_CONTEXT_RULES: ContextRule[] = [
  {
    id: 'grocery_with_list',
    placeCategories: ['grocery'],
    notificationTitle: 'You\'re near {{placeName}}',
    notificationBody: 'You have items waiting on your shopping list.',
    conditionKey: 'has_shopping_list_items',
    cooldownMinutes: 120,
    maxFiresPerDay: 2,
  },
  {
    id: 'pharmacy_reminder',
    placeCategories: ['pharmacy'],
    notificationTitle: 'Pharmacy nearby',
    notificationBody: '{{placeName}} is {{distanceM}}m away.',
    conditionKey: null,
    cooldownMinutes: 240,
    maxFiresPerDay: 1,
  },
  {
    id: 'airport_proximity',
    placeCategories: ['airport'],
    notificationTitle: 'You\'re close to the airport',
    notificationBody: 'Do you have upcoming travel plans?',
    conditionKey: null,
    cooldownMinutes: 360,
    maxFiresPerDay: 1,
  },
  {
    id: 'ev_charger_low',
    placeCategories: ['ev_charger'],
    notificationTitle: 'EV charger nearby',
    notificationBody: '{{placeName}} is {{distanceM}}m away.',
    conditionKey: null,
    cooldownMinutes: 180,
    maxFiresPerDay: 1,
  },
];
