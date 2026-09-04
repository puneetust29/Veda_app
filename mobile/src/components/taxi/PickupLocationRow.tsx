import { TouchableOpacity, View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

type Props = {
  label: string;
  onChangePress: () => void;
};

export default function PickupLocationRow({ label, onChangePress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <Ionicons name="location" size={16} color={colors.brand} />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.caption}>Pickup location</Text>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </View>
        <TouchableOpacity style={styles.changeButton} onPress={onChangePress} hitSlop={6}>
          <Text style={styles.change}>Change</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textGroup: {
    flex: 1,
  },
  caption: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  changeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.brandTint,
  },
  change: {
    fontSize: 13,
    color: colors.brand,
    fontWeight: '600',
  },
});
