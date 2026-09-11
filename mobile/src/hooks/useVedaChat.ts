import { useCallback, useRef, useState } from 'react';

import { applyStreamEvent, nextId } from '../lib/chatThread';
import { api } from '../lib/api';
import { buildFullLocationContext } from '../lib/locationContext';
import { locationIntelligenceService } from '../lib/locationIntelligenceService';
import { useGeofence } from '../context/GeofenceContext';
import type { AgentStreamEvent, ChatItem, EnrichedLocationContext, LocationAction, PlaceCategory } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'complete' | 'failed';

const WATCHDOG_MS = 90_000;

const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  grocery: 'grocery stores',
  pharmacy: 'pharmacies',
  hospital: 'hospitals',
  urgent_care: 'urgent care centers',
  gas_station: 'gas stations',
  coffee_shop: 'coffee shops',
  restaurant: 'restaurants',
  atm: 'ATMs',
  bank: 'banks',
  ev_charger: 'EV chargers',
  park: 'parks',
  shopping: 'shopping',
  transit: 'transit stops',
  airport: 'airports',
  home: 'home',
  work: 'work',
  frequent: 'frequent places',
  unknown: 'places',
};

function greetingText(): string {
  return "Hi, I'm Veda — ask me about your travel plans, nearby places, or the Veda app.";
}

function formatGeofenceList(geofences: { label: string; type: string; enabled: boolean }[]): string {
  const active = geofences.filter((g) => g.enabled);
  if (active.length === 0) return 'No saved locations yet.';
  return active.map((g) => `• ${g.label} (${g.type})`).join('\n');
}

