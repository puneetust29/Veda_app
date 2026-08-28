import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { MapsResultPayload } from '../../types';
import { colors, spacing, typography } from '../../theme';
import { decodePolyline } from '../../lib/polyline';

interface Props {
  maps: MapsResultPayload;
}

function etaLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function MapsCard({ maps }: Props) {
  const hasCoords = maps.geocode_ok && maps.origin_latlng && maps.destination_latlng;

  const midLat = hasCoords
    ? (maps.origin_latlng!.lat + maps.destination_latlng!.lat) / 2
    : 51.5074;
  const midLng = hasCoords
    ? (maps.origin_latlng!.lng + maps.destination_latlng!.lng) / 2
    : -0.1278;

  const latDelta = hasCoords
    ? Math.abs(maps.origin_latlng!.lat - maps.destination_latlng!.lat) * 1.5 + 0.5
    : 8;
  const lngDelta = hasCoords
    ? Math.abs(maps.origin_latlng!.lng - maps.destination_latlng!.lng) * 1.5 + 0.5
    : 8;

  const routeCoords =
    maps.encoded_polyline ? decodePolyline(maps.encoded_polyline) : [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Route</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {maps.origin} → {maps.destination}
        </Text>
      </View>

      {hasCoords ? (
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={{
            latitude: midLat,
            longitude: midLng,
            latitudeDelta: latDelta,
            longitudeDelta: lngDelta,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Marker
            coordinate={{ latitude: maps.origin_latlng!.lat, longitude: maps.origin_latlng!.lng }}
            title={maps.origin}
            pinColor={colors.brand}
          />
          <Marker
            coordinate={{ latitude: maps.destination_latlng!.lat, longitude: maps.destination_latlng!.lng }}
            title={maps.destination}
            pinColor="#E53935"
          />
          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={colors.brand}
              strokeWidth={3}
            />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.placeholderText}>Map unavailable</Text>
        </View>
      )}

      <View style={styles.stats}>
        {maps.route_ok && maps.duration_mins != null && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{etaLabel(maps.duration_mins)}</Text>
            <Text style={styles.statLabel}>Drive time</Text>
          </View>
        )}
        {maps.route_ok && maps.distance_km != null && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{maps.distance_km} km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
        )}
        {!maps.route_ok && (
          <Text style={styles.summaryText}>{maps.summary}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subtitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  map: {
    height: 180,
    width: '100%',
  },
  mapPlaceholder: {
    height: 100,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xl,
  },
  stat: {
    alignItems: 'flex-start',
  },
  statValue: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
