/**
 * Pure analysis functions for routine learning.
 * No I/O — takes aggregated data, returns inferences.
 * All computations are on-device, privacy-safe aggregates only.
 */
import type { PlaceVisitStats, RoutineModel, CommutePattern, AnomalySignal } from '../types';

const TIME_BUCKETS = 48;

/** Convert an ISO timestamp to a 30-min bucket index (0–47). */
export function timeBucket(iso: string): number {
  const d = new Date(iso);
  return Math.floor((d.getHours() * 60 + d.getMinutes()) / 30);
}

/** ISO weekday: 0 = Monday … 6 = Sunday (JS getDay: 0=Sun, so shift). */
export function isoWeekday(iso: string): number {
  return (new Date(iso).getDay() + 6) % 7;
}

/** Empty 48-bucket array. */
export function emptyBuckets(): number[] {
  return Array(TIME_BUCKETS).fill(0);
}

/**
 * Welford's online mean/variance update.
 * Returns { newMean, newM2 } for the next observation `x` given
 * the current mean, M2, and count (BEFORE this observation).
 */
export function welfordUpdate(
  mean: number,
  m2: number,
  n: number,
  x: number,
): { newMean: number; newM2: number } {
  const newMean = mean + (x - mean) / (n + 1);
  const newM2 = m2 + (x - mean) * (x - newMean);
  return { newMean, newM2 };
}

/** Population std-dev from Welford M2 (use n-1 for sample, min n=2). */
export function stddev(m2: number, n: number): number {
  if (n < 2) return 0;
  return Math.sqrt(m2 / (n - 1));
}

/**
 * Infer which geofence is likely "home" and which is "work" from visit stats.
 *
 * Home signal: arrivals in evening (19:00–23:00) or early morning, frequent
 *   weekend presence, long dwell times.
 * Work signal: arrivals on weekday mornings (07:00–10:00), weekday-skewed,
 *   mid-range dwell (4–10h).
 */
export function inferRoutineModel(
  statsMap: Record<string, PlaceVisitStats>,
): RoutineModel {
  const candidates = Object.values(statsMap).filter((s) => s.totalVisits >= 3);

  let bestHome: { id: string; label: string; score: number } | null = null;
  let bestWork: { id: string; label: string; score: number } | null = null;

  for (const s of candidates) {
    const homeScore = computeHomeScore(s);
    const workScore = computeWorkScore(s);

    if (!bestHome || homeScore > bestHome.score) {
      bestHome = { id: s.geofenceId, label: s.geofenceLabel, score: homeScore };
    }
    if (!bestWork || workScore > bestWork.score) {
      bestWork = { id: s.geofenceId, label: s.geofenceLabel, score: workScore };
    }
  }

  // Avoid assigning the same place as both
  if (bestHome && bestWork && bestHome.id === bestWork.id) {
    // Pick the stronger signal; clear the weaker
    if (bestHome.score >= bestWork.score) bestWork = null;
    else bestHome = null;
  }

  const HOME_THRESHOLD = 8;
  const WORK_THRESHOLD = 6;

  return {
    homeGeofenceId: bestHome && bestHome.score >= HOME_THRESHOLD ? bestHome.id : null,
    homeLabel: bestHome && bestHome.score >= HOME_THRESHOLD ? bestHome.label : null,
    homeConfidence: bestHome ? Math.min(1, bestHome.score / 20) : 0,
    workGeofenceId: bestWork && bestWork.score >= WORK_THRESHOLD ? bestWork.id : null,
    workLabel: bestWork && bestWork.score >= WORK_THRESHOLD ? bestWork.label : null,
    workConfidence: bestWork ? Math.min(1, bestWork.score / 16) : 0,
    inferredAt: new Date().toISOString(),
  };
}

function computeHomeScore(s: PlaceVisitStats): number {
  let score = 0;
  // Evening arrivals (slots 38–46 = 19:00–23:00)
  score += sumBuckets(s.arrivalTimeBuckets, 38, 46) * 2;
  // Overnight arrivals (slots 0–4 = 00:00–02:00)
  score += sumBuckets(s.arrivalTimeBuckets, 0, 4);
  // Weekend presence (Sat=5, Sun=6)
  score += (s.weekdayVisits[5] + s.weekdayVisits[6]) * 1.5;
  // Long dwell (>4h)
  if (s.dwellMinutesAvg > 240) score += 3;
  return score;
}

function computeWorkScore(s: PlaceVisitStats): number {
  let score = 0;
  // Weekday morning arrivals (slots 14–20 = 07:00–10:00)
  score += sumBuckets(s.arrivalTimeBuckets, 14, 20) * 2;
  // Weekday skew
  const weekdayTotal = s.weekdayVisits.slice(0, 5).reduce((a, b) => a + b, 0);
  const weekendTotal = s.weekdayVisits[5] + s.weekdayVisits[6];
  if (weekdayTotal > weekendTotal * 2) score += 3;
  // Mid-range dwell (3–10h)
  if (s.dwellMinutesAvg >= 180 && s.dwellMinutesAvg <= 600) score += 2;
  return score;
}

function sumBuckets(buckets: number[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i <= to && i < buckets.length; i++) total += buckets[i];
  return total;
}

/**
 * Rank places by "frequent" score: total visits weighted by recency.
 * Returns places with ≥ 3 visits, sorted descending by score.
 */
export function rankFrequentPlaces(
  statsMap: Record<string, PlaceVisitStats>,
): PlaceVisitStats[] {
  const now = Date.now();
  return Object.values(statsMap)
    .filter((s) => s.totalVisits >= 3)
    .map((s) => {
      const daysSince = (now - new Date(s.lastVisitAt).getTime()) / 86400000;
      const recency = Math.exp(-daysSince / 14); // half-life 14 days
      return { s, score: s.totalVisits * recency };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ s }) => s);
}

/**
 * Check if an observed commute duration is anomalous against a known pattern.
 * Returns null if not enough data or within normal range.
 */
export function detectCommuteAnomaly(
  pattern: CommutePattern,
  actualMinutes: number,
): AnomalySignal | null {
  if (pattern.occurrences < 3) return null;

  const sd = stddev(pattern.durationMinutesM2, pattern.occurrences);
  const threshold = Math.max(10, 1.5 * sd); // at least 10 min or 1.5σ
  const deviation = actualMinutes - pattern.durationMinutesAvg;

  if (Math.abs(deviation) < threshold) return null;

  return {
    type: deviation > 0 ? 'late_commute' : 'early_arrival',
    fromLabel: pattern.fromLabel,
    toLabel: pattern.toLabel,
    deviationMinutes: Math.round(deviation),
    typicalMinutes: Math.round(pattern.durationMinutesAvg),
    detectedAt: new Date().toISOString(),
  };
}
