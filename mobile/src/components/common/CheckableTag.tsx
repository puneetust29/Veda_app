import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  confirmed: boolean;
  onPress: () => void;
};

// Reusable pill chip with a leading icon and a trailing checkmark that fills
// in green once confirmed. Originally built inline for the dashboard's
// flight-attention cards (Roaming / Travel Insurance); pulled out to
// `common/` so any other confirmable-item list can reuse it.
export default function CheckableTag({ icon, label, confirmed, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.tag, confirmed && styles.tagConfirmed]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={14} color={colors.textPrimary} />
      <Text style={styles.tagText}>{label}</Text>
      <Ionicons
        name={confirmed ? 'checkmark-circle' : 'checkmark-circle-outline'}
        size={16}
        color={confirmed ? colors.success : colors.textDisabled}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandTint,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  tagConfirmed: { backgroundColor: colors.successTint },
  tagText: { ...typography.small, color: colors.textPrimary },
});
