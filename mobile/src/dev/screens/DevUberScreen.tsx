import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import RecommendationCard from '../../components/chat/RecommendationCard';
import { colors } from '../../theme';
import { loadToken } from '../../lib/authToken';
import type { RecommendationCardPayload } from '../../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function DevUberScreen() {
  const [card, setCard] = useState<RecommendationCardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        const params = new URLSearchParams({ destination: 'London Heathrow Airport' });
        const res = await fetch(`${API_BASE_URL}/dev/uber/deeplink?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        const raw = await res.json() as {
          destination: string;
          dropoff_latlng: { lat: number; lng: number };
          uber_app_url: string;
          deep_link_url: string;
        };

        const payload: RecommendationCardPayload = {
          kind: 'uber_ride',
          origin_type: 'current_location',
          reasoning: 'Dev catalog test — ride to Heathrow Airport.',
          suggested_message: '',
          pickup_label: 'Current Location',
          dropoff_label: raw.destination,
          uber_app_url: raw.uber_app_url,
          deep_link_url: raw.deep_link_url,
          airport_options: [],
          alternative_options: [],
          drive_mins_to_airport: null,
        };
        setCard(payload);
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

  if (!card) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.loading}>Building Uber deeplink…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <RecommendationCard card={card} />
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
