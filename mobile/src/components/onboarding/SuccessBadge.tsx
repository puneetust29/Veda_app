import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../../theme';

/**
 * The "You're all set!" seal.
 *
 * Measured off the reference render (392pt-wide screen): the blob is an
 * 8-lobe scallop of mean radius 55 with ±5.4% amplitude, ringed by four
 * outlines at r = 69 / 85 / 96 / 101. Counter-intuitively the rings get MORE
 * saturated outward — the outermost is the crisp one and the inner ones are
 * nearly washed out. Everything below is expressed as a multiple of R so the
 * whole thing scales from one `size` prop.
 */

const LOBES = 8;
const AMPLITUDE = 0.054;
const PHASE = (3 * Math.PI) / 180; // first lobe peak sits at 3°, not 0°
const RING_RADII = [1.2545, 1.5455, 1.7455, 1.8364]; // ÷ R
const RING_OPACITY = [0.12, 0.16, 0.22, 0.34];
const SEAL_RED = colors.brandBackGround;

// Half-box is 2.4R: the outermost ring reaches 1.94R and the bottom-right
// sparkle 2.35R. size / 4.8 therefore recovers R = 55 at the reference size.
const BOX_TO_R = 1 / 4.8;

type Sparkle = { x: number; y: number; s: number; color: string; star: boolean };

// Offsets are in units of R from the seal's centre.
const SPARKLES: Sparkle[] = [
  { x: -0.955, y: -1.482, s: 0.2, color: colors.badgeSparkle1, star: true },
  { x: 1.72, y: 1.41, s: 0.13, color: colors.badgeSparkle2, star: true },
  { x: 1.53, y: -1.4, s: 0.075, color: colors.badgeSparkle3, star: false },
  { x: -1.73, y: 1.03, s: 0.08, color: colors.badgeSparkle3, star: false },
  { x: -1.91, y: -0.5, s: 0.07, color: colors.badgeSparkle4, star: false },
];

/**
 * Closed scalloped path: sample r(θ) = R(1 + amp·cos(lobes·θ)) and join the
 * samples with a Catmull-Rom spline converted to cubics. Sampling alone gives
 * a visibly faceted polygon; the spline is what makes the lobes read as soft
 * bumps rather than points.
 */
function scallopPath(cx: number, cy: number, r: number, samples = LOBES * 6) {
  const pts: [number, number][] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * Math.PI * 2;
    const rr = r * (1 + AMPLITUDE * Math.cos(LOBES * (t - PHASE)));
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
  }

  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < samples; i += 1) {
    const p0 = pts[(i - 1 + samples) % samples];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % samples];
    const p3 = pts[(i + 2) % samples];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Four-point star with concave sides. */
function starPath(cx: number, cy: number, s: number) {
  const w = s * 0.3;
  return (
    `M${cx} ${cy - s}` +
    `C${cx + w * 0.4} ${cy - w} ${cx + w} ${cy - w * 0.4} ${cx + s} ${cy}` +
    `C${cx + w} ${cy + w * 0.4} ${cx + w * 0.4} ${cy + w} ${cx} ${cy + s}` +
    `C${cx - w * 0.4} ${cy + w} ${cx - w} ${cy + w * 0.4} ${cx - s} ${cy}` +
    `C${cx - w} ${cy - w * 0.4} ${cx - w * 0.4} ${cy - w} ${cx} ${cy - s}Z`
  );
}

const AnimatedSvgLayer = ({
  children,
  size,
  style,
}: {
  children: React.ReactNode;
  size: number;
  style: any;
}) => (
  <Animated.View style={[StyleSheet.absoluteFill, style]}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {children}
    </Svg>
  </Animated.View>
);

export default function SuccessBadge({ size = 264 }: { size?: number }) {
  const R = size * BOX_TO_R;
  const c = size / 2;

  const geometry = useMemo(
    () => ({
      blob: scallopPath(c, c, R),
      rings: RING_RADII.map((k) => scallopPath(c, c, R * k)),
      // Checkmark endpoints, sampled off the reference and normalised to R.
      check:
        `M${c - 0.373 * R} ${c + 0.027 * R}` +
        `L${c - 0.1 * R} ${c + 0.282 * R}` +
        `L${c + 0.391 * R} ${c - 0.264 * R}`,
    }),
    [c, R],
  );

  const blobIn = useRef(new Animated.Value(0)).current;
  const checkIn = useRef(new Animated.Value(0)).current;
  const ripple = useRef(RING_RADII.map(() => new Animated.Value(0))).current;
  const twinkleA = useRef(new Animated.Value(0)).current;
  const twinkleB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const loops: Animated.CompositeAnimation[] = [];

    const breathe = (v: Animated.Value, delay: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );

    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;

      if (reduce) {
        blobIn.setValue(1);
        checkIn.setValue(1);
        return;
      }

      // The seal expands out of a point, then the check is drawn on top of it.
      Animated.sequence([
        Animated.spring(blobIn, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
        Animated.timing(checkIn, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();

      // Rings breathe outward on staggered phases, so the halo ripples rather
      // than pulsing as one solid unit.
      ripple.forEach((v, i) => {
        const loop = breathe(v, i * 260, 1500);
        loops.push(loop);
        loop.start();
      });

      [twinkleA, twinkleB].forEach((v, i) => {
        const loop = breathe(v, i * 550, 900);
        loops.push(loop);
        loop.start();
      });
    });

    return () => {
      cancelled = true;
      loops.forEach((l) => l.stop());
    };
  }, [blobIn, checkIn, ripple, twinkleA, twinkleB]);

  const blobScale = blobIn.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const blobOpacity = blobIn.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const checkScale = checkIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {geometry.rings.map((d, i) => (
        <AnimatedSvgLayer
          key={i}
          size={size}
          style={{
            opacity: blobIn,
            transform: [
              { scale: ripple[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) },
            ],
          }}
        >
          <Path
            d={d}
            stroke={SEAL_RED}
            strokeOpacity={RING_OPACITY[i]}
            strokeWidth={1.2}
            // Only the innermost ring carries the faint wash visible between
            // it and the seal in the reference.
            fill={i === 0 ? SEAL_RED : 'none'}
            fillOpacity={i === 0 ? 0.02 : 0}
          />
        </AnimatedSvgLayer>
      ))}

      {SPARKLES.map((sp, i) => (
        <AnimatedSvgLayer
          key={`sp${i}`}
          size={size}
          style={{
            opacity: (i % 2 === 0 ? twinkleA : twinkleB).interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 1],
            }),
          }}
        >
          {sp.star ? (
            <Path d={starPath(c + sp.x * R, c + sp.y * R, sp.s * R)} fill={sp.color} />
          ) : (
            <Circle cx={c + sp.x * R} cy={c + sp.y * R} r={sp.s * R} fill={sp.color} />
          )}
        </AnimatedSvgLayer>
      ))}

      <AnimatedSvgLayer size={size} style={{ opacity: blobOpacity, transform: [{ scale: blobScale }] }}>
        <Path d={geometry.blob} fill={SEAL_RED} />
      </AnimatedSvgLayer>

      <AnimatedSvgLayer size={size} style={{ opacity: checkIn, transform: [{ scale: checkScale }] }}>
        <Path
          d={geometry.check}
          stroke={colors.white}
          strokeWidth={0.1 * R}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </AnimatedSvgLayer>
    </View>
  );
}