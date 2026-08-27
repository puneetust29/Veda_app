import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '../../theme';

/**
 * Ambient orbit artwork for the landing screen.
 *
 * Everything in this file is expressed in FIGMA FRAME COORDINATES (a 414x882
 * box) and converted to device points by a single uniform scale. There are no
 * hand-tuned ratios: every number below was read directly out of the exported
 * SVG, so "does this match the design" is answerable by diffing against the
 * export rather than by eye.
 */

const FRAME = { width: 414, height: 882 };

/**
 * Uniform scale from frame space to device points, anchored at the screen's
 * top-left. Exported so the landing screen can place the brand lockup in the
 * same coordinate space — if the logo is centred by flexbox while the rings
 * are scaled from the frame, the two drift apart on any device whose aspect
 * ratio isn't 414:882.
 *
 * Figma logo lockup bounds, for that purpose:
 *   x 159.32..253.28  (w 93.95)   y 339.79..441.67  (h 101.88)
 * Figma CTA: x 24, y 742, w 366, h 56, r 24, #F00405
 */
export function frameLayout(screenWidth: number) {
  const scale = screenWidth / FRAME.width;
  return {
    scale,
    height: FRAME.height * scale,
    /** Convert a frame-space length or coordinate to device points. */
    px: (value: number) => value * scale,
  };
}

/**
 * The brand lockup's own box, straight from Figma (x 159.32..253.28,
 * y 339.79..441.67). It is NOT derived from any ring — in the design the logo
 * and the rings are independently placed, and tying them together drags the
 * logo ~84pt above where it belongs.
 */
const FIGMA_LOCKUP = { x: 159.32, y: 339.79, width: 93.95, height: 101.88 };

