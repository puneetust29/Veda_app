import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { MapsResultPayload, NearbyPlace, RouteOption } from '../../types';
import { colors, spacing } from '../../theme';
import { decodePolyline } from '../../lib/polyline';

interface Props {
  maps: MapsResultPayload;
}

type TravelMode = 'DRIVE' | 'TRANSIT' | 'WALK';

const MODE_LABELS: Record<TravelMode, string> = { DRIVE: '🚗 Drive', TRANSIT: '🚌 Transit', WALK: '🚶 Walk' };
const CATEGORY_ICONS: Record<string, string> = { hotel: '🏨', restaurant: '🍽️', attraction: '🏛️' };

function etaLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function openInGoogleMaps(origin: string, destination: string, mode: TravelMode) {
  const modeParam = mode === 'DRIVE' ? 'driving' : mode === 'TRANSIT' ? 'transit' : 'walking';
  const base = Platform.OS === 'ios'
    ? `comgooglemaps://?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&directionsmode=${modeParam}`
    : `https://maps.google.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=${mode === 'DRIVE' ? 'd' : mode === 'TRANSIT' ? 'r' : 'w'}`;
  Linking.openURL(base).catch(() => {
    Linking.openURL(
      `https://maps.google.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}`
    );
  });
}


function PlaceRow({ place }: { place: NearbyPlace }) {
  return (
    <View style={styles.placeRow}>
      <Text style={styles.placeIcon}>{CATEGORY_ICONS[place.category] ?? '📍'}</Text>
      <View style={styles.placeInfo}>
        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
        {place.address ? <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text> : null}
      </View>
      {place.rating != null && (
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐ {place.rating.toFixed(1)}</Text>
        </View>
      )}
    </View>
  );
}

