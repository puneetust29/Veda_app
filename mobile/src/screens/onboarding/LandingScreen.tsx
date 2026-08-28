import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import VedaLogo from '../../../assets/veda.svg';
import VodafoneLogo from '../../../assets/vodafone-logo.svg';
import FloatingIcons, { lockupLayout } from '../../components/onboarding/FloatingIcons';
import { colors, fonts, radii, spacing, typography } from '../../theme';
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
      <View style={[styles.brand, lockup, { width: 'auto', left: '20%', marginLeft: -60 }]}>
        <VedaLogo width={LOGO_MARK_SIZE} height={LOGO_MARK_SIZE} />
        <Text style={styles.logo}>veda</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('PhoneEntry')} activeOpacity={0.9}>
          <Text style={styles.ctaText}>Get Started</Text>
        </TouchableOpacity>
        <View style={styles.poweredByContainer}>
          <Text style={styles.poweredBy}>Powered by</Text>
          <VodafoneLogo width={74} height={20} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'flex-end' },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, overflow: 'visible', flexShrink: 0 },
  logo: { ...typography.display, color: colors.textPrimary },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
    alignItems: 'center',
  },
  cta: {
    backgroundColor: '#f00405',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 366,
    elevation: 3,
    shadowColor: '#f00405',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16, fontWeight: '700' },
  poweredByContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  poweredBy: { fontSize: 12, color: 'rgba(0,0,0,0.5)', fontFamily: fonts.medium, fontWeight: '500' },
});
