import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { colors } from '../../theme';

type FloatingIcon = {
  name: keyof typeof Ionicons.glyphMap;
  // Position as a fraction of the container (0-1), so this scales with any
  // container size instead of hardcoded pixel offsets.
  top: number;
  left: number;
  delay: number;
};

const ICONS: FloatingIcon[] = [
  { name: 'heart-outline', top: 0.02, left: 0.12, delay: 0 },
  { name: 'shield-checkmark-outline', top: 0.0, left: 0.55, delay: 300 },
  { name: 'headset-outline', top: 0.18, left: 0.28, delay: 600 },
  { name: 'time-outline', top: 0.2, left: 0.72, delay: 900 },
  { name: 'create-outline', top: 0.14, left: 0.86, delay: 200 },
  { name: 'bag-outline', top: 0.42, left: 0.06, delay: 500 },
  { name: 'chatbubble-outline', top: 0.58, left: 0.22, delay: 800 },
  { name: 'home-outline', top: 0.58, left: 0.6, delay: 100 },
  { name: 'medkit-outline', top: 0.74, left: 0.4, delay: 400 },
  { name: 'create-outline', top: 0.7, left: 0.78, delay: 700 },
];

// Ambient background: small icon bubbles that gently fade in/out and drift
// vertically on a loop, arranged loosely in a ring around the logo — matches
// the "veda" landing screen in the Figma prototype.
function FloatingIcon({ icon }: { icon: FloatingIcon }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(icon.delay),
        Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, icon.delay]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [4, -4] });

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          top: `${icon.top * 100}%`,
          left: `${icon.left * 100}%`,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Ionicons name={icon.name} size={16} color={colors.brand} />
    </Animated.View>
  );
}

export default function FloatingIcons() {
  return (
    <>
      {ICONS.map((icon, index) => (
        <FloatingIcon key={`${icon.name}-${index}`} icon={icon} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
