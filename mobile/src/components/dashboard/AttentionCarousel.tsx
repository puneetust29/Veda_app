import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import CheckableTag from '../common/CheckableTag';
import IconCircle from '../common/IconCircle';
import { colors, radii, spacing, typography } from '../../theme';
import type { CalendarEvent } from '../../types';

type Props = {
  flights: CalendarEvent[];
  activeRoamingEventIds: Set<string>;
  activeInsuranceEventIds: Set<string>;
  onPressFlight: (flight: CalendarEvent) => void;
};

type TagKey = 'roaming' | 'insurance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;
const CARD_SPACING = spacing.md;
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING;

// Map event source to its icon and color
function getSourceIcon(source: 'google' | 'device' | 'gmail' | 'mock'): keyof typeof Ionicons.glyphMap {
  switch (source) {
    case 'google':
      return 'calendar-outline';
    case 'device':
      return 'phone-portrait-outline';
    case 'gmail':
      return 'mail-outline';
    case 'mock':
      return 'alert-circle-outline';
    default:
      return 'help-circle-outline';
  }
}

function getSourceIconColor(source: 'google' | 'device' | 'gmail' | 'mock'): string {
  switch (source) {
    case 'google':
      return '#4285F4';  // Google blue
    case 'device':
      return '#34C759';  // Apple green
    case 'gmail':
      return '#EA4335';  // Gmail red
    case 'mock':
      return '#FBBC04';  // Yellow
    default:
      return colors.brand;
  }
}

function cityFromLocation(location: string | null): string {
  if (!location) return 'your trip';
  // "London Heathrow (LHR)" -> "London"; "NRT" -> "NRT" (fall back to as-is).
  return location.split(' ')[0];
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString(undefined, opts)} – ${endDate.toLocaleDateString(undefined, opts)}`;
}

// Horizontal, snap-paged carousel of "needs your attention" flight cards —
// image banner with source badges, title/subtitle, tag chips (tap to
// confirm), CTA row, pagination dots below. Built on RN's built-in Animated
// API rather than reanimated, which isn't a dependency yet.
export default function AttentionCarousel({ flights, activeRoamingEventIds, activeInsuranceEventIds, onPressFlight }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  // Per-flight, per-tag confirmation state for chips with no backend-tracked status.
  // Insurance status now comes from backend, so only track local confirmations if needed.
  const [confirmed, setConfirmed] = useState<Record<string, Set<TagKey>>>({}); // TODO: Consider removing if not needed

  const toggleTag = (flightId: string, tag: TagKey) => {
    setConfirmed((prev) => {
      const current = new Set(prev[flightId] ?? []);
      if (current.has(tag)) {
        current.delete(tag);
      } else {
        current.add(tag);
      }
      return { ...prev, [flightId]: current };
    });
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
    setActiveIndex(Math.max(0, Math.min(index, flights.length - 1)));
  };

  if (flights.length === 0) {
    return <Text style={styles.empty}>No upcoming flights found.</Text>;
  }

  return (
    <View>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        {flights.map((flight, index) => (
          <AttentionCard
            key={flight.id}
            flight={flight}
            index={index}
            scrollX={scrollX}
            roamingActive={activeRoamingEventIds.has(flight.id)}
            insuranceActive={activeInsuranceEventIds.has(flight.id)}
            confirmedTags={confirmed[flight.id] ?? new Set<TagKey>()}
            onToggleTag={(tag) => toggleTag(flight.id, tag)}
            onPress={() => onPressFlight(flight)}
          />
        ))}
      </Animated.ScrollView>

      {flights.length > 1 ? (
        <View style={styles.dots}>
          {flights.map((flight, index) => (
            <View key={flight.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AttentionCard({
  flight,
  index,
  scrollX,
  roamingActive,
  insuranceActive,
  confirmedTags,
  onToggleTag,
  onPress,
}: {
  flight: CalendarEvent;
  index: number;
  scrollX: Animated.Value;
  roamingActive: boolean;
  insuranceActive: boolean;
  confirmedTags: Set<TagKey>;
  onToggleTag: (tag: TagKey) => void;
  onPress: () => void;
}) {
  const inputRange = [
    (index - 1) * SNAP_INTERVAL,
    index * SNAP_INTERVAL,
    (index + 1) * SNAP_INTERVAL,
  ];
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.94, 1, 0.94],
    extrapolate: 'clamp',
  });

  const destinationCity = cityFromLocation(flight.destination);

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <View style={styles.banner}>
        <Image
          source={{ uri: `https://picsum.photos/seed/${encodeURIComponent(flight.id)}/600/300` }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <View style={styles.badgeRow}>
          <IconCircle
            icon={getSourceIcon(flight.source)}
            size={26}
            iconSize={14}
            iconColor={colors.white}
            backgroundColor={getSourceIconColor(flight.source)}
          />
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        Get your {destinationCity} trip ready
      </Text>
      <Text style={styles.cardSubtitle} numberOfLines={2}>
        I&apos;ve found two things you&apos;ll want to complete before you travel.
      </Text>
      <Text style={styles.cardDate}>
        {flight.title} · {formatDateRange(flight.start_datetime, flight.end_datetime)}
      </Text>

      <View style={styles.tagRow}>
        <CheckableTag
          icon="cellular-outline"
          label="Roaming"
          confirmed={roamingActive || confirmedTags.has('roaming')}
          onPress={() => onToggleTag('roaming')}
        />
        <CheckableTag
          icon="map-outline"
          label="Travel Insurance"
          confirmed={insuranceActive}
          onPress={() => onToggleTag('insurance')}
          disabled={insuranceActive}
        />
      </View>

      <TouchableOpacity style={styles.ctaRow} onPress={onPress}>
        <Text style={styles.ctaText}>Review recommendation</Text>
        <IconCircle icon="arrow-forward" size={28} iconSize={14} iconColor={colors.white} backgroundColor={colors.brand} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: spacing.xl },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  card: {
    width: CARD_WIDTH,
    marginRight: CARD_SPACING,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingBottom: spacing.lg,
  },
  banner: {
    height: 140,
    backgroundColor: colors.brand,
  },
  badgeRow: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
  },
  badgeOverlap: { marginLeft: -8 },
  cardTitle: {
    ...typography.bodyBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginHorizontal: spacing.lg,
  },
  cardDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginHorizontal: spacing.lg,
  },
  tagRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginHorizontal: spacing.lg },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  ctaText: { ...typography.bodyBold, fontSize: 14, color: colors.textPrimary },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand, width: 16 },
});
