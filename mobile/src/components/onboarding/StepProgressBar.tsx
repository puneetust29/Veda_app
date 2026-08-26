import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

type Props = {
  /** 1-indexed current step. */
  step: number;
  totalSteps?: number;
};

// Four-segment progress bar shown near the top of each onboarding step,
// matching the Figma "Veda Flow" — completed/current segments are solid
// brand-red, remaining ones are light gray.
export default function StepProgressBar({ step, totalSteps = 4 }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View key={index} style={[styles.segment, index < step && styles.segmentActive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  segment: { flex: 1, height: 3, borderRadius: radii.sm, backgroundColor: colors.border },
  segmentActive: { backgroundColor: colors.brand },
});
