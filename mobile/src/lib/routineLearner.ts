/**
 * RoutineLearner — on-device behavioral pattern engine.
 *
 * Privacy guarantees:
 * - Stores only aggregated statistics (visit counts, time-of-day histograms,
 *   Welford mean/variance). Never stores individual event timestamps.
 * - 30-day rolling window: stats for places not visited in 30 days are pruned.
 * - No raw GPS is ever read or stored here — only named geofence transitions.
 * - All computation is on-device. Backend receives nothing from this module.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  detectCommuteAnomaly,
  emptyBuckets,
  inferRoutineModel,
  isoWeekday,
  timeBucket,
  welfordUpdate,
} from './patternAnalyzer';
import type {
  AnomalySignal,
  ArrivalPrediction,
  CommutePattern,
  GeofenceEvent,
  PlaceVisitStats,
  ProactiveSuggestion,
  RoutineModel,
  SemanticLocationContext,
} from '../types';

const STATS_KEY = 'veda_place_visit_stats';
const PATTERNS_KEY = 'veda_commute_patterns';
const ROUTINE_KEY = 'veda_routine_model';
const PREDICTIONS_KEY = 'veda_arrival_predictions';
const SUGGESTIONS_KEY = 'veda_active_suggestions';

const PRUNE_DAYS = 30;
const MIN_DWELL_MINUTES = 2;      // ignore fly-by visits
const MAX_COMMUTE_HOURS = 4;      // transitions > 4h apart are not commutes
const PREDICTION_TTL_HOURS = 2;
const SUGGESTION_TTL_HOURS = 4;

type LearnerResult = {
  anomaly: AnomalySignal | null;
  prediction: ArrivalPrediction | null;
  suggestions: ProactiveSuggestion[];
};

class RoutineLearner {
  /**
   * Main entry point — call once per geofence event AFTER locationContextService
   * has been updated, passing the context state from BEFORE the update so dwell
   * times and departure origins are still accessible.
   */
  async onGeofenceEvent(
    event: GeofenceEvent,
    prevContext: SemanticLocationContext,
  ): Promise<LearnerResult> {
    if (event.type === 'GEOFENCE_EXIT') {
      await this._onExit(event, prevContext);
      const prediction = await this._makePrediction(event);
      return { anomaly: null, prediction, suggestions: [] };
    } else {
      return this._onEnter(event, prevContext);
    }
  }

  // ─── EXIT: record dwell, update stats, prune stale data ─────────────────────

  private async _onExit(
    event: GeofenceEvent,
    prevContext: SemanticLocationContext,
  ): Promise<void> {
    if (!prevContext.arrivedAt) return;

    const dwellMins =
      (new Date(event.timestamp).getTime() - new Date(prevContext.arrivedAt).getTime()) / 60000;
    if (dwellMins < MIN_DWELL_MINUTES) return;

    const stats = await this._loadStats();
    const existing = stats[event.geofenceId];

    const arrSlot = timeBucket(prevContext.arrivedAt);
    const depSlot = timeBucket(event.timestamp);
    const day = isoWeekday(prevContext.arrivedAt);

    if (existing) {
      const n = existing.dwellCount;
      const { newMean, newM2 } = welfordUpdate(
        existing.dwellMinutesAvg,
        existing.dwellMinutesM2,
        n,
        dwellMins,
      );
      const arrivals = [...existing.arrivalTimeBuckets];
      const departures = [...existing.departureTimeBuckets];
      arrivals[arrSlot] = (arrivals[arrSlot] ?? 0) + 1;
      departures[depSlot] = (departures[depSlot] ?? 0) + 1;
      const weekdayVisits = [...existing.weekdayVisits] as PlaceVisitStats['weekdayVisits'];
      weekdayVisits[day] += 1;

      stats[event.geofenceId] = {
        ...existing,
        totalVisits: existing.totalVisits + 1,
        weekdayVisits,
        arrivalTimeBuckets: arrivals,
        departureTimeBuckets: departures,
        dwellMinutesAvg: newMean,
        dwellMinutesM2: newM2,
        dwellCount: n + 1,
        lastVisitAt: event.timestamp,
      };
    } else {
      const arrivals = emptyBuckets();
      const departures = emptyBuckets();
      arrivals[arrSlot] = 1;
      departures[depSlot] = 1;
      const weekdayVisits: PlaceVisitStats['weekdayVisits'] = [0, 0, 0, 0, 0, 0, 0];
      weekdayVisits[day] = 1;

      stats[event.geofenceId] = {
        geofenceId: event.geofenceId,
        geofenceLabel: event.geofenceLabel,
        geofenceType: event.geofenceType,
        totalVisits: 1,
        weekdayVisits,
        arrivalTimeBuckets: arrivals,
        departureTimeBuckets: departures,
        dwellMinutesAvg: dwellMins,
        dwellMinutesM2: 0,
        dwellCount: 1,
        lastVisitAt: event.timestamp,
        firstSeenAt: event.timestamp,
      };
    }

    // Prune stale entries
    const cutoff = Date.now() - PRUNE_DAYS * 86400000;
    for (const id of Object.keys(stats)) {
      if (new Date(stats[id].lastVisitAt).getTime() < cutoff) {
        delete stats[id];
      }
    }

    await this._saveStats(stats);
    await this._refreshRoutineModel(stats);
  }

  // ─── ENTER: detect commute completion, anomaly, generate suggestions ─────────

  private async _onEnter(
    event: GeofenceEvent,
    prevContext: SemanticLocationContext,
  ): Promise<LearnerResult> {
    let anomaly: AnomalySignal | null = null;
    let prediction: ArrivalPrediction | null = null;

    // Detect commute: did we depart a known place recently?
    if (prevContext.lastDepartedAt && prevContext.lastDepartedPlace) {
      const transitMins =
        (new Date(event.timestamp).getTime() -
          new Date(prevContext.lastDepartedAt).getTime()) /
        60000;

      if (transitMins >= MIN_DWELL_MINUTES && transitMins <= MAX_COMMUTE_HOURS * 60) {
        const stats = await this._loadStats();
        const fromId = this._findIdByLabel(stats, prevContext.lastDepartedPlace);
        if (fromId) {
          anomaly = await this._recordCommute(
            fromId,
            prevContext.lastDepartedPlace,
            event,
            transitMins,
            prevContext.lastDepartedAt,
          );
        }
      }
    }

    // Resolve any pending arrival prediction for this destination
    prediction = await this._resolvePrediction(event.geofenceId, event.timestamp);

    // Generate proactive suggestions
    const suggestions = await this._generateSuggestions(event, anomaly, prediction);

    return { anomaly, prediction, suggestions };
  }

  // ─── Commute tracking ────────────────────────────────────────────────────────

  private async _recordCommute(
    fromId: string,
    fromLabel: string,
    event: GeofenceEvent,
    durationMins: number,
    departedAt: string,
  ): Promise<AnomalySignal | null> {
    const patterns = await this._loadPatterns();
    const id = `${fromId}::${event.geofenceId}`;
    const day = isoWeekday(departedAt);
    const depBucket = timeBucket(departedAt);

    const idx = patterns.findIndex((p) => p.id === id);
    let anomaly: AnomalySignal | null = null;

    if (idx >= 0) {
      const p = patterns[idx];

      // Detect anomaly before updating stats
      anomaly = detectCommuteAnomaly(p, durationMins);

      // Welford update
      const n = p.occurrences;
      const { newMean, newM2 } = welfordUpdate(
        p.durationMinutesAvg,
        p.durationMinutesM2,
        n,
        durationMins,
      );

      patterns[idx] = {
        ...p,
        occurrences: n + 1,
        durationMinutesAvg: newMean,
        durationMinutesM2: newM2,
        confidence: Math.min(1, (n + 1) / 10),
        weekdays: Array.from(new Set([...p.weekdays, day])),
        lastObservedAt: event.timestamp,
      };
    } else {
      patterns.push({
        id,
        fromGeofenceId: fromId,
        fromLabel,
        toGeofenceId: event.geofenceId,
        toLabel: event.geofenceLabel,
        weekdays: [day],
        departureBucket: depBucket,
        durationMinutesAvg: durationMins,
        durationMinutesM2: 0,
        occurrences: 1,
        confidence: 0.1,
        lastObservedAt: event.timestamp,
      });
    }

    await AsyncStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns));
    return anomaly;
  }

  // ─── Arrival prediction (on EXIT) ────────────────────────────────────────────

  private async _makePrediction(exitEvent: GeofenceEvent): Promise<ArrivalPrediction | null> {
    const patterns = await this._loadPatterns();
    const now = new Date(exitEvent.timestamp);
    const day = isoWeekday(exitEvent.timestamp);
    const depBucket = timeBucket(exitEvent.timestamp);

    // Find a pattern departing from this place on this weekday at similar time
    const match = patterns
      .filter(
        (p) =>
          p.fromGeofenceId === exitEvent.geofenceId &&
          p.confidence >= 0.3 &&
          p.weekdays.includes(day) &&
          Math.abs(p.departureBucket - depBucket) <= 4, // ±2h window
      )
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (!match) return null;

    const predictedMs = now.getTime() + match.durationMinutesAvg * 60000;
    const expiresMs = now.getTime() + PREDICTION_TTL_HOURS * 3600000;

    const prediction: ArrivalPrediction = {
      id: `pred_${Date.now()}`,
      fromGeofenceId: exitEvent.geofenceId,
      fromLabel: exitEvent.geofenceLabel,
      toGeofenceId: match.toGeofenceId,
      toLabel: match.toLabel,
      predictedArrivalAt: new Date(predictedMs).toISOString(),
      typicalDurationMinutes: Math.round(match.durationMinutesAvg),
      confidence: match.confidence,
      departedAt: exitEvent.timestamp,
      expiresAt: new Date(expiresMs).toISOString(),
    };

    // Store (replace any stale ones for the same destination)
    const existing = await this._loadPredictions();
    const pruned = existing.filter(
      (p) =>
        p.toGeofenceId !== match.toGeofenceId &&
        new Date(p.expiresAt).getTime() > Date.now(),
    );
    await AsyncStorage.setItem(
      PREDICTIONS_KEY,
      JSON.stringify([...pruned, prediction]),
    );

    return prediction;
  }

  private async _resolvePrediction(
    arrivedAtId: string,
    arrivedAt: string,
  ): Promise<ArrivalPrediction | null> {
    const all = await this._loadPredictions();
    const match = all.find((p) => p.toGeofenceId === arrivedAtId);
    if (!match) return null;

    // Remove it — it's been consumed
    const remaining = all.filter((p) => p.id !== match.id);
    await AsyncStorage.setItem(PREDICTIONS_KEY, JSON.stringify(remaining));
    return match;
  }

  // ─── Proactive suggestions ────────────────────────────────────────────────────

  private async _generateSuggestions(
    event: GeofenceEvent,
    anomaly: AnomalySignal | null,
    prediction: ArrivalPrediction | null,
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];
    const expires = new Date(
      Date.now() + SUGGESTION_TTL_HOURS * 3600000,
    ).toISOString();

    if (anomaly) {
      if (anomaly.type === 'late_commute') {
        suggestions.push({
          id: `sug_${Date.now()}_late`,
          kind: 'late_commute',
          message: `Your commute to ${anomaly.toLabel} is taking ${Math.abs(anomaly.deviationMinutes)} min longer than usual.`,
          expiresAt: expires,
        });
      } else if (anomaly.type === 'early_arrival') {
        suggestions.push({
          id: `sug_${Date.now()}_early`,
          kind: 'early_arrival',
          message: `You arrived at ${anomaly.toLabel} ${Math.abs(anomaly.deviationMinutes)} min earlier than usual.`,
          expiresAt: expires,
        });
      }
    }

    // Check if this is a routine arrival worth noting
    const stats = await this._loadStats();
    const routine = await this._loadRoutineModel();
    if (
      routine.homeGeofenceId === event.geofenceId &&
      routine.homeConfidence > 0.6
    ) {
      suggestions.push({
        id: `sug_${Date.now()}_home`,
        kind: 'heading_home',
        message: "You're back home. Is there anything you need a reminder about?",
        expiresAt: expires,
        geofenceId: event.geofenceId,
      });
    }

    // Infer home/work and surface labeling suggestions
    if (routine.homeConfidence > 0.8 && !routine.homeGeofenceId) {
      const topPlace = Object.values(stats).sort(
        (a, b) => b.totalVisits - a.totalVisits,
      )[0];
      if (topPlace?.geofenceType === 'custom' && topPlace.totalVisits >= 5) {
        suggestions.push({
          id: `sug_${Date.now()}_home_inf`,
          kind: 'home_place_inferred',
          message: `It looks like "${topPlace.geofenceLabel}" might be your home. Want me to label it?`,
          expiresAt: expires,
          geofenceId: topPlace.geofenceId,
        });
      }
    }

    // Persist active suggestions (deduplicate by kind)
    if (suggestions.length > 0) {
      const existing = await this._loadSuggestions();
      const now = Date.now();
      const pruned = existing.filter(
        (s) =>
          new Date(s.expiresAt).getTime() > now &&
          !suggestions.some((n) => n.kind === s.kind),
      );
      await AsyncStorage.setItem(
        SUGGESTIONS_KEY,
        JSON.stringify([...pruned, ...suggestions]),
      );
    }

    return suggestions;
  }

  // ─── Routine model ────────────────────────────────────────────────────────────

  private async _refreshRoutineModel(
    stats: Record<string, PlaceVisitStats>,
  ): Promise<void> {
    const total = Object.values(stats).reduce((s, p) => s + p.totalVisits, 0);
    if (total < 5) return; // not enough data yet
    const model = inferRoutineModel(stats);
    await AsyncStorage.setItem(ROUTINE_KEY, JSON.stringify(model));
  }

  // ─── Public read API ─────────────────────────────────────────────────────────

  async getStats(): Promise<Record<string, PlaceVisitStats>> {
    return this._loadStats();
  }

  async getPatterns(): Promise<CommutePattern[]> {
    return this._loadPatterns();
  }

  async getRoutineModel(): Promise<RoutineModel> {
    return this._loadRoutineModel();
  }

  async getPredictions(): Promise<ArrivalPrediction[]> {
    const all = await this._loadPredictions();
    const now = Date.now();
    return all.filter((p) => new Date(p.expiresAt).getTime() > now);
  }

  async getActiveSuggestions(): Promise<ProactiveSuggestion[]> {
    return this._loadSuggestions();
  }

  /** Build a concise plain-text summary for AI prompt injection. */
  async buildRoutinePromptString(): Promise<string | null> {
    const model = await this._loadRoutineModel();
    const predictions = await this.getPredictions();
    const patterns = await this._loadPatterns();
    const highConf = patterns.filter((p) => p.confidence >= 0.4);

    const parts: string[] = [];

    if (model.homeLabel) {
      parts.push(`User's home: ${model.homeLabel} (confidence ${Math.round(model.homeConfidence * 100)}%)`);
    }
    if (model.workLabel) {
      parts.push(`User's work: ${model.workLabel} (confidence ${Math.round(model.workConfidence * 100)}%)`);
    }
    if (highConf.length > 0) {
      const routes = highConf
        .map((p) => `${p.fromLabel} → ${p.toLabel} (~${Math.round(p.durationMinutesAvg)} min)`)
        .join('; ');
      parts.push(`Known commute routes: ${routes}`);
    }
    if (predictions.length > 0) {
      const pred = predictions[0];
      const eta = new Date(pred.predictedArrivalAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      parts.push(`Predicted next arrival: ${pred.toLabel} around ${eta}`);
    }

    return parts.length > 0 ? parts.join('. ') : null;
  }

  /** Clear all learned data (user-initiated privacy reset). */
  async clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([
      STATS_KEY,
      PATTERNS_KEY,
      ROUTINE_KEY,
      PREDICTIONS_KEY,
      SUGGESTIONS_KEY,
    ]);
  }

  // ─── Private storage helpers ─────────────────────────────────────────────────

  private async _loadStats(): Promise<Record<string, PlaceVisitStats>> {
    try {
      const raw = await AsyncStorage.getItem(STATS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private async _saveStats(stats: Record<string, PlaceVisitStats>): Promise<void> {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  private async _loadPatterns(): Promise<CommutePattern[]> {
    try {
      const raw = await AsyncStorage.getItem(PATTERNS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async _loadRoutineModel(): Promise<RoutineModel> {
    try {
      const raw = await AsyncStorage.getItem(ROUTINE_KEY);
      return raw
        ? JSON.parse(raw)
        : {
            homeGeofenceId: null,
            homeLabel: null,
            homeConfidence: 0,
            workGeofenceId: null,
            workLabel: null,
            workConfidence: 0,
            inferredAt: new Date().toISOString(),
          };
    } catch {
      return {
        homeGeofenceId: null,
        homeLabel: null,
        homeConfidence: 0,
        workGeofenceId: null,
        workLabel: null,
        workConfidence: 0,
        inferredAt: new Date().toISOString(),
      };
    }
  }

  private async _loadPredictions(): Promise<ArrivalPrediction[]> {
    try {
      const raw = await AsyncStorage.getItem(PREDICTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async _loadSuggestions(): Promise<ProactiveSuggestion[]> {
    try {
      const raw = await AsyncStorage.getItem(SUGGESTIONS_KEY);
      if (!raw) return [];
      const all: ProactiveSuggestion[] = JSON.parse(raw);
      const now = Date.now();
      return all.filter((s) => new Date(s.expiresAt).getTime() > now);
    } catch {
      return [];
    }
  }

  private _findIdByLabel(
    stats: Record<string, PlaceVisitStats>,
    label: string,
  ): string | null {
    const entry = Object.values(stats).find((s) => s.geofenceLabel === label);
    return entry?.geofenceId ?? null;
  }
}

export const routineLearner = new RoutineLearner();
