import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding } from '../../context/OnboardingContext';
import { brandIcons, colors, radii, spacing, typography, withOpacity } from '../../theme';
import type { OnboardingStackParamList, PlanTier } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PlanSelection'>;

// --------------------------------------------------
// MEASURED FROM THE REFERENCE
// --------------------------------------------------
// Every number in this block was sampled off the 375pt-wide reference render,
// not estimated. Card spans x=20..351, tiles 143pt wide with a 7pt gutter,
// icon chips 25pt on a 19pt pitch. If something looks a point off, re-measure
// against the reference rather than nudging by eye.

const REF_WIDTH = 375;
const BODY_SIDE_PADDING = 20; // card left edge in the reference
const CARD_GAP = 12;          // must match styles.cardsContent.gap
const CARD_PEEK = 12;

// The reference shows no next-card sliver at all (card right edge 351, then
// white to the frame). CARD_GAP + CARD_PEEK = 24 reproduces its 331pt card
// width exactly while still leaving a small affordance that this scrolls.
function cardWidth(screenWidth: number) {
  return screenWidth - BODY_SIDE_PADDING - CARD_GAP - CARD_PEEK;
}

const PINK_BODY = colors.bubbleFill; // card body fill
const PINK_TILE = colors.pinkTile;   // category tile fill
const PINK_BORDER = colors.pinkBorder; // card outline
const CTA_RED = colors.brandBackGround;

// --------------------------------------------------
// GRADIENTS
// --------------------------------------------------

/**
 * Convert a CSS `linear-gradient(Ndeg, ...)` angle into expo-linear-gradient
 * start/end points for a box of a given size. CSS measures the angle against
 * the real box; expo measures against a unit square, so the direction has to
 * be divided by the box dimensions before it's renormalised. Skipping this is
 * fine on a near-square box and badly wrong on a short wide one like the card
 * header.
 *
 * Kept for the record — the two gradients below are its output, frozen so
 * nothing recomputes per render.
 */
export function cssAngleToGradient(deg: number, width: number, height: number) {
  const rad = (deg * Math.PI) / 180;
  let dx = Math.sin(rad) / width;
  let dy = -Math.cos(rad) / height;
  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;
  const half = 0.5 / Math.max(Math.abs(dx), Math.abs(dy));
  return {
    start: { x: 0.5 - dx * half, y: 0.5 - dy * half },
    end: { x: 0.5 + dx * half, y: 0.5 + dy * half },
  };
}

// linear-gradient(104.62deg, #E70001 6.94%, #970000 93.97%) over ~414x300.
const BANNER_GRADIENT = {
  colors: [colors.gradientBannerStart, colors.gradientBannerEnd] as const,
  locations: [0.0694, 0.9397] as const,
  start: { x: 0, y: 0.32 },
  end: { x: 1, y: 0.68 },
};

// linear-gradient(214.32deg, #D5201F 1.52%, #C81F1D 59.03%) over ~331x59.
// The stop ends at 59%, so the lower 40% is flat #C81F1D — that's the design,
// not a truncation; expo extends the final colour.
// Figma also exported a solid `linear-gradient(0deg, #FFFFFF, #FFFFFF)` layer
// alongside this one. That's the base fill; painting it would hide the red.
const CARD_HEADER_GRADIENT = {
  colors: [colors.gradientCardStart, colors.gradientCardEnd] as const,
  locations: [0.0152, 0.5903] as const,
  start: { x: 0.56, y: 0 },
  end: { x: 0.44, y: 1 },
};

// --------------------------------------------------
// HERO
// --------------------------------------------------
// The headline is screen-level, not per-tier — the carousel changes underneath
// it while this stays put.

const HERO_TITLE = 'Make Veda yours.';
const HERO_SUBTITLE = 'Start with the level that suits you.';

const TIER_LABELS: Record<PlanTier, string> = {
  lite: 'Essential Access',
  balanced: 'Everyday Access',
  complete: 'Complete Access',
};

