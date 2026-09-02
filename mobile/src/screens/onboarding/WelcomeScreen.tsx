import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const CARD_INTERVAL = 2400;

// Matches contentWrapper's minHeight below. Used only for the iOS
// transformOrigin compensation (see IOS_ORIGIN_FIX_ENABLED).
const CARD_HEIGHT = 340;

// RN's Fabric implementation of `transformOrigin` is unreliable on iOS when
// combined with 3D transforms (rotateY/perspective): it's silently ignored,
// so the scale pivots from the view's centre instead of its top. That sinks
// each receding card's top edge into the middle of the deck instead of
// keeping it flush with the front card, exposing the back card's title/
// bullet text instead of the intended hairline sliver of artwork. Android
// honours transformOrigin correctly, so only iOS needs the manual
// compensating translateY.
const IOS_ORIGIN_FIX_ENABLED = Platform.OS === 'ios';

// ONE spring drives the entire deck (see `progress` below), so these values
// are matched to the reference implementation exactly.
//
// The rest thresholds matter more than they look. RN's defaults (0.001) are
// ABSOLUTE, so with a spring per channel a value travelling 22px and one
// travelling 0.1 (scale) cross the finish line at very different times —
// that showed up as the card visibly creeping 1px at a time for ~370ms
// AFTER it had apparently landed. Driving everything from a single 0→1
// value makes the thresholds mean the same thing for every channel, and
// these slightly looser numbers cut the long asymptotic tail so the deck
// actually stops instead of crawling.
const DECK_SPRING = {
  stiffness: 140,
  damping: 24,
  mass: 1.1,
  restDisplacementThreshold: 0.005,
  restSpeedThreshold: 0.005,
  useNativeDriver: true,
} as const;

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

// Revolving deck slots keyed by the (non-shortest) circular distance 0..3+
// from the active card. Slot 0 is the centred, front-facing card; 1..3 form a
// receding fan tucked behind it to the right — a touch lower, smaller,
// dimmer, rotated further and turned a little more on Y for depth — with a
// lower z so each tucks behind the card ahead of it.
//
// Offsets are the reference's, rescaled to this card's rendered width
// (the reference's 240px card is drawn at FRONT_SCALE 1.2 = 288px, so its
// 24/42/56 offsets are 8.3%/14.6%/19.4% of the card — applied here to 260px).
// Scales/opacities are the reference's normalised to a 1.0 front card.
//
// These pair with transformOrigin: 'center top' on the card (see below).
// The rotations are measured about the TOP edge, not the centre, so the
// artwork band near the top of the card barely swings and the deck reads as
// hairline slivers up top that fan out toward the bottom.
//
// zIndex is a plain number applied the instant the index changes —
// deliberately not delayed or animated. A card dropping toward the back must
// drop immediately, or it sits on top while visibly shrinking and reads as
// the card "going blank"; and since each slot already has a distinct z, the
// card rising to the front is already the highest z among what's left.
function slotFor(raw: number) {
  switch (raw) {
    case 0: // centre, front — flat, face-on, full size
      return { x: 0, y: 0, rotate: 0, rotateY: 0, scale: 1, z: 40, contentOpacity: 1 };
    case 1: // just behind — a thin sliver peeks right
      return { x: 22, y: 7, rotate: 3, rotateY: -11, scale: 0.925, z: 30, contentOpacity: 0.7 };
    case 2: // deeper, tucked behind slot 1
      return { x: 38, y: 14, rotate: 6, rotateY: -15, scale: 0.858, z: 20, contentOpacity: 0.5 };
    default: // 3+ — deepest in the deck
      return { x: 50, y: 21, rotate: 9, rotateY: -18, scale: 0.792, z: 10, contentOpacity: 0.35 };
  }
}

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

