import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const DOT_DELAY_MS = 120;
const CYCLE_DURATION = 1200;
const FADE_DURATION = 400;
const SHIMMER_CYCLE = 1600;

export type StreamItem = {
  text: string;
  delayMs?: number;
  state?: 'active' | 'done';
};

function ShimmerText({ children, fadeValue, translateValue }: { children: string; fadeValue: Animated.Value; translateValue: Animated.Value }) {
  const shimmerValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerValue, {
        toValue: 1,
        duration: SHIMMER_CYCLE,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerValue]);

  const shimmerOpacity = shimmerValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1, 0.4],
  });

  return (
    <Animated.View style={[{ transform: [{ translateY: translateValue }] }]}>
      <Animated.View style={[{ opacity: Animated.multiply(shimmerOpacity, fadeValue), flex: 1 }]}>
        <Text style={styles.label}>
          {children}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function AnimatedLoadingDots({ animationValue }: { animationValue: Animated.Value }) {
  return (
    <View style={styles.iconContainer}>
      <View style={styles.dotsBox}>
        {[0, 1, 2].map((dotIndex) => {
          const delay = dotIndex * DOT_DELAY_MS;
          const inputRange = [
            (delay - 200) / CYCLE_DURATION,
            delay / CYCLE_DURATION,
            (delay + 400) / CYCLE_DURATION,
            (delay + 600) / CYCLE_DURATION,
          ].map((v) => Math.max(0, Math.min(1, v)));

          return (
            <Animated.View
              key={dotIndex}
              style={[
                styles.dot,
                { left: dotIndex * 8 },
                {
                  opacity: animationValue.interpolate({
                    inputRange,
                    outputRange: [0.3, 1, 1, 0.3],
                  }),
                  transform: [
                    {
                      scale: animationValue.interpolate({
                        inputRange,
                        outputRange: [0.8, 1.2, 1.2, 0.8],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

type Props = {
  items: StreamItem[];
  isSingleItem?: boolean;
};

export default function LoadingStream({ items, isSingleItem = false }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeValue = useRef(new Animated.Value(1)).current;
  const translateValue = useRef(new Animated.Value(0)).current;
  const dotsAnimationValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // For single items, show immediately without transitions
    if (isSingleItem) {
      setCurrentIndex(0);
      fadeValue.setValue(1);
      translateValue.setValue(0);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cumulativeDelay = 0;

    items.forEach((stream, index) => {
      const delay = stream.delayMs || 0;
      cumulativeDelay += delay;
      const timer = setTimeout(() => {

        // Fade out current text
        Animated.timing(fadeValue, {
          toValue: 0,
          duration: FADE_DURATION / 2,
          useNativeDriver: false,
        }).start(() => {
          // Reset translate for new text
          translateValue.setValue(20);
          // Update to new text
          setCurrentIndex(index);
          // Fade in and slide up new text
          Animated.parallel([
            Animated.timing(fadeValue, {
              toValue: 1,
              duration: FADE_DURATION / 2,
              useNativeDriver: false,
            }),
            Animated.timing(translateValue, {
              toValue: 0,
              duration: FADE_DURATION / 2,
              useNativeDriver: true,
            }),
          ]).start();
        });
      }, cumulativeDelay);
      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [items, isSingleItem, fadeValue, translateValue]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(dotsAnimationValue, {
        toValue: 1,
        duration: CYCLE_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [dotsAnimationValue]);

  const currentStream = items[currentIndex];

  return (
    <View style={[styles.container, isSingleItem && styles.singleItemContainer]}>
      <View style={[styles.streamItem, isSingleItem && styles.singleStreamItem]}>
        <AnimatedLoadingDots animationValue={dotsAnimationValue} />
        {currentStream && <ShimmerText fadeValue={fadeValue} translateValue={translateValue}>{currentStream.text}</ShimmerText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 8,
  },
  singleItemContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
  streamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  singleStreamItem: {
    paddingVertical: 0,
  },
  iconContainer: {
    width: 18,
    height: 18,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsBox: {
    width: 24,
    height: 8,
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    top: 1.5,
    backgroundColor: '#D32F2F',
  },
  label: { color: '#1F1F1F', fontSize: 16, flexShrink: 1, fontWeight: '500' },
});
