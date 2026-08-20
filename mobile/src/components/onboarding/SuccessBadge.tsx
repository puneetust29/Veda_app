import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../../theme';

const SIZE = 96;

// Success badge: pops in with a spring/bounce, then faint concentric rings
// pulse outward on a loop, plus small sparkle accents around it — echoes the
// scalloped "seal" badge with sparkles on the Figma "You're all set!" screen.
export default function SuccessBadge() {
  const scale = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();

    const ringLoop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    ringLoop.start();

    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sparkle, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    sparkleLoop.start();

    return () => {
      ringLoop.stop();
      sparkleLoop.stop();
    };
  }, [pulse, scale, sparkle]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />

      <Animated.View style={[styles.sparkle, styles.sparkleTopRight, { opacity: sparkleOpacity }]}>
        <Ionicons name="sparkles" size={16} color={colors.brand} />
      </Animated.View>
      <Animated.View style={[styles.sparkle, styles.sparkleBottomLeft, { opacity: sparkleOpacity }]}>
        <Ionicons name="sparkles" size={12} color={colors.brand} />
      </Animated.View>

      {/* Seal shape: an octagon-ish outline (rotated square behind a circle)
          approximates the scalloped badge outline from the reference. */}
      <View style={styles.sealOutline} />
      <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark" size={40} color={colors.white} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: SIZE * 1.8, height: SIZE * 1.8, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: colors.brand,
  },
  sealOutline: {
    position: 'absolute',
    width: SIZE * 0.9,
    height: SIZE * 0.9,
    borderRadius: 22,
    backgroundColor: colors.brandTint,
    transform: [{ rotate: '22deg' }],
  },
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: { position: 'absolute' },
  sparkleTopRight: { top: 12, right: 24 },
  sparkleBottomLeft: { bottom: 20, left: 20 },
});
