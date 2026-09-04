import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
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
// LAYOUT
// --------------------------------------------------

const BODY_SIDE_PADDING = 20; // matches the CTA gutter, so the centred card lines up with it

// Breathing room between the fan and the actions block on a screen tall enough
// that the two would otherwise be flush.
const ACTIONS_CLEARANCE = 24;

function cardWidth(screenWidth: number) {
  return screenWidth - BODY_SIDE_PADDING * 2;
}

// --------------------------------------------------
// CAROUSEL — STACKED FAN
// --------------------------------------------------
// The cards are NOT in a scroller. All three are absolutely positioned at the
// same spot, bottom-anchored and horizontally centred, and one continuous
// `progress` value (0..n-1) drives every card's offset, lean, scale, fade and
// stacking order. Side cards sit BEHIND the centred one and poke out by peek.
//
// This is the whole reason a ScrollView can't reproduce the design: in a
// scroller the cards are laid out side by side in flow, so they can never
// overlap. Tuning tilt and spacing gets closer but never arrives. Don't
// "simplify" this back into a horizontal ScrollView.

const SIDE_SCALE = 0.75;        // scale of an off-centre card
const LEAN = 8;                 // degrees a side card leans away from centre
const SIDE_PEEK = 250;          // px of a side card left visible past the centred card
const DRAG_PX_PER_STEP = 260;   // finger travel needed to move one whole step
const FADE_OUT = 1.4;           // distance (in steps) at which a card is fully gone

// The side card's near edge tucks UNDER the centred card, so the offset is the
// gap between the two half-widths plus the sliver we actually want to see.
function computePeek(cardW: number) {
  return Math.round((cardW / 2) * (1 - SIDE_SCALE) + SIDE_PEEK);
}

// Release spring, and the pin's snap-back.
const SNAP_SPRING = { stiffness: 280, damping: 30, mass: 1 };
const PIN_SPRING = { stiffness: 620, damping: 26, mass: 1 };

// Pin lean: the fixed centre pin nudges toward the swipe direction while the
// finger is moving, then springs back.
const PIN_MAX = 18;    // px either side of centre
const PIN_GAIN = 0.014; // velocity (px/s) → lean px

// --------------------------------------------------
// SKIN FLIP
// --------------------------------------------------
// Selection is a DISCRETE state with a delay, not a function of scroll
// position. When progress crosses into a new card's detent, the skin flip waits
// SKIN_DELAY before following, then crossfades over SKIN_FADE. That delay is
// what makes the outgoing card hold its colour past the midpoint while the
// incoming one is still dark — and because it's a timer rather than a curve
// over distance, it behaves identically swiping forwards or backwards.
const SKIN_DELAY = 220;
const SKIN_FADE = 300;

const PINK_BODY = colors.bubbleFill; // card body fill
const PINK_TILE = colors.pinkTile;   // category tile fill
const CTA_RED = colors.brandBackGround;

const MONO = {
  headerStart: '#262626',
  headerEnd: '#0B0B0B',
  border: '#111111',
  body: '#F6F6F6',
  tile: '#ECECEC',
  tileBorder: '#D6D6D6',
  pill: '#E2E2E2',
  glyph: '#8C8C8C',
  text: '#454545',
  textMuted: '#7A7A7A',
};

// --------------------------------------------------
// GRADIENTS
// --------------------------------------------------