// Recommendation cards live in a revolving deck: every card is always
// mounted in its own slot (front, or receding behind it), and advancing just
// moves each card's slot target — the departing card springs to the back of
// the deck while the next one springs to the front.
//
// Every transform on every card is interpolated from ONE shared `progress`
// value that springs 0 → 1 per advance. That is deliberate: with a spring
// per channel per card, the channels settled at different times and the deck
// kept micro-adjusting after it had visually arrived. One driver means one
// clock, so all cards and all channels start and stop together.
export default function WelcomeScreen({ navigation }: Props) {
  const { customer } = useAuth();

  // `prev` is the slot arrangement we're animating FROM, `current` the one
  // we're animating TO. Kept together in one state so a render never sees a
  // mismatched pair mid-update.
  const [deck, setDeck] = useState({ prev: 0, current: 0 });

  const cards = customer?.current_plans?.length ? customer.current_plans : FALLBACK_CARDS;

  // The single driver for the whole deck. Recreated only if the card list
  // changes shape (e.g. fallback → real customer data).
  const progress = useMemo(
    () => new Animated.Value(1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards.length]
  );

  // Reset to a settled, un-animating state whenever the card list changes
  // shape, so a data swap never animates from a stale arrangement.
  useLayoutEffect(() => {
    setDeck({ prev: 0, current: 0 });
    progress.setValue(1);
  }, [progress]);

  // Auto-advance one card at a time; the timer restarts whenever the card
  // list changes shape.
  useEffect(() => {
    const id = setInterval(() => {
      setDeck((d) => ({ prev: d.current, current: (d.current + 1) % cards.length }));
    }, CARD_INTERVAL);
    return () => clearInterval(id);
  }, [cards.length]);

  // Runs the one spring for this advance. Before paint, so the reset case
  // (prev === current) never flashes a half-animated pose.
  useLayoutEffect(() => {
    if (deck.prev === deck.current) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, ...DECK_SPRING }).start();
  }, [deck, progress]);

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <StepProgressBar step={2} totalSteps={5} />
        <Text style={styles.title}>Nice to meet you,{'\n'}{customer?.full_name?.split(' ')[0] || 'there'}.</Text>
        <Text style={styles.subtitle}>Your Vodafone number helps Veda understand your world, so it can start helping from day one.</Text>

        <View style={styles.viewContainer}>
          {/* Card deck — every card is always mounted, positioned in its own
              revolving slot (front, or receding behind it). Advancing moves
              each card from its old slot to its new one along the shared
              `progress` spring. */}
          <View style={styles.cardStack}>
            {cards.map((c, i) => {
              const n = cards.length;
              const from = slotFor((i - deck.prev + n) % n);
              const to = slotFor((i - deck.current + n) % n);

              // Every channel interpolated off the same driver, so they are
              // incapable of settling at different times.
              const lerp = (a: number, b: number) =>
                progress.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
              const lerpDeg = (a: number, b: number) =>
                progress.interpolate({ inputRange: [0, 1], outputRange: [`${a}deg`, `${b}deg`] });

              // See IOS_ORIGIN_FIX_ENABLED — no-op on Android, where
              // transformOrigin already keeps the top edge pinned.
              const anchorY = (y: number, scale: number) =>
                IOS_ORIGIN_FIX_ENABLED ? y + (CARD_HEIGHT / 2) * (scale - 1) : y;

              return (
                <Animated.View
                  key={c.id}
                  style={[
                    styles.contentWrapper,
                    styles.deckCard,
                    {
                      zIndex: to.z,
                      transform: [
                        { perspective: 800 },
                        { translateX: lerp(from.x, to.x) },
                        { translateY: lerp(anchorY(from.y, from.scale), anchorY(to.y, to.scale)) },
                        { rotate: lerpDeg(from.rotate, to.rotate) },
                        { rotateY: lerpDeg(from.rotateY, to.rotateY) },
                        { scale: lerp(from.scale, to.scale) },
                      ],
                    },
                  ]}
                >
                  <Animated.View style={{ opacity: lerp(from.contentOpacity, to.contentOpacity) }}>
                    <CardFace card={c} />
                  </Animated.View>
                </Animated.View>
              );
            })}
          </View>

          {/* Bottom Section - Dots and CTA */}
          <View style={styles.bottomSection}>
            <View style={styles.dots}>
              {cards.map((c, i) => (
                <View key={c.id} style={[styles.dot, i === deck.current && styles.dotActive]} />
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
  body: { paddingHorizontal: spacing.xl, paddingTop:spacing.xl, flex: 1, flexDirection: 'column' },
  title: { fontSize: 32, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: spacing.sm, lineHeight: 40 },
  subtitle: { fontSize: 14, fontWeight: '400', fontFamily: fonts.body, color: '#6b7280', marginBottom: spacing.lg, lineHeight: 21 },
  viewContainer: { flex: 1, justifyContent: 'space-between' },

  // Holds the deck. Every card inside is absolutely positioned so its slot
  // transform is what places it, so the stack needs its own explicit height.
  cardStack: {
    width: 260,
    height: 340,
    alignSelf: 'center',
    marginTop: spacing.xxxl,
  },

  contentWrapper: {
    borderWidth: 1,
    padding: spacing.lg,
    width: '100%',
    // Floor height keeps the shell from jumping when copy lengths differ.
    minHeight: 340,
    // Opaque background is required, otherwise the deeper cards in the deck
    // show through and the layers bleed into each other while animating.
    backgroundColor: colors.background,
    borderColor: colors.borderMuted,
    borderRadius: radii.xxl,
    overflow: 'hidden',
  },

  deckCard: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Pivot every rotation and scale about the card's TOP edge, matching the
    // reference. With RN's default centre origin the 3/6/9° slot rotations
    // swing the artwork band (which sits near the top) wide open — measured
    // at ~30% of the card width versus the reference's ~4% — which is what
    // let the back cards' red artwork show past the front card's edge. It
    // also keeps the shrunken back cards' top edges aligned with the front
    // card instead of dropping them.
    //
    // Needs RN 0.74+ / Expo SDK 51+. On older versions this style prop is
    // ignored; the equivalent is to add a compensating translateY of
    // (CARD_HEIGHT / 2) * (scale - 1) to each slot.
    transformOrigin: 'center top',
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