export function useVedaChat() {
  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: greetingText() },
  ]);
  const [phase, setPhase] = useState<ChatPhase>('idle');

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const abortControllerRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { geofences, updateSettings, removeGeofence } = useGeofence();
  const geofencesRef = useRef(geofences);
  geofencesRef.current = geofences;

  const commitItems = useCallback((next: ChatItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const appendItems = useCallback(
    (newItems: ChatItem[]) => {
      commitItems([...itemsRef.current, ...newItems]);
    },
    [commitItems],
  );

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const pushErrorItem = useCallback(
    (message: string, retryable: boolean) => {
      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'error', message, retryable }]);
    },
    [appendItems],
  );

  const resetWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      abortControllerRef.current?.abort();
      pushErrorItem('This is taking longer than expected — the connection timed out.', true);
      setPhase('failed');
    }, WATCHDOG_MS);
  }, [clearWatchdog, pushErrorItem]);

  const executeLocationAction = useCallback(
    (action: LocationAction) => {
      void (async () => {
        try {
          switch (action.kind) {
            case 'disable_tracking':
              await updateSettings({ locationEnabled: false, backgroundLocationEnabled: false, geofencingEnabled: false });
              break;
            case 'pause_geofencing':
              await updateSettings({ geofencingEnabled: false });
              break;
            case 'resume_geofencing':
              await updateSettings({ geofencingEnabled: true });
              break;
            case 'delete_location':
              if (action.geofenceId) await removeGeofence(action.geofenceId);
              break;
            case 'list_locations': {
              const result = formatGeofenceList(geofencesRef.current);
              const current = itemsRef.current;
              let patched = false;
              const updated = [...current].reverse().map((item) => {
                if (!patched && item.kind === 'location_action') {
                  patched = true;
                  return { ...item, result } as ChatItem;
                }
                return item;
              }).reverse();
              commitItems(updated);
              break;
            }
            case 'search_nearby_places': {
              const category = (action.category ?? 'grocery') as PlaceCategory;
              const label = CATEGORY_LABELS[category] ?? category;
              const radiusMetres = action.radiusMiles
                ? Math.min(Math.round(action.radiusMiles * 1609.34), 50000)
                : 8000;
              try {
                const places = await locationIntelligenceService.searchNearby(category, {
                  openNow: action.openNow ?? false,
                  radiusMetres,
                  bypassGate: true,
                  keyword: action.keyword ?? undefined,
                });
                const titleName = action.keyword ?? label;
                const radiusStr = action.radiusMiles ? ` within ${action.radiusMiles} mi` : '';
                appendItems([{
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'nearby_places',
                  places,
                  category,
                  searchLabel: places.length > 0
                    ? `${titleName}${radiusStr}`
                    : `No ${titleName} found${radiusStr}`,
                }]);
              } catch {
                appendItems([{
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'nearby_places',
                  places: [],
                  category,
                  searchLabel: `Couldn't search for ${label} right now`,
                }]);
              }
              break;
            }
            case 'save_favorite_place': {
              if (action.placeLabel && action.category) {
                await locationIntelligenceService.saveFavoritePlace({
                  label: action.placeLabel,
                  category: action.category as PlaceCategory,
                  placeId: action.placeId ?? null,
                  geofenceId: null,
                  isFavorite: true,
                });
              }
              break;
            }
            case 'remove_favorite_place': {
              if (action.placeId) {
                await locationIntelligenceService.removeFavoritePlace(action.placeId);
              }
              break;
            }
            case 'request_navigation': {
              // Navigation intent — open external maps app
              const { Linking } = require('react-native');
              if (action.placeLabel) {
                const query = encodeURIComponent(action.placeLabel);
                await Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() => undefined);
              }
              break;
            }
            default:
              break;
          }
        } catch (err) {
          if (__DEV__) console.error('[useVedaChat] executeLocationAction failed:', err);
        }
      })();
    },
    [updateSettings, removeGeofence, commitItems, appendItems],
  );

  const handleStreamEvent = useCallback(
    (event_: AgentStreamEvent) => {
      resetWatchdog();
      const next = applyStreamEvent(itemsRef.current, event_);
      commitItems(next);

      switch (event_.type) {
        case 'location_action':
          executeLocationAction(event_.data);
          break;
        case 'error':
          setPhase('failed');
          break;
        case 'done':
          setPhase('complete');
          break;
        default:
          break;
      }
    },
    [commitItems, resetWatchdog, executeLocationAction],
  );

  const handleStreamError = useCallback(
    (err: unknown) => {
      clearWatchdog();
      pushErrorItem(err instanceof Error ? err.message : String(err), true);
      setPhase('failed');
    },
    [clearWatchdog, pushErrorItem],
  );

  const startStream = useCallback(
    (controller: AbortController, message: string) => {
      setPhase('streaming');
      resetWatchdog();

      // Extract recent text history for context (last 4 turns)
      const history = itemsRef.current
        .filter((item) => item.kind === 'text')
        .slice(-4)
        .map((item) => ({
          role: (item as any).role,
          text: (item as any).text,
        }));

      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'status', label: 'Thinking…', state: 'active' }]);

      void (async () => {
        let locationContext: string | null = null;
        let enrichedLocationContext: EnrichedLocationContext | null = null;
        try {
          enrichedLocationContext = await locationIntelligenceService.buildEnrichedLocationContext();
          locationContext = locationIntelligenceService.toContextString(enrichedLocationContext);
          if (__DEV__) console.log('[useVedaChat] enriched context built, mode:', enrichedLocationContext.locationMode);
        } catch (err) {
          if (__DEV__) console.error('[useVedaChat] buildEnrichedLocationContext failed, falling back:', err);
          try {
            locationContext = await buildFullLocationContext();
          } catch {
            // both failed — proceed without context
          }
        }

        if (controller.signal.aborted) return;

      if (__DEV__) {
        console.log('[useVedaChat] Starting stream:', { message, historyLen: history.length });
      }

        try {
          await api.streamVedaConversation({
            message,
            history,
            locationContext,
            enrichedLocationContext,
            signal: controller.signal,
            onEvent: (event) => {
              if (__DEV__) console.log('[useVedaChat] Event:', event.type);
              handleStreamEvent(event);
            },
            onError: (err) => {
              if (__DEV__) console.error('[useVedaChat] Stream error:', err);
              if (controller.signal.aborted) return;
              handleStreamError(err);
            },
            onClose: () => {
              if (__DEV__) console.log('[useVedaChat] Stream closed');
              clearWatchdog();
            },
          });
        } catch (err: unknown) {
          if (__DEV__) console.error('[useVedaChat] api error:', err);
          if (controller.signal.aborted) return;
          handleStreamError(err);
        }
      })();
    },
    [clearWatchdog, handleStreamError, handleStreamEvent, resetWatchdog, appendItems],
  );


  const sendMessage = useCallback(
    (text: string) => {
      if (phase === 'streaming' || !text.trim()) return;

      // Append user message to items
      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text }]);

      // Start stream with the message
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      startStream(controller, text);
    },
    [phase, appendItems, startStream],
  );

  const retry = useCallback(() => {
    // Find the last user message and retry with it
    const lastUserMsg = [...itemsRef.current]
      .reverse()
      .find((item) => item.kind === 'text' && (item as any).role === 'user');

    if (!lastUserMsg || (lastUserMsg as any).role !== 'user') return;

    // Clear error items and retry
    const withoutError = itemsRef.current.filter((item) => item.kind !== 'error');
    commitItems(withoutError);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    startStream(controller, (lastUserMsg as any).text);
  }, [commitItems, startStream]);

  return { items, phase, sendMessage, retry };
}
