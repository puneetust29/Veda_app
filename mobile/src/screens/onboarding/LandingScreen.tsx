import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Landing'>;

export default function LandingScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Image source={require('../../../assets/Veda-Onboarding-GIF1.gif')} style={styles.backgroundGif} resizeMode="cover" />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('PhoneEntry')} activeOpacity={0.9}>
          <Text style={styles.ctaText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backgroundGif: { ...StyleSheet.absoluteFillObject },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: spacing.xxxl,
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
});
