import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NearbyPlaceResult, PlaceCategory } from '../../types';
import { colors, fonts, radii, spacing } from '../../theme';

const CATEGORY_ICON: Partial<Record<PlaceCategory, keyof typeof Ionicons.glyphMap>> = {
  grocery: 'cart-outline',
  pharmacy: 'medical-outline',
  hospital: 'fitness-outline',
  urgent_care: 'bandage-outline',
  gas_station: 'car-outline',
  coffee_shop: 'cafe-outline',
  restaurant: 'restaurant-outline',
  atm: 'cash-outline',
  bank: 'business-outline',
  ev_charger: 'flash-outline',
  park: 'leaf-outline',
  shopping: 'bag-outline',
  transit: 'train-outline',
  airport: 'airplane-outline',
};

type Props = {
  places: NearbyPlaceResult[];
  category: PlaceCategory;
  searchLabel: string;
};

function PlaceRow({ place }: { place: NearbyPlaceResult }) {
  const handleDirections = () => {
    const query = encodeURIComponent(place.name + ' ' + place.address);
    Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
    );
  };

  const distStr = place.distanceMetres != null
    ? place.distanceMetres >= 1000
      ? `${(place.distanceMetres / 1000).toFixed(1)} km`
      : `${Math.round(place.distanceMetres)} m`
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
        <View style={styles.rowMeta}>
          {distStr ? <Text style={styles.metaText}>{distStr}</Text> : null}
          {place.isOpen === true ? (
            <Text style={[styles.metaText, styles.openText]}>Open</Text>
          ) : place.isOpen === false ? (
            <Text style={[styles.metaText, styles.closedText]}>Closed</Text>
          ) : null}
          {place.rating != null ? (
            <Text style={styles.metaText}>★ {place.rating.toFixed(1)}</Text>
          ) : null}
        </View>
        <Text style={styles.address} numberOfLines={1}>{place.address}</Text>
      </View>
      <TouchableOpacity style={styles.directionsBtn} onPress={handleDirections} accessibilityLabel={`Get directions to ${place.name}`}>
        <Ionicons name="navigate-outline" size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

export function NearbyPlacesCard({ places, category, searchLabel }: Props) {
  const icon = CATEGORY_ICON[category] ?? 'location-outline';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name={icon} size={14} color={colors.brand} />
        </View>
        <Text style={styles.headerLabel}>{searchLabel}</Text>
      </View>

      {places.length === 0 ? (
        <Text style={styles.emptyText}>No results found nearby.</Text>
      ) : (
        places.map((p, i) => (
          <View key={p.placeId || i}>
            {i > 0 && <View style={styles.divider} />}
            <PlaceRow place={p} />
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EAF4FB',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  headerIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D6EAF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#1A5276',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowInfo: { flex: 1 },
  placeName: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#1A252F',
  },
  rowMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  metaText: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: '#5D6D7E',
  },
  openText: { color: '#1E8449' },
  closedText: { color: '#C0392B' },
  address: {
    fontFamily: fonts.bodyLight,
    fontSize: 11,
    color: '#85929E',
    marginTop: 1,
  },
  directionsBtn: {
    padding: 6,
    marginLeft: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: '#D6EAF8',
  },
  emptyText: {
    fontFamily: fonts.bodyLight,
    fontSize: 13,
    color: '#5D6D7E',
    paddingVertical: 4,
  },
});
