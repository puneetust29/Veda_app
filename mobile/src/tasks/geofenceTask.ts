/**
 * Background geofence task. This file MUST be imported at module root (index.ts)
 * before registerRootComponent so TaskManager can wire up the callback before the
 * OS delivers any queued events.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { api } from '../lib/api';
import { geofenceEventBus } from '../lib/geofenceEventBus';
import { GEOFENCE_TASK_NAME } from '../lib/geofenceService';
import { loadGeofences } from '../lib/geofenceStorage';
import { locationContextService } from '../lib/locationContext';
import { placeSearchService } from '../lib/placeSearchService';
import { proximityEngine } from '../lib/proximityEngine';
import { routineLearner } from '../lib/routineLearner';
import { workflowEngine } from '../lib/workflowEngine';
import type { GeofenceEvent } from '../types';

// Show alerts when a notification arrives while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) {
    if (__DEV__) console.error('[GeofenceTask]', error);
    return;
  }

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  const isEnter = eventType === Location.GeofencingEventType.Enter;

  const geofences = await loadGeofences();
  const geofence = geofences.find((g) => g.id === region.identifier);
  if (!geofence) return;

  const geofenceEvent: GeofenceEvent = {
    type: isEnter ? 'GEOFENCE_ENTER' : 'GEOFENCE_EXIT',
    geofenceId: geofence.id,
    geofenceLabel: geofence.label,
    geofenceType: geofence.type,
    timestamp: new Date().toISOString(),
    latitude: region.latitude,
    longitude: region.longitude,
  };

  // Publish to any in-process subscribers (e.g. GeofenceContext)
  geofenceEventBus.publish(geofenceEvent);

  // Capture context BEFORE the update so routine learner can see prior state
  // (e.g. arrivedAt before an EXIT, lastDepartedPlace before an ENTER)
  const prevContext = await locationContextService.get();

  // Update semantic location context (no GPS history — only named place transitions)
  await locationContextService.updateFromEvent(geofenceEvent).catch((err: unknown) => {
    if (__DEV__) console.warn('[GeofenceTask] locationContext update failed:', err);
  });

  // Run routine learner — updates dwell stats, commute patterns, predictions
  const learnerResult = await routineLearner.onGeofenceEvent(geofenceEvent, prevContext).catch(
    (err: unknown) => {
      if (__DEV__) console.warn('[GeofenceTask] routine learner failed:', err);
      return null;
    },
  );

  // Run extensible workflow engine (arrival/departure triggers)
  await workflowEngine.evaluate(geofenceEvent).catch((err: unknown) => {
    if (__DEV__) console.warn('[GeofenceTask] workflow evaluate failed:', err);
  });

  // Surface anomaly as an additional notification if detected
  if (learnerResult?.anomaly) {
    const { anomaly } = learnerResult;
    await Notifications.scheduleNotificationAsync({
      content: {
        title:
          anomaly.type === 'late_commute'
            ? 'Commute running late'
            : 'Earlier than usual',
        body: anomaly.type === 'late_commute'
          ? `Your trip to ${anomaly.toLabel} is taking ${Math.abs(anomaly.deviationMinutes)} min longer than usual.`
          : `You arrived at ${anomaly.toLabel} ${Math.abs(anomaly.deviationMinutes)} min earlier than usual.`,
      },
      trigger: null,
    }).catch(() => undefined);
  }

  // Surface arrival prediction as a notification
  if (learnerResult?.prediction && geofenceEvent.type === 'GEOFENCE_EXIT') {
    const { prediction } = learnerResult;
    if (prediction.confidence >= 0.4) {
      const eta = new Date(prediction.predictedArrivalAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Heading to ${prediction.toLabel}?`,
          body: `Expected arrival around ${eta} (~${prediction.typicalDurationMinutes} min).`,
        },
        trigger: null,
      }).catch(() => undefined);
    }
  }

  // Local notification so the user knows what fired
  await Notifications.scheduleNotificationAsync({
    content: {
      title: isEnter ? `Arrived at ${geofence.label}` : `Left ${geofence.label}`,
      body: `Veda noticed you ${isEnter ? 'entered' : 'exited'} this area.`,
      data: geofenceEvent as unknown as Record<string, unknown>,
    },
    trigger: null,
  }).catch((err) => {
    if (__DEV__) console.warn('[GeofenceTask] notification failed:', err);
  });

  // Proximity engine: check nearby places for context-aware recommendations (ENTER only).
  // Deferred and best-effort — must not block geofence registration budget.
  if (isEnter) {
    setImmediate(async () => {
      try {
        const placeSettings = await placeSearchService.getSettings();
        if (placeSettings.placeSearchEnabled && placeSettings.proximityRecommendationsEnabled) {
          const { getCurrentPosition } = require('../lib/locationService') as typeof import('../lib/locationService');
          const pos = await getCurrentPosition().catch(() => null);
          if (pos) {
            const nearby = await placeSearchService.searchNearby(pos, 'grocery', { maxResults: 3 })
              .catch(() => []);
            await proximityEngine.evaluate(nearby).catch(() => undefined);
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[GeofenceTask] proximity engine failed:', err);
      }
    });
  }

  // Best-effort: report event to backend (skip temporary geofences — backend rejects that type)
  if (geofence.type !== 'temporary') {
    await api.reportGeofenceEvent(geofenceEvent).catch((err: unknown) => {
      if (__DEV__) console.warn('[GeofenceTask] backend report failed:', err);
    });
  }
});
