import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

type RecCard = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  bullet: string;
};

const CARDS: RecCard[] = [
  { id: 'pay-as-you-go', icon: 'card-outline', title: 'Pay as you go', subtitle: 'Your Vodafone plan', bullet: 'Recommendations will match your plan.' },
  { id: 'bundle', icon: 'gift-outline', title: '30-day Bundle', subtitle: 'Big Value', bullet: 'Included benefits will be surfaced automatically.' },
  { id: 'phone', icon: 'phone-portrait-outline', title: 'CMF Phone 2 Pro', subtitle: 'Primary device', bullet: 'Suggestions will adapt to your device.' },
  { id: 'lines', icon: 'people-outline', title: '3 connected lines', subtitle: 'Your household', bullet: 'Ready to help everyone stay connected.' },
];

// Recommendation cards auto-cycle with a crossfade, with the next two cards
// gently peeking from behind — matches the "Nice to meet you" screen where
// cards swap on their own while the user reads the greeting.
export default function WelcomeScreen({ navigation }: Props) {
  const { firstName } = useOnboarding();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setIndex((prev) => (prev + 1) % CARDS.length), 250);
    }, 2200);
    return () => clearInterval(interval);
  }, [fade]);

  const card = CARDS[index];

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <StepProgressBar step={2} />
        <Text style={styles.title}>Nice to meet you,{'\n'}{firstName}.</Text>
        <Text style={styles.subtitle}>Your Vodafone account gives me a great place to start.</Text>

        <View style={styles.cardStack}>
          {/* Peeking cards behind the active one, matching the stacked-deck
              look in the Figma reference. */}
          <View style={[styles.peekCard, styles.peekCardFar]} />
          <View style={[styles.peekCard, styles.peekCardNear]} />

          <Animated.View style={[styles.card, { opacity: fade }]}>
            <View style={styles.cardArt}>
              <Ionicons name={card.icon} size={40} color={colors.white} />
            </View>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
              <Text style={styles.bulletText}>{card.bullet}</Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.dots}>
          {CARDS.map((c, i) => (
            <View key={c.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('PlanSelection')}>
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, flex: 1 },
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xxl },
  cardStack: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  peekCard: {
    position: 'absolute',
    width: '86%',
    height: 220,
    borderRadius: radii.lg,
    backgroundColor: colors.brandTint,
  },
  peekCardFar: { top: -16, transform: [{ scale: 0.9 }], opacity: 0.5 },
  peekCardNear: { top: -8, transform: [{ scale: 0.95 }], opacity: 0.8 },
  card: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    minHeight: 220,
    justifyContent: 'center',
  },
  cardArt: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.sectionTitle, color: colors.white },
  cardSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.8)', marginBottom: spacing.lg },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  bulletText: { ...typography.caption, color: colors.white, flex: 1, textAlign: 'left' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.xl },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand, width: 18 },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
});
