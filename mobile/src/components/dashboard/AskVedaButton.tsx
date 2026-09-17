import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, fonts, spacing } from '../../theme';

type Props = {
  onPress?: () => void;
};

export default function AskVedaButton({ onPress }: Props) {
  return (
    <TouchableOpacity style={[styles.button, styles.disabled]} onPress={onPress} activeOpacity={1} disabled>
      <Text style={[styles.label, styles.disabledLabel]}>Tap to ask Veda</Text>
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
  label: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
  disabled: { opacity: 1, backgroundColor: colors.textDisabled },
  disabledLabel: { color: colors.textMuted },
});
