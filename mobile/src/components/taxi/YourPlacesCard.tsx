import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fonts, spacing } from '../../theme';

type PlaceItem = {
  label: string;
  address: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Props = {
  homeAddress?: string | null;
  workAddress?: string | null;
  onSelectPlace?: (address: string) => void;
};

// New customers are provisioned with a placeholder home address; treat it as missing.
const PLACEHOLDER_ADDRESS = 'unknown';

function isUsableAddress(value?: string | null): value is string {
  const trimmed = value?.trim();
  return !!trimmed && trimmed.toLowerCase() !== PLACEHOLDER_ADDRESS;
}

export default function YourPlacesCard({ homeAddress, workAddress, onSelectPlace }: Props) {
  const places: PlaceItem[] = [];
  if (isUsableAddress(homeAddress)) {
    places.push({ label: 'Home', address: homeAddress.trim(), icon: 'home-outline' });
  }
  if (isUsableAddress(workAddress)) {
    places.push({ label: 'Work', address: workAddress.trim(), icon: 'briefcase-outline' });
  }

  if (places.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your places</Text>

      <View style={styles.row}>
        {places.map((place) => (
          <TouchableOpacity
            key={place.label}
            style={styles.chip}
            activeOpacity={0.8}
            onPress={() => onSelectPlace?.(place.address)}
          >
            <Ionicons name={place.icon} size={20} color={colors.brandText} />
            <Text style={styles.label}>{place.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  heading: {
    color: colors.textMuted,
    fontSize: 16,
    fontFamily: fonts.body,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 24,
  },
  label: {
    marginLeft: spacing.sm,
    color: colors.black,
    fontSize: 14,
    fontFamily: fonts.semiBold,
  },
});
