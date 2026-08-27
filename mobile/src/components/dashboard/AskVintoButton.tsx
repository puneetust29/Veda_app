import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fonts, spacing } from '../../theme';

type Props = {
  onPress?: () => void;
};

export default function AskVintoButton({ onPress }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.label}>Tap to ask Veda</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
    zIndex: 10,
  },
  button: {
    height: 56,
    backgroundColor: colors.accentCta,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
});
