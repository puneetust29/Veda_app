import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import SuccessBadge from '../../components/onboarding/SuccessBadge';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Success'>;

// Animated "..." after the subtitle, cycling 0-3 dots — matches the loading
// dots on the Figma "Preparing your experience" screen.
function useLoadingDots() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setCount((prev) => (prev + 1) % 4), 400);
    return () => clearInterval(interval);
  }, []);
  return '.'.repeat(count);
}

// Holds on the success badge animation for a beat, then crossfades and marks
// onboarding complete — sign-in itself already happened right after OTP
// verification, so every step since then had a real auth token to work with
// (e.g. AccountSelection's Google OAuth connect). This screen just flips the
// flag RootNavigator uses to swap from the onboarding stack to the
// authenticated Dashboard stack.
export default function SuccessScreen(_props: Props) {
  const { completeOnboarding } = useAuth();
  const fade = useRef(new Animated.Value(1)).current;
  const dots = useLoadingDots();

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        completeOnboarding();
      });
    }, 2400);
    return () => clearTimeout(timer);
  }, [completeOnboarding, fade]);

  return (
    <Animated.View style={[styles.container, { opacity: fade }]}>
      <SuccessBadge />
      <Text style={styles.title}>You're all set!</Text>
      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>Preparing your experience</Text>
        <Text style={[styles.subtitle, styles.dots]}>{dots}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  subtitleRow: { flexDirection: 'row' },
  subtitle: { ...typography.caption, color: colors.textMuted },
  dots: { color: colors.brand, fontWeight: '700', minWidth: 18 },
});
