import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  onPress?: () => void;
};

// Fixed-position CTA pinned to the bottom of the Dashboard, matching the
// Figma "Tap to ask Vinto" button.
export default function AskVintoButton({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.label}>Tap to ask Vinto</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  label: { color: colors.white, ...typography.bodyBold, fontSize: 16 },
});
