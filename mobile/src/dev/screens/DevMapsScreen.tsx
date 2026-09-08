import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import MapsCard from '../../components/common/MapsCard';
import { colors } from '../../theme';
import { loadToken } from '../../lib/authToken';
import type { MapsResultPayload, NearbyPlace } from '../../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const CATEGORY_ICONS: Record<string, string> = {
  hotel: '🏨',
  restaurant: '🍽️',
  attraction: '🏛️',
};

const CATEGORY_LABELS: Record<string, string> = {
  hotel: 'Hotels',
  restaurant: 'Restaurants',
  attraction: 'Attractions',
};

function bookingUrl(place: NearbyPlace): string {
  const name = encodeURIComponent(place.name);
  if (place.category === 'restaurant') {
    return `https://www.opentable.com/s/?term=${name}`;
  }
  if (place.category === 'hotel') {
    return `https://www.booking.com/search.html?ss=${name}`;
  }
  // attraction
  return `https://maps.google.com/?q=${name}`;
}

function bookingLabel(category: string): string {
  if (category === 'restaurant') return 'Reserve';
  if (category === 'hotel') return 'Book';
  return 'Explore';
}

function PlaceBookingRow({ place }: { place: NearbyPlace }) {
  return (
    <View style={styles.placeRow}>
      <Text style={styles.placeIcon}>{CATEGORY_ICONS[place.category] ?? '📍'}</Text>
      <View style={styles.placeInfo}>
        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
        {place.address ? (
          <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
        ) : null}
        {place.rating != null ? (
          <Text style={styles.placeRating}>⭐ {place.rating.toFixed(1)}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.bookBtn}
        onPress={() => Linking.openURL(bookingUrl(place))}
      >
        <Text style={styles.bookBtnText}>{bookingLabel(place.category)}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DevMapsScreen() {
  const [data, setData] = useState<MapsResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        const params = new URLSearchParams({
          origin: 'London Heathrow Airport',
          destination: 'London Bridge, London',
        });
        const res = await fetch(`${API_BASE_URL}/dev/maps/route?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        const payload = (await res.json()) as MapsResultPayload;
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
        <Text style={styles.loading}>Fetching route…</Text>
      </View>
    );
  }

  const byCategory = (['hotel', 'restaurant', 'attraction'] as const).map((cat) => ({
    cat,
    places: (data.nearby_places ?? []).filter((p) => p.category === cat),
  })).filter((g) => g.places.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <MapsCard maps={data} />

      {byCategory.length > 0 && (
        <View style={styles.bookingSection}>
          <Text style={styles.bookingTitle}>Nearby & Book</Text>
          {byCategory.map(({ cat, places }) => (
            <View key={cat} style={styles.categoryGroup}>
              <Text style={styles.categoryLabel}>{CATEGORY_LABELS[cat]}</Text>
              {places.map((place, i) => (
                <PlaceBookingRow key={i} place={place} />
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { color: colors.textSecondary, fontSize: 14 },
  error: { color: colors.brand, fontSize: 14, textAlign: 'center', padding: 20 },

  bookingSection: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  categoryGroup: {
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  placeIcon: { fontSize: 20 },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  placeAddress: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  placeRating: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  bookBtn: {
    backgroundColor: colors.brand,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bookBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
