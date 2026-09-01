import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import TransportStatusCard from '../../components/common/TransportStatusCard';
import { colors } from '../../theme';
import { loadToken } from '../../lib/authToken';
import type { TransportResultPayload } from '../../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function DevTransportScreen() {
  const [data, setData] = useState<TransportResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        const res = await fetch(`${API_BASE_URL}/dev/transport/status?airport=heathrow`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        const raw = await res.json() as {
          line_statuses: Array<{ line: string; status: string; severity: number }>;
          journey: {
            airport: string;
            duration_mins: number;
            legs: Array<{ mode: string; instruction: string; duration_mins: number }>;
          } | null;
        };

        const payload: TransportResultPayload = {
          has_london: true,
          direction: 'from_london',
          airport: raw.journey?.airport ?? 'Heathrow Airport',
          line_statuses: raw.line_statuses.map((ls) => ({
            line_name: ls.line,
            status: ls.status,
            severity: ls.severity,
            disruption: null,
          })),
          journey_options: raw.journey
            ? [{
                duration_mins: raw.journey.duration_mins,
                legs: raw.journey.legs.map((l) => ({
                  mode: l.mode,
                  instruction: l.instruction,
                  duration_mins: l.duration_mins,
                })),
              }]
            : [],
          summary: `Live TfL status${raw.journey ? ` · Heathrow → central London: ${raw.journey.duration_mins} min` : ''}`,
        };
        setData(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.loading}>Fetching TfL status…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TransportStatusCard transport={data} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.brand, fontSize: 14, textAlign: 'center', padding: 20 },
});
