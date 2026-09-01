import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const DOT_DELAY_MS = 120;
const CYCLE_DURATION = 1200;
const SHIMMER_CYCLE = 1600;

export type StreamItem = {
  text: string;
  delayMs?: number;
  state?: 'active' | 'done';
};

function ShimmerText({ children }: { children: string }) {
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

  // Animate text with shimmer effect: darker → lighter → darker (matching Conversation.tsx)
  const textOpacity = shimmerValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1, 0.4],
  });

  return (
    <Animated.View style={[{ flex: 1, opacity: textOpacity }]}>
      <Text style={styles.label}>
        {children}
      </Text>
    </Animated.View>
  );
}

type Props = {
  items: StreamItem[];
  isSingleItem?: boolean;
};

export default function LoadingStream({ items, isSingleItem = false }: Props) {
  const [visibleStreams, setVisibleStreams] = useState<StreamItem[]>([]);
  const animationValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // For single items, show immediately without delays
    if (isSingleItem) {
      setVisibleStreams(items);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cumulativeDelay = 0;

    items.forEach((stream) => {
      const delay = stream.delayMs || 0;
      cumulativeDelay += delay;
      const timer = setTimeout(() => {
        setVisibleStreams((prev) => [...prev, stream]);
      }, cumulativeDelay);
      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [items, isSingleItem]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(animationValue, {
        toValue: 1,
        duration: CYCLE_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [animationValue]);

  return (
    <View style={[styles.container, isSingleItem && styles.singleItemContainer]}>
      {visibleStreams.map((stream, idx) => (
        <View key={idx} style={[styles.streamItem, isSingleItem && styles.singleStreamItem]}>
          {stream.state === 'active' || (idx === visibleStreams.length - 1 && !stream.state) ? (
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
          ) : (
            <Text style={styles.checkmark}>✓</Text>
          )}
          <ShimmerText>{stream.text}</ShimmerText>
        </View>
      ))}
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
  checkmark: { color: '#4CAF50', fontWeight: '700', marginRight: 10, width: 18, textAlign: 'center', fontSize: 14 },
  label: { color: '#1F1F1F', fontSize: 14, flexShrink: 1, fontWeight: '500' },
});
