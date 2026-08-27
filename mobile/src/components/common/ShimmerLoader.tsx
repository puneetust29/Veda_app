import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  View,
} from 'react-native';
import { colors, spacing } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  width?: number;
  height: number;
  borderRadius?: number;
  style?: any;
};

export function ShimmerPlaceholder({ width = '100%', height, borderRadius = 8, style }: Props) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  const calculatedWidth = typeof width === 'number' ? width : SCREEN_WIDTH - spacing.xxl * 2;

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255, 255, 255, 0.3)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

export default function DashboardLoadingSkeleton() {
  return (
    <View style={styles.container}>
      {/* Greeting skeleton */}
      <ShimmerPlaceholder height={60} style={styles.greetingSkeleton} />

      {/* Attention header */}
      <View style={styles.sectionHeader}>
        <ShimmerPlaceholder width={120} height={20} />
        <ShimmerPlaceholder width={24} height={24} borderRadius={6} />
      </View>

      {/* Carousel skeleton - showing 2 card placeholders */}
      <View style={styles.carouselContainer}>
        {[0, 1].map((index) => (
          <View key={index} style={styles.cardSkeleton}>
            <ShimmerPlaceholder height={160} borderRadius={16} style={styles.cardImage} />
            <View style={styles.cardContent}>
              <ShimmerPlaceholder width="80%" height={18} style={styles.cardTitle} />
              <ShimmerPlaceholder width="100%" height={14} style={styles.cardSubtitle} />
              <View style={styles.tagRow}>
                <ShimmerPlaceholder width={80} height={28} borderRadius={12} />
                <ShimmerPlaceholder width={80} height={28} borderRadius={12} />
              </View>
            </View>
            <ShimmerPlaceholder height={44} borderRadius={12} style={styles.cardButton} />
          </View>
        ))}
      </View>

      {/* Suggestion grid skeleton */}
      <View style={styles.suggestionsHeader}>
        <ShimmerPlaceholder width={140} height={20} />
      </View>
      <View style={styles.suggestionGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={index} style={styles.suggestionItem}>
            <ShimmerPlaceholder width={56} height={56} borderRadius={12} />
            <ShimmerPlaceholder width="90%" height={12} style={styles.suggestionLabel} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  greetingSkeleton: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xxxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
  },
  carouselContainer: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xxxl,
  },
  cardSkeleton: {
    width: 280,
    borderRadius: 20,
    backgroundColor: colors.white,
    overflow: 'hidden',
    paddingTop: 8,
  },
  cardImage: {
    marginHorizontal: 8,
    marginBottom: spacing.md,
  },
  cardContent: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    marginBottom: spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cardButton: {
    marginHorizontal: 8,
    marginBottom: 8,
  },
  suggestionsHeader: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  suggestionItem: {
    width: '30%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestionLabel: {
    marginTop: spacing.xs,
  },
});