export function lockupLayout(screenWidth: number) {
  const scale = screenWidth / FRAME.width;
  return {
    left: FIGMA_LOCKUP.x * scale,
    top: FIGMA_LOCKUP.y * scale,
    width: FIGMA_LOCKUP.width * scale,
    height: FIGMA_LOCKUP.height * scale,
  };
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------

/**
 * The three orbit paths, verbatim from the Figma export (layers Vector_9,
 * Vector_10, Vector_11). They are drawn into a viewBox that IS the frame, so
 * no re-fitting or bounding-box math is needed — and the gradients' own
 * userSpaceOnUse coordinates stay valid as exported.
 *
 * The gradient runs red -> white along a bottom-left to top-right axis. That
 * is deliberate: the screen background is white, so each ring dissolves as it
 * climbs. Do not swap this for a red-with-falling-alpha gradient; with all
 * three rings present the upper area is not bare, and alpha changes the
 * densities where the rings overlap.
 */
const RINGS = [
  {
    id: 'outer',
    strokeWidth: 1.10294,
    gradient: { x1: 187.844, y1: 651.703, x2: 357.551, y2: 170.807 },
    d: 'M403.276 -84.1143C416.292 -84.1142 429.821 -83.0924 438.749 -80.4482C344.497 -59.4155 269.808 30.8246 270.093 133.016C270.093 136.462 270.379 140.148 270.776 141.881L270.851 142.211L271.179 142.293C350.548 162.115 408.188 196.544 446.047 242.931C483.313 288.59 501.454 345.884 502.241 412.361L502.265 415.534C502.647 551.243 398.117 699.859 221.447 700.447C78.9534 700.943 -69.4291 576.829 -71.2485 377.12L-71.2632 374.768L-71.2612 371.652C-70.6505 240.885 -2.02518 115.2 85.7397 39.6475L87.8325 37.8584C175.205 -36.1343 294.861 -83.7217 403.276 -84.1143Z',
  },
  {
    id: 'inner',
    strokeWidth: 1.44363,
    gradient: { x1: 198.701, y1: 544.077, x2: 347.074, y2: 98.0234 },
    d: 'M329.544 98.7451C336.745 98.7452 344.165 99.2598 349.482 100.549C293.233 113.844 248.805 167.488 248.272 228.422L248.269 229.884C248.269 231.979 248.441 234.247 248.692 235.341L248.792 235.772L249.222 235.88C297.368 247.872 332.294 268.692 355.222 296.71C377.789 324.287 388.786 358.903 389.263 399.101L389.277 401.02C389.509 483.051 326.158 572.859 219.108 573.215C132.786 573.515 42.8316 498.513 41.7285 377.745L41.7197 376.322C41.429 295.935 83.9481 218.476 138.208 172.539C191.212 127.771 263.799 98.9829 329.544 98.7451Z',
  },
  {
    id: 'middle',
    strokeWidth: 1.22649,
    gradient: { x1: 192.531, y1: 591.392, x2: 333.153, y2: 192.388 },
    d: 'M371.459 -18.7891C381.992 -18.789 392.912 -17.9861 400.301 -15.9229C322.841 1.64184 261.427 75.3573 260.695 159.159L260.689 161.158C260.689 164.02 260.926 167.091 261.259 168.546L261.343 168.913L261.708 169.004C327.606 185.44 375.446 213.984 406.864 252.428C437.789 290.268 452.848 337.756 453.5 392.868L453.521 395.498C453.838 507.995 367.074 631.18 220.439 631.668C101.715 632.081 -21.9615 528.394 -22.5181 361.683C-22.913 252.341 34.3849 146.971 107.828 83.8301L109.565 82.3467C182.108 20.9932 281.455 -18.4634 371.459 -18.7891Z',
  },
] as const;

const RING_OPACITY = 0.15; // Figma group opacity on all three ring layers
const RING_STROKE = colors.brandText;

function OrbitLines({ width, height }: { width: number; height: number }) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        {RINGS.map((ring) => (
          <LinearGradient
            key={ring.id}
            id={`orbit-${ring.id}`}
            x1={ring.gradient.x1}
            y1={ring.gradient.y1}
            x2={ring.gradient.x2}
            y2={ring.gradient.y2}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={RING_STROKE} />
            <Stop offset="1" stopColor={colors.white} />
          </LinearGradient>
        ))}
      </Defs>
      {RINGS.map((ring) => (
        <G key={ring.id} opacity={RING_OPACITY}>
          <Path d={ring.d} stroke={`url(#orbit-${ring.id})`} strokeWidth={ring.strokeWidth} fill="none" />
        </G>
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

const BUBBLE_FILL = colors.bubbleFill;
const GLYPH_COLOR = colors.brandText;

/**
 * x / y / size are the Figma rect, unmodified. The bubbles are NOT evenly
 * distributed along one curve — six sit on the inner ring, three on the
 * middle, two on the outer, and the top-right pencil floats 26pt clear of
 * every curve. Any scheme that derives these from a single path will fight
 * the artwork forever, which is why they are literals.
 *
 * The bag at x=-23 is half off the left edge in Figma too; the frame's own
 * clip cuts it. Do not nudge it inward.
 *
 * tx / ty is the unit tangent of whichever curve the bubble belongs to, at
 * its nearest point, precomputed from the exported paths. It exists only to
 * give the drift animation a direction that follows the line.
 *
 * TODO(icons): Figma layer names are generic ("Filled_2", "Design"), so the
 * Ionicons below are inferred from position and shape. The export contains
 * the real glyph paths — porting those to react-native-svg components is the
 * only way to match exactly. `bottomCentre` in particular is a guess.
 */
type BubbleSpec = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  x: number;
  y: number;
  size: number;
  tx: number;
  ty: number;
  delay: number;
};

const BUBBLES: BubbleSpec[] = [
  { key: 'pencilTop', icon: 'pencil', x: 307, y: 21, size: 56, tx: -0.7157, ty: 0.6984, delay: 0 },
  { key: 'plane', icon: 'airplane', x: 185, y: 98, size: 64, tx: 0.9141, ty: -0.4056, delay: 300 },
  { key: 'home', icon: 'home', x: 61, y: 201, size: 56, tx: 0.5565, ty: -0.8309, delay: 700 },
  { key: 'chat', icon: 'chatbubble', x: 265, y: 219, size: 56, tx: 0.9151, ty: 0.4033, delay: 100 },
  { key: 'headset', icon: 'headset', x: 344, y: 296, size: 56, tx: 0.4429, ty: 0.8966, delay: 500 },
  { key: 'clock', icon: 'time', x: 9, y: 311, size: 64, tx: 0.1365, ty: -0.9906, delay: 900 },
  { key: 'bag', icon: 'bag-handle', x: -23, y: 472, size: 56, tx: -0.4643, ty: -0.8857, delay: 200 },
  { key: 'pill', icon: 'medkit', x: 317, y: 476, size: 64, tx: -0.6188, ty: 0.7856, delay: 600 },
  { key: 'bottomCentre', icon: 'card', x: 196, y: 602, size: 56, tx: -0.9998, ty: 0.0178, delay: 400 },
  { key: 'heart', icon: 'heart', x: 33, y: 609, size: 64, tx: -0.8104, ty: -0.5859, delay: 800 },
  { key: 'pencilBottom', icon: 'pencil', x: 338, y: 619, size: 56, tx: -0.8395, ty: 0.5434, delay: 1100 },
];

/**
 * Figma's inner icon boxes are inconsistent (24pt in some 56pt bubbles, 32pt
 * in others), so this is a single ratio rather than a per-bubble value. Revisit
 * when the real glyph paths land.
 */
const GLYPH_RATIO = 0.43;

const DRIFT_AMPLITUDE = 4; // frame-space points, scaled with everything else

function useBubbleAnimation(spec: BubbleSpec, scale: number, enabled: boolean) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) {
      anim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, spec.delay, enabled]);

  const drift = DRIFT_AMPLITUDE * scale;

  return {
    // A breathe, not a fade. Only the glyph animates — animating the whole
    // view takes the tint circle with it and washes the cluster out.
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
    translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [drift * spec.tx, -drift * spec.tx] }),
    translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [drift * spec.ty, -drift * spec.ty] }),
  };
}

function Bubble({ spec, scale, animate }: { spec: BubbleSpec; scale: number; animate: boolean }) {
  const { opacity, translateX, translateY } = useBubbleAnimation(spec, scale, animate);
  const size = spec.size * scale;

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: spec.x * scale,
          top: spec.y * scale,
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      <Animated.View style={{ opacity }}>
        <Ionicons name={spec.icon} size={Math.round(size * GLYPH_RATIO)} color={GLYPH_COLOR} />
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------

export default function FloatingIcons() {
  const { width: screenWidth } = useWindowDimensions();
  const { scale, height } = frameLayout(screenWidth);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!cancelled) setAnimate(!reduce);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduce) => setAnimate(!reduce));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <View
      style={[styles.container, { height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <OrbitLines width={screenWidth} height={height} />
      {BUBBLES.map((spec) => (
        <Bubble key={spec.key} spec={spec} scale={scale} animate={animate} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // No overflow:visible needed. The frame IS the screen, so the screen edge
    // clips exactly where Figma's frame clip does — which is what the design
    // shows for the bag icon at x=-23.
  },
  bubble: {
    position: 'absolute',
    backgroundColor: BUBBLE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
});