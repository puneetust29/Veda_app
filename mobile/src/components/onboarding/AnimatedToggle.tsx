import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { colors } from '../../theme';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

const WIDTH = 44;
const HEIGHT = 26;
const THUMB = 22;

// Custom animated switch (instead of RN's plain Switch) so the thumb slide
// and track color both animate smoothly — matches the toggle rows on the
// prototype's "Choose apps" permissions screen.
export default function AnimatedToggle({ value, onValueChange }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [anim, value]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.brand] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [2, WIDTH - THUMB - 2] });

  return (
    <Pressable onPress={() => onValueChange(!value)} hitSlop={8}>
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbTranslate }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, justifyContent: 'center' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