export default function MapsCard({ maps }: Props) {
  const [activeMode, setActiveMode] = useState<TravelMode>('DRIVE');
  const [tapToExplore, setTapToExplore] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [placesExpanded, setPlacesExpanded] = useState(false);

  const hasCoords = maps.geocode_ok && maps.origin_latlng && maps.destination_latlng;

  const midLat = hasCoords
    ? (maps.origin_latlng!.lat + maps.destination_latlng!.lat) / 2
    : 51.5074;
  const midLng = hasCoords
    ? (maps.origin_latlng!.lng + maps.destination_latlng!.lng) / 2
    : -0.1278;
  const latDelta = hasCoords
    ? Math.abs(maps.origin_latlng!.lat - maps.destination_latlng!.lat) * 1.6 + 0.4
    : 8;
  const lngDelta = hasCoords
    ? Math.abs(maps.origin_latlng!.lng - maps.destination_latlng!.lng) * 1.6 + 0.4
    : 8;

  // Find the active route from the routes array, fall back to legacy fields
  const availableModes = maps.routes?.map((r) => r.mode as TravelMode) ?? [];
  const activeRoute: RouteOption | undefined = maps.routes?.find((r) => r.mode === activeMode);
  const displayPolyline = activeRoute?.encoded_polyline ?? maps.encoded_polyline;
  const decodedCoords = displayPolyline ? decodePolyline(displayPolyline) : [];
  // Fall back to a straight line between origin and destination when no polyline
  const routeCoords =
    decodedCoords.length > 1
      ? decodedCoords
      : hasCoords
      ? [
          { latitude: maps.origin_latlng!.lat, longitude: maps.origin_latlng!.lng },
          { latitude: maps.destination_latlng!.lat, longitude: maps.destination_latlng!.lng },
        ]
      : [];
  const displayDuration = activeRoute?.duration_mins ?? maps.duration_mins;
  const displayDistance = activeRoute?.distance_km ?? maps.distance_km;

  // Group nearby places by category
  const hotels = maps.nearby_places?.filter((p) => p.category === 'hotel') ?? [];
  const restaurants = maps.nearby_places?.filter((p) => p.category === 'restaurant') ?? [];
  const attractions = maps.nearby_places?.filter((p) => p.category === 'attraction') ?? [];
  const hasPlaces = maps.nearby_places?.length > 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>🗺️</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.provider}>Google Maps</Text>
          <Text style={styles.routeTitle} numberOfLines={1}>
            {maps.origin} → {maps.destination}
          </Text>
        </View>
      </View>

      {/* Route points */}
      <View style={styles.routeRow}>
        <View style={styles.routePoints}>
          <View style={styles.routePoint}>
            <View style={[styles.dot, styles.dotOrigin]} />
            <Text style={styles.routePointText} numberOfLines={1}>{maps.origin}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.dot, styles.dotDest]} />
            <Text style={styles.routePointText} numberOfLines={1}>{maps.destination}</Text>
          </View>
        </View>
      </View>

      {/* Travel mode toggle */}
      {availableModes.length > 0 && (
        <View style={styles.modeRow}>
          {(['DRIVE', 'TRANSIT', 'WALK'] as TravelMode[]).map((mode) => {
            const available = availableModes.includes(mode);
            const active = activeMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.modeChip, active && styles.modeChipActive, !available && styles.modeChipDisabled]}
                onPress={() => available && setActiveMode(mode)}
                disabled={!available}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                  {MODE_LABELS[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Map controls */}
      <View style={styles.mapControls}>
        <TouchableOpacity
          style={[styles.controlChip, tapToExplore && styles.controlChipActive]}
          onPress={() => setTapToExplore(!tapToExplore)}
          activeOpacity={0.7}
        >
          <Text style={[styles.controlChipText, tapToExplore && styles.controlChipTextActive]}>
            {tapToExplore ? '🔓 Exploring' : '🔍 Explore'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlChip, showTraffic && styles.controlChipActive]}
          onPress={() => setShowTraffic(!showTraffic)}
          activeOpacity={0.7}
        >
          <Text style={[styles.controlChipText, showTraffic && styles.controlChipTextActive]}>
            {showTraffic ? '🟢 Traffic On' : '🚦 Traffic'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      {hasCoords ? (
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={{ latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta }}
          scrollEnabled={tapToExplore}
          zoomEnabled={tapToExplore}
          pitchEnabled={tapToExplore}
          rotateEnabled={tapToExplore}
          showsTraffic={showTraffic}
        >
          <Marker
            coordinate={{ latitude: maps.origin_latlng!.lat, longitude: maps.origin_latlng!.lng }}
            title={maps.origin}
            pinColor={colors.success}
          />
          <Marker
            coordinate={{ latitude: maps.destination_latlng!.lat, longitude: maps.destination_latlng!.lng }}
            title={maps.destination}
            pinColor={colors.brand}
          />
          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={colors.brand}
              strokeWidth={decodedCoords.length > 1 ? 3 : 2}
              lineDashPattern={decodedCoords.length > 1 ? undefined : [8, 6]}
            />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.placeholderText}>Map unavailable</Text>
        </View>
      )}

      {/* Stats */}
      {(displayDuration != null || displayDistance != null) && (
        <View style={styles.stats}>
          {displayDuration != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{etaLabel(displayDuration)}</Text>
              <Text style={styles.statLabel}>{activeMode === 'DRIVE' ? 'Drive time' : activeMode === 'TRANSIT' ? 'Transit time' : 'Walk time'}</Text>
            </View>
          )}
          {displayDuration != null && displayDistance != null && (
            <View style={styles.statDivider} />
          )}
          {displayDistance != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{displayDistance} km</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
          )}
        </View>
      )}

      {!maps.route_ok && maps.summary ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{maps.summary}</Text>
        </View>
      ) : null}

      {/* Nearby Places */}
      {hasPlaces && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setPlacesExpanded(!placesExpanded)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>📍 Nearby Places</Text>
            <Text style={styles.chevron}>{placesExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {placesExpanded && (
            <View style={styles.placesBody}>
              {hotels.length > 0 && (
                <>
                  <Text style={styles.placeCategoryLabel}>Hotels</Text>
                  {hotels.map((p, i) => <PlaceRow key={i} place={p} />)}
                </>
              )}
              {restaurants.length > 0 && (
                <>
                  <Text style={styles.placeCategoryLabel}>Restaurants</Text>
                  {restaurants.map((p, i) => <PlaceRow key={i} place={p} />)}
                </>
              )}
              {attractions.length > 0 && (
                <>
                  <Text style={styles.placeCategoryLabel}>Attractions</Text>
                  {attractions.map((p, i) => <PlaceRow key={i} place={p} />)}
                </>
              )}
            </View>
          )}
        </>
      )}

      {/* Divider + CTA */}
      <View style={styles.divider} />
      <TouchableOpacity
        style={styles.cta}
        onPress={() => openInGoogleMaps(maps.origin, maps.destination, activeMode)}
        activeOpacity={0.7}
      >
        <Text style={styles.ctaText}>Open in Google Maps</Text>
        <Text style={styles.ctaArrow}>→</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeIcon: { fontSize: 20 },
  headerText: { flex: 1 },
  provider: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  routeRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  routePoints: { gap: 4 },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  dotOrigin: { backgroundColor: colors.success },
  dotDest: { backgroundColor: colors.brand },
  routePointText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  routeLine: {
    width: 2,
    height: 12,
    backgroundColor: colors.border,
    marginLeft: 4,
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 6,
    alignItems: 'center',
  },
  modeChipActive: {
    borderColor: colors.brand,
    backgroundColor: '#FFF0F0',
  },
  modeChipDisabled: { opacity: 0.4 },
  modeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  modeChipTextActive: {
    color: colors.brand,
    fontWeight: '700',
  },
  mapControls: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  controlChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  controlChipActive: {
    borderColor: colors.brand,
    backgroundColor: '#FFF0F0',
  },
  controlChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  controlChipTextActive: {
    color: colors.brand,
    fontWeight: '700',
  },
  map: { height: 200, width: '100%' },
  mapPlaceholder: {
    height: 120,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontSize: 13, color: colors.textSecondary },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  stat: { alignItems: 'flex-start' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  summaryRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  summaryText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  chevron: { fontSize: 11, color: colors.textMuted },
  placesBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 4,
  },
  placeCategoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  placeIcon: { fontSize: 18, flexShrink: 0 },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  placeAddress: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  ratingBadge: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ctaText: { fontSize: 14, fontWeight: '600', color: colors.brand },
  ctaArrow: { fontSize: 16, color: colors.brand, fontWeight: '600' },
});
