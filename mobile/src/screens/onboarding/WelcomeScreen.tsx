import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View,   } from 'react-native';
import type { FC, SVGProps } from 'react';

import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radii, spacing, typography } from '../../theme';
import type { CurrentPlanCard, OnboardingStackParamList } from '../../types';
import Cmf2Pro from '../../../assets/CMF-2-pro.svg';
import bigValueBundle from '../../../assets/big-value-bundle.svg';
import connectedLines from '../../../assets/connected-lines.svg';
import payAsYouGo from '../../../assets/pay-as-you-go.svg';


type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

// The backend only knows card ids/copy (see customers.current_plans); icons
// stay a frontend concern mapped by id.
const CARD_ICONS: Record<string, FC<SVGProps<SVGSVGElement>>> = {
  'pay-as-you-go': payAsYouGo,
  bundle: bigValueBundle,
  phone: Cmf2Pro,
  lines: connectedLines,
};

// Fallback used before the customer profile loads or if current_plans is empty.
const FALLBACK_CARDS: CurrentPlanCard[] = [
  { id: 'pay-as-you-go', title: 'Pay as you go', subtitle: 'Your Vodafone plan', bullet: 'Recommendations will match your plan.' },
  { id: 'bundle', title: '30-day Bundle', subtitle: 'Big Value', bullet: 'Included benefits will be surfaced automatically.' },
  { id: 'phone', title: 'CMF Phone 2 Pro', subtitle: 'Primary device', bullet: 'Suggestions will adapt to your device.' },
  { id: 'lines', title: '3 connected lines', subtitle: 'Your household', bullet: 'Ready to help everyone stay connected.' },
];

// Recommendation cards auto-cycle with a crossfade, with the next two cards
// gently peeking from behind — matches the "Nice to meet you" screen where
// cards swap on their own while the user reads the greeting.
export default function WelcomeScreen({ navigation }: Props) {
  const { customer } = useAuth();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  const cards = customer?.current_plans?.length ? customer.current_plans : FALLBACK_CARDS;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setIndex((prev) => (prev + 1) % cards.length), 250);
    }, 2200);
    return () => clearInterval(interval);
  }, [fade, cards.length]);

  const card = cards[index % cards.length];
  const CardIcon = CARD_ICONS[card.id];

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <StepProgressBar step={2} totalSteps={5} />
        <Text style={styles.title}>Nice to meet you,{'\n'}{customer?.full_name?.split(' ')[0] || 'there'}.</Text>
        <Text style={styles.subtitle}>Your Vodafone number helps Veda understand your world, so it can start helping from day one.</Text>
        <View style={styles.viewContainer}>
        <View style={styles.contentWrapper}>
          
          <Animated.View style={[styles.imageCard, { opacity: fade }]}>
            <View>
              {CardIcon && <CardIcon />}
            </View>
          </Animated.View>

          
          <View>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            <View style={styles.bulletRow}>
              <View style={styles.checkmarkCircle}>
                <Ionicons name="checkmark" size={14} color={colors.white} />
              </View>
              <Text style={styles.bulletText}>{card.bullet}</Text>
            </View>
          </View>
          </View>

          {/* Bottom Section - Dots and CTA */}
          <View style={styles.bottomSection}>
            <View style={styles.dots}>
              {cards.map((c, i) => (
                <View key={c.id} style={[styles.dot, i === index % cards.length && styles.dotActive]} />
              ))}
            </View>

            <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('PlanSelection')}>
              <Text style={styles.ctaText}>Continue</Text>
            </TouchableOpacity>
          </View>
          </View>
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, flex: 1, flexDirection: 'column' },
  title: { fontSize: 32, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: spacing.sm, lineHeight: 40 },
  subtitle: { fontSize: 14, fontWeight: '400', fontFamily: fonts.body, color: '#6b7280', marginBottom: spacing.lg, lineHeight: 21 },
  viewContainer: {flex: 1, justifyContent: 'space-between',},
  contentWrapper: {
    borderWidth: 1,
    padding: spacing.lg,
    width: 260,
    alignSelf: 'center',
    borderColor: colors.borderMuted,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    marginTop: spacing.xxxl
  },

  imageCard: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },


  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.xl,
    lineHeight: 20
  },

  cardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fonts.body,
    color: '#6b7280',
    marginBottom: spacing.lg,
    lineHeight: 19
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },

  checkmarkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },

  bulletText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#6b7280',
    flex: 1,
    lineHeight: 21
  },

  bottomSection: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.lg,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border
  },

  dotActive: {
    backgroundColor: colors.brandBackGround,
    width: 24
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

  ctaText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
});
