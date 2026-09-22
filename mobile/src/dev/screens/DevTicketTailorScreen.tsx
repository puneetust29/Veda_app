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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

type Overview = {
  box_office_name: string;
  currency: { code: string; symbol: string };
  event_series_published: number;
  event_series_draft: number;
  orders_received: number;
  revenue: number;
};

type EventSeries = {
  id: string;
  name: string;
  status: string;
  url: string;
  total_occurrences: number;
  default_ticket_types: { id: string; name: string; price: number; quantity_total: number }[];
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export default function DevTicketTailorScreen() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<EventSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testSeries, setTestSeries] = useState<EventSeries | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setError(null);
    try {
      const [ov, seriesRes] = await Promise.all([
        getJSON<Overview>('/tickettailor/overview'),
        getJSON<{ data: EventSeries[] }>('/tickettailor/event_series'),
      ]);
      setOverview(ov);
      setSeries(seriesRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  async function createTestEvent() {
    setCreating(true);
    setNote(null);
    try {
      const seriesRes = await fetch(`${API_BASE_URL}/tickettailor/event_series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VEDA APP TEST — DELETE ME' }),
      });
      if (!seriesRes.ok) throw new Error(`create event_series failed: ${seriesRes.status} ${await seriesRes.text()}`);
      const created = await seriesRes.json() as EventSeries;

      const ttRes = await fetch(`${API_BASE_URL}/tickettailor/event_series/${created.id}/ticket_types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'General Admission', price: 1000, quantity: 20 }),
      });
      if (!ttRes.ok) throw new Error(`create ticket_type failed: ${ttRes.status} ${await ttRes.text()}`);

      const refreshed = await getJSON<EventSeries>(`/tickettailor/event_series/${created.id}`);
      setTestSeries(refreshed);
      setNote(`Created "${refreshed.name}" (${refreshed.id}) with a $10 General Admission ticket type — this is real data in the connected box office.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  async function deleteTestEvent() {
    if (!testSeries) return;
    setDeleting(true);
    try {
      for (const t of testSeries.default_ticket_types) {
        await fetch(`${API_BASE_URL}/tickettailor/event_series/${testSeries.id}/ticket_types/${t.id}`, {
          method: 'DELETE',
        });
      }
      await fetch(`${API_BASE_URL}/tickettailor/event_series/${testSeries.id}`, { method: 'DELETE' });
      setNote(`Deleted "${testSeries.name}" — box office is clean again.`);
      setTestSeries(null);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => void load()}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.muted}>Connecting to Ticket Tailor…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Box Office</Text>
        <Row label="Name" value={overview.box_office_name} />
        <Row label="Currency" value={`${overview.currency.code.toUpperCase()} (${overview.currency.symbol})`} />
        <Row label="Published series" value={String(overview.event_series_published)} />
        <Row label="Draft series" value={String(overview.event_series_draft)} />
        <Row label="Orders received" value={String(overview.orders_received)} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓ CONNECTED</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Event Series ({series.length})</Text>
      {series.length === 0 ? (
        <Text style={styles.muted}>No event series in this box office yet.</Text>
      ) : (
        series.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={styles.scenarioName}>{s.name}</Text>
            <Text style={styles.scenarioId}>{s.id} · {s.status}</Text>
            {s.default_ticket_types.map((t) => (
              <Text key={t.id} style={styles.muted}>
                {t.name} — {(t.price / 100).toFixed(2)} ({t.quantity_total} available)
              </Text>
            ))}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Write-path test</Text>
      <Text style={styles.muted}>
        Ticket Tailor has no order/checkout-creation API, so there's no "book a ticket" flow to
        test here. What does work end-to-end from this screen: creating and deleting a real
        event series + ticket type in the connected box office.
      </Text>
      {note ? <Text style={styles.resultText}>{note}</Text> : null}
      <TouchableOpacity
        style={[styles.button, (creating || !!testSeries) && styles.buttonDisabled]}
        onPress={() => void createTestEvent()}
        disabled={creating || !!testSeries}
      >
        {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Create test event + ticket type</Text>}
      </TouchableOpacity>
      {testSeries ? (
        <TouchableOpacity
          style={[styles.button, styles.deleteButton, deleting && styles.buttonDisabled]}
          onPress={() => void deleteTestEvent()}
          disabled={deleting}
        >
          {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Delete test event</Text>}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
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
  deleteButton: { backgroundColor: '#b91c1c' },
  resultText: { color: colors.success ?? '#4ade80', fontSize: 13 },
  error: { color: colors.brand ?? '#00ccbc', fontSize: 14, textAlign: 'center', padding: 20 },
});
