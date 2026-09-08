import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors } from '../../theme';
import { loadToken } from '../../lib/authToken';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

type AuthInfo = {
  ok: boolean;
  env: string;
  client_id: string;
  cached: boolean;
  expires_in_seconds: number | null;
};

type Scenario = {
  id: string;
  name: string;
  description?: string;
  api?: string;
};

type RunResult = {
  scenarioRunId?: string;
  scenario_run_id?: string;
  [key: string]: unknown;
};

export default function DevDeliverooScreen() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, RunResult>>({});

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const token = await loadToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [authRes, scenariosRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dev/deliveroo/auth`, { headers }),
        fetch(`${API_BASE_URL}/dev/deliveroo/scenarios?api=picking`, { headers }),
      ]);

      if (!authRes.ok) throw new Error(`Auth check failed: ${authRes.status}`);
      setAuth(await authRes.json() as AuthInfo);

      if (scenariosRes.ok) {
        const data = await scenariosRes.json() as { scenarios?: Scenario[] } | Scenario[];
        const list = Array.isArray(data) ? data : (data.scenarios ?? []);
        setScenarios(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  async function triggerScenario(scenarioId: string) {
    setTriggeringId(scenarioId);
    try {
      const token = await loadToken();
      const res = await fetch(`${API_BASE_URL}/dev/deliveroo/scenarios/${scenarioId}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json() as RunResult;
      setRunResults(prev => ({ ...prev, [scenarioId]: body }));
    } catch (e) {
      setRunResults(prev => ({
        ...prev,
        [scenarioId]: { error: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setTriggeringId(null);
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!auth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.muted}>Connecting to Deliveroo sandbox…</Text>
      </View>
    );
  }

  const expiresIn = auth.expires_in_seconds != null
    ? `${Math.round(auth.expires_in_seconds / 60)} min`
    : '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Auth card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection</Text>
        <Row label="Environment" value={auth.env.toUpperCase()} />
        <Row label="Client ID" value={auth.client_id} mono />
        <Row label="Token" value={auth.cached ? `cached · expires ${expiresIn}` : 'fresh'} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓ CONNECTED</Text>
        </View>
      </View>

      {/* Scenarios */}
      <Text style={styles.sectionTitle}>Sandbox Scenarios — Picking API</Text>
      {scenarios.length === 0 ? (
        <Text style={styles.muted}>No scenarios returned.</Text>
      ) : (
        scenarios.map(s => {
          const result = runResults[s.id];
          const isTriggering = triggeringId === s.id;
          const runId = result?.scenarioRunId ?? result?.scenario_run_id;
          return (
            <View key={s.id} style={styles.card}>
              <Text style={styles.scenarioName}>{s.name ?? s.id}</Text>
              {s.description ? <Text style={styles.muted}>{s.description}</Text> : null}
              <Text style={styles.scenarioId}>{s.id}</Text>
              <TouchableOpacity
                style={[styles.button, isTriggering && styles.buttonDisabled]}
                onPress={() => void triggerScenario(s.id)}
                disabled={isTriggering}
              >
                {isTriggering
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.buttonText}>Trigger</Text>}
              </TouchableOpacity>
              {result && (
                <View style={styles.result}>
                  <Text style={styles.muted}>
                    {runId ? `Run ID: ${runId}` : JSON.stringify(result, null, 2)}
                  </Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: {
    backgroundColor: colors.surface ?? '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardTitle: { color: colors.textPrimary ?? '#fff', fontWeight: '600', fontSize: 15, marginBottom: 4 },
  sectionTitle: { color: colors.textPrimary ?? '#fff', fontWeight: '600', fontSize: 14, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowLabel: { color: colors.textSecondary ?? '#8e8e93', fontSize: 13 },
  rowValue: { color: colors.textPrimary ?? '#fff', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a4a2e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  badgeText: { color: '#4ade80', fontSize: 11, fontWeight: '700' },
  scenarioName: { color: colors.textPrimary ?? '#fff', fontWeight: '600', fontSize: 14 },
  scenarioId: { color: colors.textSecondary ?? '#8e8e93', fontSize: 11, fontFamily: 'monospace' },
  muted: { color: colors.textSecondary ?? '#8e8e93', fontSize: 13 },
  button: {
    backgroundColor: colors.brand ?? '#00ccbc',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  result: {
    backgroundColor: '#0a0a0a',
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  error: { color: colors.brand ?? '#00ccbc', fontSize: 14, textAlign: 'center', padding: 20 },
});
