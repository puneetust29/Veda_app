import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import VedaLogo from '../../../assets/veda.svg';
import FloatingIcons, { lockupLayout } from '../../components/onboarding/FloatingIcons';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Landing'>;

const LOGO_MARK_SIZE = 84;
// Figma does NOT centre the lockup on the orbit — the mark sits roughly this
// far below the ring's centre, which is what stops the composition reading as
// a logo stamped inside a badge. Measured off the Figma frame, so treat it as
// approximate.
const MARK_OFFSET_BELOW_RING_CENTER = 65;

export default function LandingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const lockup = lockupLayout(width);

  return (
    <View style={styles.container}>
      <FloatingIcons />

      {/* Anchored to the ring's centre rather than laid out in a flex box, so
          the lockup keeps its Figma relationship to the shape instead of
          drifting with the footer's height. */}
      <View style={[styles.brand, lockup]}>
        <VedaLogo width={LOGO_MARK_SIZE} height={LOGO_MARK_SIZE} />
        <Text style={styles.logo}>veda</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('PhoneEntry')}>
          <Text style={styles.ctaText}>Get Started</Text>
        </TouchableOpacity>
        <Text style={styles.poweredBy}>
          Powered by <Text style={styles.poweredByBrand}>Vodafone</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'flex-end' },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: spacing.sm },
  logo: { ...typography.display, color: colors.textPrimary },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  cta: {
    backgroundColor: colors.brandBackGround,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  poweredBy: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  poweredByBrand: { color: colors.brand, fontWeight: '700' },
});
