import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, fonts, spacing } from '../../theme';

type Props = {
  onPress?: () => void;
};

// Fixed-position CTA pinned to the bottom of the Dashboard, matching the
// Figma "Tap to ask Vinto" button (node 1:35575): 56px tall, 24px radius,
// bright red fill with a bold Urbanist label.
export default function AskVintoButton({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.label}>Tap to ask Veda</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    backgroundColor: colors.accentCta,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
  },
  label: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
});
