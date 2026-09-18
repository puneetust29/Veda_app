import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '../../theme';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

const WIDTH = 48;
const HEIGHT = 24;
const THUMB = 21.6;
const PADDING = 1.2;

// Custom animated switch (instead of RN's plain Switch) so the thumb slide
// and track color both animate smoothly — matches Figma node 1:42104/1:42115
// ("Toggle" off/on) on the prototype's "Choose apps" permissions screen. The
// off-state thumb is a red gradient and the on-state thumb is solid white,
// so both are rendered stacked and cross-faded rather than color-interpolated.
export default function AnimatedToggle({ value, onValueChange }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [anim, value]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.toggleTrackOff, colors.toggleTrackOn] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [PADDING, WIDTH - THUMB - PADDING] });
  const offThumbOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const onThumbOpacity = anim;

  return (
    <Pressable onPress={() => onValueChange(!value)} hitSlop={8}>
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumbWrap, { transform: [{ translateX: thumbTranslate }] }]}>
          <Animated.View style={[styles.thumbLayer, { opacity: offThumbOpacity }]}>
            <LinearGradient
              colors={[colors.toggleThumbOffStart, colors.toggleThumbOffEnd]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.thumbFill}
            />
          </Animated.View>
          <Animated.View style={[styles.thumbLayer, styles.thumbOn, { opacity: onThumbOpacity }]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.8,
  },
  thumbWrap: { width: THUMB, height: THUMB },
  thumbLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: THUMB / 2,
    overflow: 'hidden',
  },
  thumbFill: { flex: 1 },
  thumbOn: {
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
});