/**
 * Convert a CSS `linear-gradient(Ndeg, ...)` angle into expo-linear-gradient
 * start/end points for a box of a given size. CSS measures the angle against
 * the real box; expo measures against a unit square, so the direction has to
 * be divided by the box dimensions before it's renormalised.
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

const BANNER_GRADIENT = {
  colors: [colors.gradientBannerStart, colors.gradientBannerEnd] as const,
  locations: [0.0694, 0.9397] as const,
  start: { x: 0, y: 0.32 },
  end: { x: 1, y: 0.68 },
};

const CARD_HEADER_GRADIENT = {
  colors: [colors.gradientCardStart, colors.gradientCardEnd] as const,
  locations: [0.0152, 0.5903] as const,
  start: { x: 0.56, y: 0 },
  end: { x: 0.44, y: 1 },
};

// Same geometry, mono ink — so the two faces line up pixel for pixel and the
// cross-fade reads as a desaturation rather than a slide.
const CARD_HEADER_GRADIENT_MONO = {
  colors: [MONO.headerStart, MONO.headerEnd] as const,
  locations: CARD_HEADER_GRADIENT.locations,
  start: CARD_HEADER_GRADIENT.start,
  end: CARD_HEADER_GRADIENT.end,
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

// --------------------------------------------------
// HERO BUBBLES
// --------------------------------------------------
// The trio cycles on a timer. Each swap flips the icon in edge-on (rotateY),
// hops the bubble, and staggers left→right. The centre bubble is the "hero":
// bigger, with an extra halo and a pulsing ring behind it.

const HERO_INTERVAL = 3800;
const HERO_FLIP_MS = 500;
const HERO_HOP_MS = 600;
const HERO_PULSE_MS = 2400;
const HERO_HOP_RISE = 6;

// Stagger, left → right. Reference uses 0 / 0.12 / 0.24s.
const HERO_STAGGER = [0, 120, 240];

const HERO_SIDE_SIZE = 40;
const HERO_CENTRE_SIZE = 48;
// Outer box for the centre bubble — holds the halos and the pulse ring around
// the icon face. Side bubbles just get a thin halo ring (size + 10).
const HERO_HALO = 68;

type HeroBubbleSpec = { icon: keyof typeof Ionicons.glyphMap; glyphColor: string };

// TODO(asset): these should be the real app marks (and the centre one the
// two-tone Veda glyph), not Ionicons — swap when the SVGs land. The cycling
// structure below doesn't change when they do.
const HERO_STATES: HeroBubbleSpec[][] = [
  [
    { icon: 'navigate', glyphColor: brandIcons.googleBlue },
    { icon: 'heart', glyphColor: colors.accentRed },
    { icon: 'medkit', glyphColor: brandIcons.healthSlate },
  ],
  [
    { icon: 'document-text', glyphColor: colors.black },
    { icon: 'mail', glyphColor: brandIcons.gmailRed },
    { icon: 'chatbubbles', glyphColor: brandIcons.googleBlue },
  ],
  [
    { icon: 'bag-handle', glyphColor: brandIcons.ebayBlue },
    { icon: 'pricetag', glyphColor: brandIcons.amazonTan },
    { icon: 'cart', glyphColor: brandIcons.travelOrange },
  ],
];

function HeroIconBadge({
  spec,
  cycle,
  left,
  top,
  size,
  hero = false,
  delay,
  reduceMotion,
}: {
  spec: HeroBubbleSpec;
  cycle: number;
  left: number;
  top: number;
  size: number;
  hero?: boolean;
  delay: number;
  reduceMotion: boolean;
}) {
  const box = hero ? HERO_HALO : size + 10;

  // One driver for the icon swap: 0 = outgoing icon face-on, 1 = incoming
  // face-on. Both faces stay mounted and read off this single value, so they
  // can't settle at different moments the way two separate animations would.
  const flip = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const [faces, setFaces] = useState({ prev: spec, current: spec });
  const mounted = useRef(false);

  useEffect(() => {
    // Don't animate the very first render — the trio just appears.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    setFaces((f) => ({ prev: f.current, current: spec }));

    if (reduceMotion) {
      flip.setValue(1);
      hop.setValue(0);
      return;
    }

    flip.setValue(0);
    hop.setValue(0);

    Animated.parallel([
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(flip, {
          toValue: 1,
          duration: HERO_FLIP_MS,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]),
      // The hop: up, then back with a slight overshoot on the way down.
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(hop, {
          toValue: 1,
          duration: HERO_HOP_MS / 2,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: HERO_HOP_MS / 2,
          easing: Easing.bezier(0.34, 1.2, 0.64, 1),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  // Radar-ping ring on the centre bubble only. The reference's [1, 1.4, 1.4]
  // keyframes expand over the first half then HOLD invisible for the rest —
  // a ping with a rest beat, not a continuous throb. Reproduced here by
  // interpolating a single 0→1 loop across three stops.
  useEffect(() => {
    if (!hero || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: HERO_PULSE_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [hero, reduceMotion, pulse]);

  const hopY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -HERO_HOP_RISE] });

  const incoming = {
    rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['-100deg', '0deg'] }),
    opacity: flip.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
  };
  const outgoing = {
    rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '100deg'] }),
    // Gone by the time the incoming face is anywhere near flat.
    opacity: flip.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.3, 0] }),
  };

  const faceInset = (box - size) / 2;
  const ringInset = (HERO_HALO - size) / 2;

  return (
    <Animated.View
      style={[
        styles.heroBubbleBox,
        {
          left: left - box / 2 - BODY_SIDE_PADDING,
          top: top - box / 2,
          width: box,
          height: box,
          transform: [{ translateY: hopY }],
        },
      ]}
    >
      {/* Halo rings */}
      <View style={[styles.heroHalo, { borderRadius: box / 2 }]} />
      {hero && (
        <>
          <View style={styles.heroHaloInner} />
          {!reduceMotion && (
            <Animated.View
              style={[
                styles.heroPulseRing,
                {
                  top: ringInset,
                  left: ringInset,
                  right: ringInset,
                  bottom: ringInset,
                  borderRadius: size / 2,
                  opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 0, 0] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.4, 1.4] }) },
                  ],
                },
              ]}
            />
          )}
        </>
      )}

      {/* Icon face — both the outgoing and incoming marks are mounted and
          cross-driven by `flip`, since RN has no AnimatePresence. */}
      <View
        style={[
          styles.heroBubbleFace,
          { top: faceInset, left: faceInset, width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Animated.View
          style={[
            styles.heroFace,
            { opacity: outgoing.opacity, transform: [{ perspective: 500 }, { rotateY: outgoing.rotateY }] },
          ]}
        >
          <Ionicons name={faces.prev.icon} size={size * 0.45} color={faces.prev.glyphColor} />
        </Animated.View>

        <Animated.View
          style={[
            styles.heroFace,
            { opacity: incoming.opacity, transform: [{ perspective: 500 }, { rotateY: incoming.rotateY }] },
          ]}
        >
          <Ionicons name={faces.current.icon} size={size * 0.45} color={faces.current.glyphColor} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function TierHero({ topInset }: { topInset: number }) {
  const { width } = useWindowDimensions();
  const [cycle, setCycle] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCycle((c) => (c + 1) % HERO_STATES.length), HERO_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const state = HERO_STATES[cycle];

  return (
    <View style={[styles.hero, { marginTop: topInset + 16 }]}>
      <Text style={styles.heroTitle}>{HERO_TITLE}</Text>
      <Text style={styles.heroSubtitle}>{HERO_SUBTITLE}</Text>

      <View style={styles.ringArea}>
        <Svg width={width} height={RING_AREA_HEIGHT} style={styles.arcSvg}>
          <Path d={arcPath(width)} stroke={withOpacity(colors.white, 0.3)} strokeWidth={1} fill="none" />
        </Svg>

        {state.map((spec, i) => {
          const cx = width * BUBBLE_X_FRACTIONS[i];
          const cy = arcY(cx, width);
          const hero = i === 1;
          return (
            <HeroIconBadge
              key={i}
              spec={spec}
              cycle={cycle}
              left={cx}
              top={cy}
              size={hero ? HERO_CENTRE_SIZE : HERO_SIDE_SIZE}
              hero={hero}
              delay={HERO_STAGGER[i]}
              reduceMotion={reduceMotion}
            />
          );
        })}
      </View>
    </View>
  );
}

// --------------------------------------------------
// SELECTION FAN
// --------------------------------------------------
// A dome, not a sunburst. The pivot sits BELOW the ticks, so the crown arches
// upward under the disc and the ends fall away. Anything radiating from the
// disc itself produces the opposite — an inner edge that dips in the middle —
// no matter how the numbers are tuned.

const FAN_DISC = 30;
const FAN_TICKS = 17;       // keep odd — the middle one is replaced by the spine
const FAN_GAP = 15;          // clear space under the disc, spanned by the spine
const FAN_RX = 91;         // horizontal half-span of the crown
const FAN_RY = 18;          // how far the ends drop below the crown's peak
const FAN_TICK = 12;        // tick length — constant across the sweep
const FAN_SPREAD_DEG = 30;  // half-sweep; smaller = flatter, steeper end ticks
// The disc straddles the card's bottom edge rather than sitting clear below it,
// so it reads as a badge pinned to the card corner. 0 centres the disc exactly
// on the border (half in, half out) — see the marginTop math in styles below.
const FAN_TOP_SPACING = 0;
const FAN_HEIGHT = FAN_DISC / 2 + FAN_GAP + FAN_RY + FAN_TICK + 4;

const FAN_SPINE_ALPHA = 0.8;
const FAN_CENTRE_INDEX = (FAN_TICKS - 1) / 2;

function SelectionFan({ width, pinX }: { width: number; pinX: Animated.Value }) {
  const cx = width / 2;
  const cy = FAN_DISC / 2;

  const peakY = cy + FAN_GAP;
  const spread = (FAN_SPREAD_DEG * Math.PI) / 180;
  const a = FAN_RX / Math.sin(spread);
  const b = FAN_RY / (1 - Math.cos(spread));
  const pivotY = peakY + b;

  return (
    <View style={{ width, height: FAN_HEIGHT }}>
      <Svg width={width} height={FAN_HEIGHT} style={StyleSheet.absoluteFill}>
        {Array.from({ length: FAN_TICKS }, (_, i) => {
          if (i === FAN_CENTRE_INDEX) return null;

          const t = i / (FAN_TICKS - 1);
          const theta = -spread + 2 * spread * t;

          const px = cx + a * Math.sin(theta);
          const py = peakY + b * (1 - Math.cos(theta));

          const dx = cx - px;
          const dy = pivotY - py;
          const len = Math.hypot(dx, dy);

          const centred = 1 - Math.abs(t * 2 - 1);

          return (
            <Line
              key={i}
              x1={px}
              y1={py}
              x2={px + (dx / len) * FAN_TICK}
              y2={py + (dy / len) * FAN_TICK}
              stroke={withOpacity(colors.accentRed, 0.08 + 0.2 * centred)}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          );
        })}

        <Line
          x1={cx}
          y1={cy + FAN_DISC / 2}
          x2={cx}
          y2={FAN_HEIGHT - 1}
          stroke={withOpacity(colors.accentRed, FAN_SPINE_ALPHA)}
          strokeWidth={1.4}
          strokeLinecap="round"
          // stroke={withOpacity(colors.accentRed, 0.8)}
        />
      </Svg>

      {/* The pin leans toward the swipe while the finger is moving. */}
      <Animated.View
        style={[
          styles.indicatorCircle,
          { left: cx - FAN_DISC / 2, transform: [{ translateX: pinX }] },
        ]}
      >
        <Ionicons name="checkmark" size={17} color={colors.white} />
      </Animated.View>
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
      { title: 'Travel', icons: [{ name: 'car-outline', color: brandIcons.carPink }] },
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

function IconChip({
  icon,
  index,
  size = 15,
  mono = false,
}: {
  icon: IconSpec;
  index: number;
  size?: number;
  mono?: boolean;
}) {
  return (
    <View
      style={[
        styles.appIcon,
        mono && styles.appIconMono,
        index === 0 && styles.appIconFirst,
        { zIndex: 100 - index },
      ]}
    >
      <Ionicons name={icon.name} size={size} color={mono ? MONO.glyph : icon.color} />
    </View>
  );
}

/**
 * One rendering of a card. Drawn twice per card — once in brand colour, once in
 * mono — and stacked. Keep the two branches structurally identical: any layout
 * difference between them shows up as a ghost during the cross-fade.
 */
function CardFace({
  level,
  mono = false,
  style,
  showComingSoon = false,
}: {
  level: AccessLevel;
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
  showComingSoon?: boolean;
}) {
  const headerGradient = mono ? CARD_HEADER_GRADIENT_MONO : CARD_HEADER_GRADIENT;

  return (
    <View style={[styles.cardFace, mono && styles.cardFaceMono, style]}>
      <LinearGradient {...headerGradient} style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name={level.headerIcon} size={18} color={colors.white} />
          <Text style={styles.cardHeaderText}>{level.title}</Text>
        </View>
        <View style={[styles.appCount, showComingSoon && styles.appCountComingSoon]}>
          <Text style={[!showComingSoon && styles.appCountText, showComingSoon && styles.appCountComingSoonText]}>
            {showComingSoon ? 'Coming soon' : level.appCount}
          </Text>
        </View>
      </LinearGradient>

      <View style={[styles.cardBody, mono && styles.cardBodyMono]}>
        <Text style={[styles.cardCaption, mono && styles.textMono]}>{level.caption}</Text>

        {level.includes ? (
          <View style={[styles.includesBox, mono && styles.includesBoxMono]}>
            <View style={styles.includesHeader}>
              <Ionicons
                name="layers-outline"
                size={13}
                color={mono ? MONO.text : colors.textPrimary}
              />
              <Text style={[styles.includesLabel, mono && styles.textMono]}>
                Everything in <Text style={styles.includesLabelBold}>{level.includes.label}</Text>
              </Text>
            </View>
            <View style={styles.includesRow}>
              <View style={styles.appIcons}>
                {level.includes.icons.map((icon, i) => (
                  <IconChip key={i} index={i} icon={icon} size={14} mono={mono} />
                ))}
              </View>
              <View style={[styles.morePill, mono && styles.morePillMono]}>
                <Text style={[styles.morePillText, mono && styles.textMutedMono]}>
                  +{level.includes.moreCount} apps
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.categoryGrid}>
          {level.categories.map((category) => (
            <View key={category.title} style={[styles.category, mono && styles.categoryMono]}>
              <Text style={[styles.categoryTitle, mono && styles.textMono]}>{category.title}</Text>
              <View style={styles.appIcons}>
                {category.icons.map((icon, i) => (
                  <IconChip key={i} index={i} icon={icon} mono={mono} />
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function FannedCard({
  level,
  index,
  progress,
  cardW,
  cardH,
  peekX,
  selected,
  stackOrder,
  onMeasureHeight,
  onSelect,
}: {
  level: AccessLevel;
  index: number;
  progress: Animated.Value;
  cardW: number;
  cardH: number;
  peekX: number;
  selected: boolean;
  stackOrder: number;
  onMeasureHeight: (h: number) => void;
  onSelect: (id: PlanTier) => void;
}) {
  const range = [index - 1, index, index + 1];

  const translateX = progress.interpolate({
    inputRange: range,
    outputRange: [peekX, 0, -peekX],
    extrapolate: 'clamp',
  });

  const rotate = progress.interpolate({
    inputRange: range,
    outputRange: [`${LEAN}deg`, '0deg', `${-LEAN}deg`],
    extrapolate: 'clamp',
  });

  const scale = progress.interpolate({
    inputRange: range,
    outputRange: [SIDE_SCALE, 1, SIDE_SCALE],
    extrapolate: 'clamp',
  });

  const opacity = progress.interpolate({
    inputRange: [index - FADE_OUT, index - 1, index + 1, index + FADE_OUT],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  // The skin flip is a plain timed crossfade off the `selected` boolean, not a
  // function of progress — see SKIN_DELAY.
  const skin = useRef(new Animated.Value(selected ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(skin, {
      toValue: selected ? 0 : 1,
      duration: SKIN_FADE,
      useNativeDriver: true,
    }).start();
  }, [selected, skin]);

  // RN has no transformOrigin before 0.76, and relying on it would be a version
  // gamble. Shifting down half a card, transforming, then shifting back gives
  // the same result as `transform-origin: bottom center` on any version: the
  // cards pivot and scale from a shared bottom shelf, so the centred card's
  // base stays put while its neighbours grow and shrink around it.
  const half = (cardH || 334) / 2;

  return (
    <Animated.View
      style={[
        styles.fannedCard,
        {
          marginLeft: -cardW / 2,
          width: cardW,
          zIndex: stackOrder,
          // Android draws by elevation, ignoring zIndex, so the two have to
          // agree or the stacking order silently inverts on Android only.
          elevation: stackOrder,
          opacity,
          transform: [
            { translateX },
            { translateY: half },
            { rotate },
            { scale },
            { translateY: -half },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.accessCard}
        onPress={() => onSelect(level.id)}
        onLayout={(e: LayoutChangeEvent) => onMeasureHeight(e.nativeEvent.layout.height)}
      >
        {/* Colour face sets the card height. */}
        <CardFace level={level} style={cardH > 0 ? { height: cardH } : undefined} showComingSoon={level.id !== 'lite'} />

        {/* Mono face rides on top and fades out when this card is selected. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: skin }]}
          pointerEvents="none"
        >
          <CardFace level={level} mono style={styles.cardFaceFill} showComingSoon={level.id !== 'lite'} />
        </Animated.View>

        {level.id !== 'lite' && (
          <View style={styles.cardRedOverlay} pointerEvents="none" />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// --------------------------------------------------
// SCREEN
// --------------------------------------------------

export default function PlanSelectionScreen({ navigation }: Props) {
  const { planTier, setPlanTier } = useOnboarding();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const initialIndex = Math.max(0, ACCESS_LEVELS.findIndex((l) => l.id === planTier));

  // The one value that drives the whole fan.
  const progress = useRef(new Animated.Value(initialIndex)).current;
  const pinX = useRef(new Animated.Value(0)).current;

  // Live mirror of progress for the pan maths, plus the drag's starting point.
  const progressNow = useRef(initialIndex);
  const dragBase = useRef(initialIndex);

  // Which card wears the selected skin, and which sits on top. `nearest` tracks
  // the detent immediately; `centerIndex` follows SKIN_DELAY later.
  const [nearest, setNearest] = useState(initialIndex);
  const [centerIndex, setCenterIndex] = useState(initialIndex);
  const skinTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const CARD_WIDTH = cardWidth(screenWidth);
  const peekX = useMemo(() => computePeek(CARD_WIDTH), [CARD_WIDTH]);

  // Tallest natural card height, ratcheted up as each card reports its layout,
  // then forced onto all three so a shorter tier doesn't sit visibly smaller.
  const [cardHeight, setCardHeight] = useState(0);
  const onMeasureCardHeight = useCallback((h: number) => {
    setCardHeight((prev) => (h > prev ? h : prev));
  }, []);
  useEffect(() => {
    setCardHeight(0);
  }, [CARD_WIDTH]);

  const [actionsHeight, setActionsHeight] = useState(160);
  const onActionsLayout = useCallback((e: LayoutChangeEvent) => {
    setActionsHeight(e.nativeEvent.layout.height);
  }, []);

  const clamp = useCallback(
    (v: number) => Math.max(0, Math.min(ACCESS_LEVELS.length - 1, v)),
    [],
  );

  // Watch progress for detent crossings. One listener, one setState per
  // crossing — not per frame.
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      progressNow.current = value;
      const rounded = Math.round(clamp(value));
      setNearest((prev) => {
        if (prev === rounded) return prev;
        clearTimeout(skinTimer.current);
        skinTimer.current = setTimeout(() => setCenterIndex(rounded), SKIN_DELAY);
        return rounded;
      });
    });
    return () => {
      progress.removeListener(id);
      clearTimeout(skinTimer.current);
    };
  }, [progress, clamp]);

  // The committed tier follows the delayed skin flip, so the CTA label changes
  // in step with the card that's actually wearing the selected skin.
  useEffect(() => {
    const tier = ACCESS_LEVELS[centerIndex]?.id;
    if (tier && tier !== planTier) setPlanTier(tier);
  }, [centerIndex, planTier, setPlanTier]);

  const settle = useCallback(() => {
    const idx = Math.round(clamp(progressNow.current));
    Animated.spring(progress, {
      toValue: idx,
      ...SNAP_SPRING,
      useNativeDriver: false,
    }).start();
    Animated.spring(pinX, { toValue: 0, ...PIN_SPRING, useNativeDriver: false }).start();
  }, [clamp, progress, pinX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim the gesture once it's clearly a horizontal drag, so taps
        // still reach the cards underneath.
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          progress.stopAnimation((v) => {
            progressNow.current = v;
            dragBase.current = v;
          });
          pinX.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
          progress.setValue(clamp(dragBase.current - g.dx / DRAG_PX_PER_STEP));
          // gestureState.vx is px/ms; PIN_GAIN is calibrated against px/s.
          const lean = g.vx * 1000 * PIN_GAIN;
          pinX.setValue(Math.max(-PIN_MAX, Math.min(PIN_MAX, lean)));
        },
        onPanResponderRelease: settle,
        onPanResponderTerminate: settle,
      }),
    [clamp, progress, pinX, settle],
  );

  const selectTier = useCallback(
    (tier: PlanTier) => {
      const index = ACCESS_LEVELS.findIndex((l) => l.id === tier);
      if (index < 0) return;
      Animated.spring(progress, {
        toValue: index,
        ...SNAP_SPRING,
        useNativeDriver: false,
      }).start();
    },
    [progress],
  );

  return (
    <View style={styles.container}>
      <LinearGradient {...BANNER_GRADIENT} style={styles.heroBanner}>
        <StepHeader onBack={() => navigation.goBack()} overlay />
        <TierHero topInset={insets.top} />
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: actionsHeight + ACTIONS_CLEARANCE },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <StepProgressBar step={3} totalSteps={5} />

        {/* The fan. Fixed height (the tallest card) because every card inside is
            absolutely positioned and so contributes nothing to layout. The pan
            responder lives here, not on the cards, so a drag that starts on a
            side card still moves the whole fan. */}
        <View
          style={[styles.fanViewport, { height: cardHeight || 334 }]}
          {...panResponder.panHandlers}
        >
          {ACCESS_LEVELS.map((level, i) => (
            <FannedCard
              key={level.id}
              level={level}
              index={i}
              progress={progress}
              cardW={CARD_WIDTH}
              cardH={cardHeight}
              peekX={peekX}
              selected={i === centerIndex}
              // Nearest card on top, the rest ordered by distance behind it.
              stackOrder={100 - Math.abs(i - nearest) * 10}
              onMeasureHeight={onMeasureCardHeight}
              onSelect={selectTier}
            />
          ))}
        </View>

        <View style={styles.selectionIndicator} pointerEvents="none">
          <SelectionFan width={screenWidth - BODY_SIDE_PADDING * 2} pinX={pinX} />
        </View>

        <View style={styles.bodySpacer} />
      </ScrollView>

      <View
        style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 10) }]}
        onLayout={onActionsLayout}
      >
        <TouchableOpacity
          style={[
            styles.cta,
            (planTier === 'balanced' || planTier === 'complete') && styles.ctaDisabled,
          ]}
          onPress={() => planTier === 'lite' && navigation.navigate('AppPermissions')}
          disabled={planTier === 'balanced' || planTier === 'complete'}
        >
          <Text style={styles.ctaText}>
            {planTier === 'lite'
              ? `Select ${TIER_LABELS[planTier]} & Continue`
              : 'Notify Me'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.skipButton,
            (planTier === 'balanced' || planTier === 'complete') && styles.skipButtonDisabled,
          ]}
          onPress={() => planTier === 'lite' && navigation.navigate('Consent')}
          disabled={planTier === 'balanced' || planTier === 'complete'}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },

  heroBanner: {
    paddingBottom: spacing.md,
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

  arcSvg: {
    position: 'absolute',
    left: -BODY_SIDE_PADDING,
    top: 0,
  },

  // --------------------------------------------------
  // HERO BUBBLES
  // --------------------------------------------------

  heroBubbleBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroHalo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withOpacity(colors.white, 0.06),
  },

  heroHaloInner: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: (HERO_HALO - 12) / 2,
    backgroundColor: withOpacity(colors.white, 0.1),
  },

  heroPulseRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: withOpacity(colors.white, 0.4),
  },

  heroBubbleFace: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },

  heroFace: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },

  // --------------------------------------------------
  // WHITE SHEET
  // --------------------------------------------------
  // overflow hidden is load-bearing now: the side cards translate most of a
  // screen width sideways, and this is what crops them into slivers.

  body: {
    flex: 1,
    backgroundColor: colors.white,
    marginTop: -25,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    zIndex: 2,
  },

  bodyContent: {
    flexGrow: 1,
    paddingTop: spacing.xl,
    paddingHorizontal: BODY_SIDE_PADDING,
  },

  bodySpacer: { flex: 1 },

  // --------------------------------------------------
  // FAN
  // --------------------------------------------------

  fanViewport: {
    marginTop: spacing.lg,
    marginHorizontal: -BODY_SIDE_PADDING,
    position: 'relative',
  },

  // Bottom-anchored and centred by hand (left 50% then pulled back half a card)
  // rather than by flex alignment, which is unreliable for absolute children.
  fannedCard: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
  },

  accessCard: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },

  cardFace: {
    width: '100%',
    minHeight: 334,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.accentRed,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },

  cardFaceMono: { borderColor: MONO.border },

  cardFaceFill: { flex: 1, minHeight: 0 },

  cardHeader: {
    height: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
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

  appCountComingSoon: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: withOpacity(colors.white, 0.6),
    backgroundColor: '#5a3a33',
  },

  appCountComingSoonText: { color: 'rgba(255, 255, 255, 1)', fontSize: 12, fontWeight: '500', lineHeight: 14 },

  cardBody: {
    flex: 1,
    backgroundColor: PINK_BODY,
    paddingHorizontal: 18,
    paddingTop: spacing.lg,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },

  cardBodyMono: { backgroundColor: MONO.body },

  cardCaption: { ...typography.small, color: colors.textPrimary, fontSize: 13, marginBottom: 14 },

  textMono: { color: MONO.text },

  textMutedMono: { color: MONO.textMuted },

  includesBox: {
    borderWidth: 1,
    borderColor: withOpacity(colors.accentRed, 0.35),
    borderRadius: 14,
    backgroundColor: PINK_TILE,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: 14,
  },

  includesBoxMono: { borderColor: MONO.tileBorder, backgroundColor: MONO.tile },

  includesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },

  includesLabel: { ...typography.small, fontSize: 12, color: colors.textPrimary },

  includesLabelBold: { fontWeight: '700' },

  includesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  morePill: { paddingHorizontal: 10, paddingVertical: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.neutralFillLight },

  morePillMono: { backgroundColor: MONO.pill },

  morePillText: { ...typography.small, fontSize: 10, color: colors.textSecondary },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },

  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withOpacity(colors.white, 0.8),
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 22,
    zIndex: 999,
  },

  cardOverlayText: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 14 },

  cardRedOverlay: {
    position: 'absolute',
    top: 59,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withOpacity('#f00405', 0.3),
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    zIndex: 999,
  },

  category: {
    width: '48.7%',
    minHeight: 72,
    borderRadius: radii.md,
    backgroundColor: PINK_TILE,
    paddingHorizontal: 11,
    paddingVertical: spacing.md,
  },

  categoryMono: { backgroundColor: MONO.tile },

  categoryTitle: { ...typography.small, color: colors.textPrimary, fontSize: 13, marginBottom: spacing.sm },

  appIcons: { flexDirection: 'row', alignItems: 'center' },

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

  appIconMono: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  appIconFirst: { marginLeft: 0 },

  // --------------------------------------------------
  // SELECTION FAN
  // --------------------------------------------------
  // The cards no longer sit in a scroller with its own bottom padding, so the
  // offset is just enough to straddle the card's bottom border.

  selectionIndicator: {
    height: FAN_HEIGHT,
    alignItems: 'center',
    marginTop: FAN_TOP_SPACING - FAN_DISC / 2,
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
    backgroundColor: colors.white,
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

  ctaDisabled: {
    opacity: 0.5,
  },

  skipButton: {
    height: 56,
    backgroundColor: '#f3f3f3',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },

  skipButtonDisabled: {
    opacity: 0.4,
  },

  skipText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
});