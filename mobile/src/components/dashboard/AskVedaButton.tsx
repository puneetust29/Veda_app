import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, fonts, spacing } from '../../theme';

type Props = {
  onPress?: () => void;
};

export default function AskVedaButton({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.label}>Tap to ask Veda</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    height: 56,
    backgroundColor: colors.accentCta,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 26},
  disabled: { opacity: 1, backgroundColor: colors.tileBorder},
  disabledLabel: { color: '#7c7c7c' },
});
