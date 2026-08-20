import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import FloatingIcons from '../../components/onboarding/FloatingIcons';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Landing'>;

export default function LandingScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <FloatingIcons />
        <View style={styles.brandMark}>
          <Text style={styles.logoV}>V</Text>
        </View>
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
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brandMark: { marginBottom: spacing.sm },
  logoV: { fontSize: 48, fontWeight: '900', color: colors.brand },
  logo: { fontSize: 32, fontWeight: '800', color: colors.textPrimary },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  poweredBy: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  poweredByBrand: { color: colors.brand, fontWeight: '700' },
});
