import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

interface Props {
  label: string | null;
}

export default function AgentProgressStrip({ label }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const dotScale = useRef(new Animated.Value(1)).current;
  const dotLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (label) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      dotLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(dotScale, { toValue: 1.5, duration: 500, useNativeDriver: true }),
          Animated.timing(dotScale, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      dotLoop.current.start();
    } else {
      dotLoop.current?.stop();
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
    return () => dotLoop.current?.stop();
  }, [label]);

  if (label === null) return null;

  return (
    <Animated.View style={[styles.strip, { opacity }]}>
      <Animated.View style={[styles.dot, { transform: [{ scale: dotScale }] }]} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8F8',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0E0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.brand,
  },
});
