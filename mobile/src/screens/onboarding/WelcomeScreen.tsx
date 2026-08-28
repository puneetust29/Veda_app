import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

// Where the incoming card starts, measured off the Figma prototype: it enters
// ~16px right of centre at ~0.93 scale and eases forward into place.
const DECK_SHIFT_X = 16;
const DECK_SCALE = 0.93;
const ENTER_DURATION = 520;
const EXIT_DURATION = 180;
const CARD_INTERVAL = 2400;

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

function CardFace({ card }: { card: CurrentPlanCard }) {
  const CardIcon = CARD_ICONS[card.id];

  return (
    <>
      <View style={styles.imageCard}>
        <View>
          {CardIcon && <CardIcon />}
        </View>
      </View>

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
    </>
  );
}

// Recommendation cards auto-cycle: the outgoing card fades in place while the
// next one eases forward from the deck position behind it.
export default function WelcomeScreen({ navigation }: Props) {
  const { customer } = useAuth();
  const [index, setIndex] = useState(0);
  // Held only for the length of a swap so the outgoing card can fade out and
  // cover the content change.
  const [outgoing, setOutgoing] = useState<number | null>(null);

  // 0 = incoming card still sits back in the deck, 1 = settled at the front.
  const enter = useRef(new Animated.Value(1)).current;
  // Opacity of the card on its way out.
  const exit = useRef(new Animated.Value(0)).current;
  // Interpolations built once — they're driven natively and don't depend on props.
  const translateX = useRef(enter.interpolate({ inputRange: [0, 1], outputRange: [DECK_SHIFT_X, 0] })).current;
  const scale = useRef(enter.interpolate({ inputRange: [0, 1], outputRange: [DECK_SCALE, 1] })).current;

  const indexRef = useRef(0);
  const isFirstRender = useRef(true);

  const cards = customer?.current_plans?.length ? customer.current_plans : FALLBACK_CARDS;

  // The tick ONLY advances state. It must not touch the animated values:
  // setValue is synchronous while setIndex is not, so resetting here would
  // move the still-rendered previous card and show it easing forward before
  // React committed the new one.
  useEffect(() => {
    const interval = setInterval(() => {
      const prev = indexRef.current;
      const next = (prev + 1) % cards.length;
      indexRef.current = next;
      setOutgoing(prev);
      setIndex(next);
    }, CARD_INTERVAL);

    return () => clearInterval(interval);
  }, [cards.length]);

  // Runs in the same commit that renders the new card, before paint — so the
  // first frame the user sees already has the incoming card back in the deck.
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    enter.setValue(0);
    exit.setValue(1);

    const animation = Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: ENTER_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(exit, {
        toValue: 0,
        duration: EXIT_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      // Drop the outgoing layer once it's fully invisible.
      if (finished) setOutgoing(null);
    });

    return () => animation.stop();
  }, [index, enter, exit]);

  const card = cards[index % cards.length];
  const outgoingCard = outgoing === null ? null : cards[outgoing % cards.length];

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <StepProgressBar step={2} totalSteps={5} />
        <Text style={styles.title}>Nice to meet you,{'\n'}{customer?.full_name?.split(' ')[0] || 'there'}.</Text>
        <Text style={styles.subtitle}>Your Vodafone number helps Veda understand your world, so it can start helping from day one.</Text>

        <View style={styles.viewContainer}>
          {/* Card deck — two ghost cards sit behind the real one and peek out to the right */}
          <View style={styles.cardStack}>
            <View style={[styles.ghostCard, styles.ghostCardBack]} />
            <View style={[styles.ghostCard, styles.ghostCardMid]} />

            {/* Incoming card. Stays in normal flow so it defines the deck height. */}
            <Animated.View
              style={[styles.contentWrapper, { transform: [{ translateX }, { scale }] }]}
            >
              <CardFace card={card} />
            </Animated.View>

            {/* Outgoing card, stacked on top at the front position so it fades
                away to reveal the one arriving behind it. Without this layer
                the content change is a visible cut. */}
            {outgoingCard && (
              <Animated.View
                pointerEvents="none"
                style={[styles.contentWrapper, styles.outgoingCard, { opacity: exit }]}
              >
                <CardFace card={outgoingCard} />
              </Animated.View>
            )}
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
  viewContainer: { flex: 1, justifyContent: 'space-between' },

  // Holds the deck. Owns the width/offset that contentWrapper used to own,
  // so the ghost cards can be positioned relative to it.
  cardStack: {
    width: 260,
    alignSelf: 'center',
    marginTop: spacing.xxxl,
  },

  contentWrapper: {
    borderWidth: 1,
    padding: spacing.lg,
    width: '100%',
    // Floor height keeps the shell from jumping when copy lengths differ.
    minHeight: 340,
    // Opaque background is required, otherwise the ghost cards show through
    // and the two card layers bleed into each other mid-swap.
    backgroundColor: colors.background,
    borderColor: colors.borderMuted,
    borderRadius: radii.xxl,
    overflow: 'hidden',
  },

  outgoingCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // The ghosts sit flush to the right edge; the small rotation is what swings
  // their top-right corner clear of the front card. The bottom-left corner
  // swings the other way and hides behind it, so no outline shows at the
  // bottom. `left`/`bottom` must stay larger than halfHeight*sin(angle) and
  // halfWidth*sin(angle) respectively, or the ghost pokes out on those sides.
  ghostCard: {
    position: 'absolute',
    right: 0,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.xxl,
    backgroundColor: colors.background,
  },

  ghostCardMid: {
    top: 10,
    bottom: 22,
    left: 18,
    opacity: 0.7,
    transform: [{ rotate: '3deg' }],
  },

  ghostCardBack: {
    top: 14,
    bottom: 34,
    left: 30,
    opacity: 0.45,
    transform: [{ rotate: '6deg' }],
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
    lineHeight: 20,
  },

  cardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fonts.body,
    color: '#6b7280',
    marginBottom: spacing.lg,
    lineHeight: 19,
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
    lineHeight: 21,
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
    marginBottom: spacing.lg,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },

  dotActive: {
    backgroundColor: colors.brandBackGround,
    width: 24,
  },

  cta: {
    backgroundColor: colors.brandBackGround,
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 366,
    elevation: 3,
    shadowColor: colors.brandBackGround,
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