/**
 * The arc DIPS through the middle — the centre bubble sits lower than the two
 * flanking it. A borderRadius ellipse with scaleY can't express that, so it's
 * a real curve, and the bubbles are placed by the same function that draws it.
 *
 * TODO(figma): unlike the card section below, these are still read off a
 * screenshot rather than measured. Replace from the frame's SVG export.
 */
const RING_AREA_HEIGHT = 84;
const ARC_CENTRE_Y = 40;
const ARC_RISE = 34;
const BUBBLE_X_FRACTIONS = [0.26, 0.5, 0.74];

function arcY(x: number, width: number) {
  const t = (x - width / 2) / (width / 2);
  return ARC_CENTRE_Y - ARC_RISE * t * t;
}

function arcPath(width: number) {
  const points: string[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const x = -12 + ((width + 24) * i) / 40;
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${arcY(x, width).toFixed(2)}`);
  }
  return points.join(' ');
}

type HeroBubble = {
  icon: keyof typeof Ionicons.glyphMap;
  glyphColor: string;
  size: number;
  glyphSize: number;
};

// TODO(asset): the centre mark in the design is the two-tone Veda glyph, not
// an Ionicon. Drop the real SVG in here when it's available.
const HERO_BUBBLES: HeroBubble[] = [
  { icon: 'airplane', glyphColor: brandIcons.googleBlue, size: 40, glyphSize: 18 },
  { icon: 'heart', glyphColor: colors.accentRed, size: 48, glyphSize: 22 },
  { icon: 'heart', glyphColor: brandIcons.healthSlate, size: 40, glyphSize: 18 },
];

function TierHero({ topInset }: { topInset: number }) {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.hero, { marginTop: topInset + 16 }]}>
      <Text style={styles.heroTitle}>{HERO_TITLE}</Text>
      <Text style={styles.heroSubtitle}>{HERO_SUBTITLE}</Text>

      <View style={styles.ringArea}>
        <Svg width={width} height={RING_AREA_HEIGHT} style={styles.arcSvg}>
          <Path d={arcPath(width)} stroke={withOpacity(colors.white, 0.3)} strokeWidth={1} fill="none" />
        </Svg>

        {HERO_BUBBLES.map((bubble, i) => {
          const cx = width * BUBBLE_X_FRACTIONS[i];
          const cy = arcY(cx, width);
          return (
            <View
              key={i}
              style={[
                styles.heroBubble,
                {
                  left: cx - bubble.size / 2 - BODY_SIDE_PADDING,
                  top: cy - bubble.size / 2,
                  width: bubble.size,
                  height: bubble.size,
                  borderRadius: bubble.size / 2,
                },
              ]}
            >
              <Ionicons name={bubble.icon} size={bubble.glyphSize} color={bubble.glyphColor} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// --------------------------------------------------
// SELECTION FAN
// --------------------------------------------------
// The sunburst under the active card. It is ELLIPTICAL, not circular: in the
// reference it reaches ~88pt sideways from the disc but only ~40pt down. A
// circular fan looks nothing like it. Rays are SVG; the disc is a real View on
// top, because an SVG <Circle> leaves nowhere to put the checkmark.

const FAN_DISC = 26;
const FAN_RAYS = 17;
const FAN_RX = 88;          // horizontal reach
const FAN_RY = 40;          // vertical reach
const FAN_INNER = 0.38;     // where rays start, as a fraction of the reach
const FAN_HEIGHT = FAN_DISC / 2 + FAN_RY + 4;

function SelectionFan({ width }: { width: number }) {
  const cx = width / 2;
  const cy = FAN_DISC / 2;

  return (
    <View style={{ width, height: FAN_HEIGHT }}>
      {/* <Svg width={width} height={FAN_HEIGHT} style={StyleSheet.absoluteFill}> */}
        {/* {Array.from({ length: FAN_RAYS }, (_, i) => {
          const deg = 20 + (140 * i) / (FAN_RAYS - 1);
          const cos = Math.cos((deg * Math.PI) / 180);
          const sin = Math.sin((deg * Math.PI) / 180);
          return (
            <Line
              key={i}
              x1={cx + cos * FAN_RX * FAN_INNER}
              y1={cy + sin * FAN_RY * FAN_INNER}
              x2={cx + cos * FAN_RX}
              y2={cy + sin * FAN_RY}
              stroke={withOpacity(colors.accentRed, 0.16)}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          );
        })} */}
        {/* The stem is shorter and more saturated than the rays. */}
        {/* <Line
          x1={cx}
          y1={cy + 1}
          x2={cx}
          y2={cy + FAN_RY * 0.62}
          stroke={withOpacity(colors.accentRed, 0.45)}
          strokeWidth={1.2}
        />
      </Svg> */}
      <View style={[styles.indicatorCircle, { left: cx - FAN_DISC / 2 }]}>
        <Ionicons name="checkmark" size={15} color={colors.white} />
      </View>
    </View>
  );
}

// --------------------------------------------------
// ACCESS-LEVEL CARDS
// --------------------------------------------------

type IconSpec = { name: keyof typeof Ionicons.glyphMap; color: string };
type AccessCategory = { title: string; icons: IconSpec[] };
type IncludesSpec = { label: string; icons: IconSpec[]; moreCount: number };

type AccessLevel = {
  id: PlanTier;
  headerIcon: keyof typeof Ionicons.glyphMap;
  title: string;
  appCount: string;
  caption: string;
  includes?: IncludesSpec;
  categories: AccessCategory[];
};
//Need to update with proper data and svgs in place of icons
const ACCESS_LEVELS: AccessLevel[] = [
  {
    id: 'lite',
    headerIcon: 'layers-outline',
    title: 'Essential Access',
    appCount: '9 apps',
    caption: 'Core apps for essential assistance.',
    categories: [
      {
        title: 'Navigation',
        icons: [
          { name: 'location', color: brandIcons.googleBlue },
          { name: 'navigate', color: brandIcons.googleGreen },
          { name: 'compass', color: brandIcons.googleBlue },
        ],
      },
      {
        title: 'Communication',
        icons: [
          { name: 'logo-whatsapp', color: brandIcons.whatsappGreen },
          { name: 'chatbubble', color: brandIcons.googleBlue },
          { name: 'logo-linkedin', color: brandIcons.linkedinBlue },
          { name: 'person', color: brandIcons.googleBlue },
          { name: 'mail', color: brandIcons.gmailRed },
        ],
      },
      { title: 'Health', icons: [{ name: 'heart', color: brandIcons.healthSlate }] },
    ],
  },
  {
    id: 'balanced',
    headerIcon: 'layers-outline',
    title: 'Everyday Access',
    appCount: '19 apps',
    caption: 'Everyday apps for richer assistance.',
    includes: {
      label: 'Essential Access',
      icons: [
        { name: 'location', color: brandIcons.googleBlue },
        { name: 'logo-whatsapp', color: brandIcons.whatsappGreen },
        { name: 'heart', color: brandIcons.healthSlate },
        { name: 'chatbubble', color: brandIcons.googleBlue },
      ],
      moreCount: 5,
    },
    categories: [
      {
        title: 'Travel',
        icons: [
          { name: 'airplane-outline', color: brandIcons.googleBlue },
          { name: 'car-outline', color: brandIcons.carPink },
          { name: 'train-outline', color: brandIcons.travelOrange },
        ],
      },
      {
        title: 'Entertainment',
        icons: [
          { name: 'musical-notes', color: brandIcons.spotifyGreen },
          { name: 'play-circle', color: colors.black },
          { name: 'logo-youtube', color: colors.brandText },
          { name: 'musical-note', color: brandIcons.appleMusicPink },
        ],
      },
      {
        title: 'Shopping',
        icons: [
          { name: 'pricetag', color: brandIcons.amazonTan },
          { name: 'bag-handle', color: brandIcons.ebayBlue },
          { name: 'logo-apple', color: colors.black },
        ],
      },
    ],
  },
  {
    id: 'complete',
    headerIcon: 'sparkles-outline',
    title: 'Complete Access',
    appCount: '31 apps',
    caption: 'All supported apps for complete assistance.',
    includes: {
      label: 'Everyday Access',
      icons: [
        { name: 'location', color: brandIcons.googleBlue },
        { name: 'musical-notes', color: brandIcons.spotifyGreen },
        { name: 'pricetag', color: brandIcons.amazonTan },
        { name: 'airplane-outline', color: brandIcons.googleBlue },
      ],
      moreCount: 15,
    },
    categories: [
      {
        title: 'Health',
        icons: [
          { name: 'heart', color: brandIcons.healthSlate },
          { name: 'medkit', color: brandIcons.travelOrange },
          { name: 'walk', color: brandIcons.travelOrange },
        ],
      },
      {
        title: 'Family',
        icons: [
          { name: 'people-circle', color: brandIcons.familyPurple },
          { name: 'diamond', color: brandIcons.familyPurple },
        ],
      },
      {
        title: 'Utilities',
        icons: [
          { name: 'cloud', color: brandIcons.googleBlue },
          { name: 'bulb', color: brandIcons.bulbYellow },
          { name: 'document-text', color: colors.black },
          { name: 'flash', color: colors.black },
        ],
      },
      {
        title: 'Community',
        icons: [
          { name: 'logo-instagram', color: brandIcons.instagramPink },
          { name: 'logo-facebook', color: brandIcons.facebookBlue },
          { name: 'chatbubbles', color: brandIcons.whatsappGreen },
        ],
      },
    ],
  },
];

function IconChip({ icon, index, size = 15 }: { icon: IconSpec; index: number; size?: number }) {
  return (
    <View style={[styles.appIcon, index === 0 && styles.appIconFirst, { zIndex: 100 - index }]}>
      <Ionicons name={icon.name} size={size} color={icon.color} />
    </View>
  );
}

function AccessCard({
  level,
  isActive,
  width,
  onSelect,
}: {
  level: AccessLevel;
  isActive: boolean;
  width: number;
  onSelect: (id: PlanTier) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.accessCard, { width }, isActive && styles.accessCardActive]}
      onPress={() => onSelect(level.id)}
    >
      <LinearGradient {...CARD_HEADER_GRADIENT} style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name={level.headerIcon} size={18} color={colors.white} />
          <Text style={styles.cardHeaderText}>{level.title}</Text>
        </View>
        {level.id === 'lite' ? (
          <View style={styles.appCount}>
            <Text style={styles.appCountText}>{level.appCount}</Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.cardBody}>
        <Text style={styles.cardCaption}>{level.caption}</Text>

        {level.id === 'lite' ? (
          <>
            {level.includes ? (
              <View style={styles.includesBox}>
                <View style={styles.includesHeader}>
                  <Ionicons name="layers-outline" size={13} color={colors.textPrimary} />
                  <Text style={styles.includesLabel}>
                    Everything in <Text style={styles.includesLabelBold}>{level.includes.label}</Text>
                  </Text>
                </View>
                <View style={styles.includesRow}>
                  <View style={styles.appIcons}>
                    {level.includes.icons.map((icon, i) => (
                      <IconChip key={i} index={i} icon={icon} size={14} />
                    ))}
                  </View>
                  <View style={styles.morePill}>
                    <Text style={styles.morePillText}>+{level.includes.moreCount} apps</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.categoryGrid}>
              {level.categories.map((category) => (
                <View key={category.title} style={styles.category}>
                  <Text style={styles.categoryTitle}>{category.title}</Text>
                  <View style={styles.appIcons}>
                    {category.icons.map((icon, i) => (
                      <IconChip key={i} index={i} icon={icon} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.comingSoonBox}>
            <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.comingSoonText}>Coming soon</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// --------------------------------------------------
// SCREEN
// --------------------------------------------------

export default function PlanSelectionScreen({ navigation }: Props) {
  const { planTier, setPlanTier } = useOnboarding();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const CARD_WIDTH = cardWidth(screenWidth);
  const SNAP = CARD_WIDTH + CARD_GAP;

  // One place that changes the tier, so tapping a card and scrolling to it
  // behave identically. Previously the tap path ran a fade and the scroll path
  // didn't, and the fade was never bound to anything anyway.
  const commitTier = useCallback(
    (tier: PlanTier) => {
      if (tier === planTier) return;
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      setPlanTier(tier);
    },
    [planTier, setPlanTier, fade],
  );

  const selectTier = useCallback(
    (tier: PlanTier) => {
      const index = ACCESS_LEVELS.findIndex((l) => l.id === tier);
      if (index >= 0) scrollRef.current?.scrollTo({ x: index * SNAP, animated: true });
      commitTier(tier);
    },
    [commitTier, SNAP],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / SNAP);
      const level = ACCESS_LEVELS[Math.max(0, Math.min(index, ACCESS_LEVELS.length - 1))];
      if (level) commitTier(level.id);
    },
    [commitTier, SNAP],
  );

  return (
    <View style={styles.container}>
      <LinearGradient {...BANNER_GRADIENT} style={styles.heroBanner}>
        <StepHeader onBack={() => navigation.goBack()} overlay />
        <TierHero topInset={insets.top} />
      </LinearGradient>

      {/* Vertical ScrollView so the tallest card sets its own height instead of
          being squeezed into the leftover viewport and clipped. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <StepProgressBar step={3} totalSteps={5} />

        <View style={styles.cardsViewport}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsContent}
            decelerationRate="fast"
            snapToInterval={SNAP}
            onMomentumScrollEnd={handleScroll}
          >
            {ACCESS_LEVELS.map((level) => (
              <AccessCard
                key={level.id}
                level={level}
                width={CARD_WIDTH}
                isActive={planTier === level.id}
                onSelect={selectTier}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.selectionIndicator} pointerEvents="none">
          <SelectionFan width={screenWidth - BODY_SIDE_PADDING * 2} />
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('AppPermissions')}>
          <Animated.Text style={[styles.ctaText]}>
            Select {TIER_LABELS[planTier]} & Continue
          </Animated.Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={() => navigation.navigate('Consent')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },

  // No backgroundColor — the LinearGradient supplies the fill.
  heroBanner: {
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radii.xxl,
    borderBottomRightRadius: radii.xxl,
    position: 'relative',
    zIndex: 1,
  },

  hero: {
    alignItems: 'center',
    paddingHorizontal: BODY_SIDE_PADDING,
  },

  heroTitle: {
    ...typography.title,
    color: colors.white,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '700',
    marginTop: 26,
  },

  heroSubtitle: {
    ...typography.caption,
    color: colors.white,
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
    opacity: 0.92,
  },

  ringArea: {
    width: '100%',
    height: RING_AREA_HEIGHT,
    marginTop: spacing.xs,
  },

  // The arc runs the full screen width while the hero is inset.
  arcSvg: {
    position: 'absolute',
    left: -BODY_SIDE_PADDING,
    top: 0,
  },

  heroBubble: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 4,
  },

  // --------------------------------------------------
  // WHITE SHEET
  // --------------------------------------------------
  // Padding lives on bodyContent — on a ScrollView, padding in `style` sits
  // outside the scrollable area and reserves nothing.

  body: {
    flex: 1,
    backgroundColor: colors.white,
    marginTop: -25,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    zIndex: 2,
  },

  bodyContent: {
    paddingTop: spacing.xl,
    paddingHorizontal: BODY_SIDE_PADDING,
    paddingBottom: 150, // clears the absolutely-positioned actions block
  },

  // --------------------------------------------------
  // CARDS
  // --------------------------------------------------
  // No overflow:'hidden' — that clipped the taller cards. The header and body
  // carry their own corner radii instead.

  cardsViewport: {
    marginHorizontal: -BODY_SIDE_PADDING,
    overflow: 'visible',
  },

  cardsContent: {
    paddingLeft: BODY_SIDE_PADDING,
    paddingRight: BODY_SIDE_PADDING,
    gap: CARD_GAP,
    marginTop: 22,
  },

  accessCard: {
    minHeight: 334,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: PINK_BORDER,
    backgroundColor: colors.white,
  },

  // isActive was accepted and never used — the selected card had no visual
  // state at all.
  accessCardActive: {
    borderColor: withOpacity(colors.accentRed, 0.55),
    shadowColor: colors.accentRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },

  cardHeader: {
    height: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
  },

  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },

  cardHeaderText: { ...typography.bodyBold, color: colors.white, fontSize: 17 },

  appCount: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.white, 0.65),
    backgroundColor: withOpacity(colors.white, 0.08),
  },

  appCountText: { ...typography.small, color: colors.white, fontSize: 11, lineHeight: 14 },

  // flex:1 absorbs the stretch a horizontal ScrollView applies to match the
  // tallest card. That filler is pink in the reference too — the Essential card
  // genuinely ends in ~80pt of empty body, not in white.
  cardBody: {
    flex: 1,
    backgroundColor: PINK_BODY,
    paddingHorizontal: 18,
    paddingTop: spacing.lg,
    paddingBottom: 18,
    borderBottomLeftRadius: 23,
    borderBottomRightRadius: 23,
  },

  cardCaption: { ...typography.small, color: colors.textPrimary, fontSize: 13, marginBottom: 14 },

  includesBox: {
    borderWidth: 1,
    borderColor: withOpacity(colors.accentRed, 0.35),
    borderRadius: 14,
    backgroundColor: PINK_TILE,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: 14,
  },

  includesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },

  includesLabel: { ...typography.small, fontSize: 12, color: colors.textPrimary },

  includesLabelBold: { fontWeight: '700' },

  includesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  morePill: { paddingHorizontal: 10, paddingVertical: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.neutralFillLight },

  morePillText: { ...typography.small, fontSize: 10, color: colors.textSecondary },

  // --------------------------------------------------
  // CATEGORY GRID
  // --------------------------------------------------
  // Reference: 143pt tiles with a 7pt gutter inside a 293pt content box, i.e.
  // 48.8%. 48.7% is used so rounding can never push the pair over and wrap.

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },

  comingSoonBox: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  comingSoonText: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 14 },

  category: {
    width: '48.7%',
    minHeight: 72,
    borderRadius: radii.md,
    backgroundColor: PINK_TILE,
    paddingHorizontal: 11,
    paddingVertical: spacing.md,
  },

  categoryTitle: { ...typography.small, color: colors.textPrimary, fontSize: 13, marginBottom: spacing.sm },

  appIcons: { flexDirection: 'row', alignItems: 'center' },

  // 25pt chips on a 19pt pitch in the reference — hence -6.
  appIcon: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
    marginLeft: -6,
  },

  appIconFirst: { marginLeft: 0 },

  // --------------------------------------------------
  // SELECTION FAN
  // --------------------------------------------------
  // marginTop 0: in the reference the disc's TOP edge sits exactly on the
  // card's bottom border, so the whole disc hangs below the card.

  selectionIndicator: {
    height: FAN_HEIGHT,
    alignItems: 'center',
    marginTop: 0,
    zIndex: 5,
  },

  indicatorCircle: {
    position: 'absolute',
    top: 0,
    width: FAN_DISC,
    height: FAN_DISC,
    borderRadius: FAN_DISC / 2,
    backgroundColor: CTA_RED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },

  // --------------------------------------------------
  // BOTTOM ACTIONS
  // --------------------------------------------------

  actions: {
    paddingTop: spacing.xs,
    position: 'absolute',
    left: BODY_SIDE_PADDING,
    right: BODY_SIDE_PADDING,
    bottom: 0,
    zIndex: 10,
  },

  cta: {
    height: 56,
    backgroundColor: '#f00405',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    elevation: 3,
    shadowColor: '#f00405',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  ctaText: { color: colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },

  skipButton: {
    height: 56,
    backgroundColor: '#f3f3f3',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },

  skipText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
});