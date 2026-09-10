import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { savedPlacesStore } from '../lib/savedPlacesStore';
import { colors, fonts, radii, spacing, typography } from '../theme';
import type { PlaceCategory, SavedPlace } from '../types';

const CATEGORY_ICON: Partial<Record<PlaceCategory, keyof typeof Ionicons.glyphMap>> = {
  home: 'home-outline',
  work: 'business-outline',
  grocery: 'cart-outline',
  pharmacy: 'medical-outline',
  hospital: 'fitness-outline',
  coffee_shop: 'cafe-outline',
  restaurant: 'restaurant-outline',
  park: 'leaf-outline',
  shopping: 'bag-outline',
  transit: 'train-outline',
  airport: 'airplane-outline',
  gas_station: 'car-outline',
  atm: 'cash-outline',
  bank: 'business-outline',
  ev_charger: 'flash-outline',
  urgent_care: 'bandage-outline',
  frequent: 'star-outline',
  unknown: 'location-outline',
};

export default function SavedPlacesScreen() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const all = await savedPlacesStore.getAll();
    setPlaces(all);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleToggleFavorite = async (id: string) => {
    await savedPlacesStore.toggleFavorite(id);
    reload();
  };

  const handleRemove = (place: SavedPlace) => {
    Alert.alert(
      `Remove "${place.label}"?`,
      'This will remove it from your saved places.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await savedPlacesStore.remove(place.id);
            reload();
          },
        },
      ],
    );
  };

  const favorites = places.filter((p) => p.isFavorite);
  const others = places.filter((p) => !p.isFavorite);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      <Text style={styles.sectionTitle}>Favorites</Text>
      {favorites.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="star-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>No favorites yet.</Text>
          <Text style={styles.emptySubtext}>Ask Veda to save a place as a favorite.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {favorites.map((place, i) => (
            <PlaceRow
              key={place.id}
              place={place}
              last={i === favorites.length - 1}
              onToggleFavorite={handleToggleFavorite}
              onRemove={handleRemove}
            />
          ))}
        </View>
      )}

      {others.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Other saved places</Text>
          <View style={styles.card}>
            {others.map((place, i) => (
              <PlaceRow
                key={place.id}
                place={place}
                last={i === others.length - 1}
                onToggleFavorite={handleToggleFavorite}
                onRemove={handleRemove}
              />
            ))}
          </View>
        </>
      )}

      <Text style={styles.footerNote}>
        Saved places help Veda give you smarter, context-aware suggestions.
        All data is stored on this device.
      </Text>
    </ScrollView>
  );
}

type PlaceRowProps = {
  place: SavedPlace;
  last: boolean;
  onToggleFavorite: (id: string) => void;
  onRemove: (place: SavedPlace) => void;
};

function PlaceRow({ place, last, onToggleFavorite, onRemove }: PlaceRowProps) {
  const icon = CATEGORY_ICON[place.category] ?? 'location-outline';
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={[styles.iconChip, { backgroundColor: place.isFavorite ? colors.brand : colors.textDisabled }]}>
        <Ionicons name={icon} size={14} color={colors.white} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.placeName}>{place.label}</Text>
        <Text style={styles.placeCategory}>{place.category.replace('_', ' ')}</Text>
      </View>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => onToggleFavorite(place.id)}
        accessibilityLabel={place.isFavorite ? 'Unfavorite' : 'Mark as favorite'}
      >
        <Ionicons
          name={place.isFavorite ? 'star' : 'star-outline'}
          size={18}
          color={place.isFavorite ? '#F1C40F' : colors.textMuted}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => onRemove(place)}
        accessibilityLabel={`Remove ${place.label}`}
      >
        <Ionicons name="trash-outline" size={18} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingBottom: 48 },

  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 16,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowDivider,
    gap: spacing.sm,
  },
  rowLast: { borderBottomWidth: 0 },

  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  placeName: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  placeCategory: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  iconBtn: { padding: 4 },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  emptyText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textSecondary },
  emptySubtext: { fontFamily: fonts.bodyLight, fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  footerNote: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xl,
    lineHeight: 17,
  },
});
