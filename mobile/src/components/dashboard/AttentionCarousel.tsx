import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

import CheckableTag from '../common/CheckableTag';
import { useSubscriptionInsurance } from '../../context/SubscriptionInsuranceContext';
import { colors, fonts, spacing } from '../../theme';
import type { CalendarEvent } from '../../types';
import { arrowWhite, chipDevices, chipMap } from './figmaSvgs';

type Props = {
  flights: CalendarEvent[];
  activeRoamingEventIds: Set<string>;
  activeInsuranceEventIds: Set<string>;
  onPressFlight: (flight: CalendarEvent) => void;
};

type TagKey = 'roaming' | 'insurance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Figma: 345px card on a 414px frame → 69px of horizontal chrome.
const CARD_WIDTH = SCREEN_WIDTH - 69;
const CARD_SPACING = spacing.lg;
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING;

// Design-style source badge (node 1:35402): white circle with a slate
// border and the source app's logo inside.
const SOURCE_LOGOS: Record<'google' | 'gmail', ImageSourcePropType> = {
  google: require('../../../assets/dashboard/app-gcal.png'),
  gmail: require('../../../assets/dashboard/app-gmail.png'),
};

function SourceBadge({ source }: { source: CalendarEvent['source'] }) {
  return (
    <View style={styles.sourceBadge}>
      {source === 'google' || source === 'gmail' ? (
        <Image source={SOURCE_LOGOS[source]} style={styles.sourceLogo} resizeMode="contain" />
      ) : (
        <Ionicons
          name={source === 'device' ? 'phone-portrait-outline' : 'alert-circle-outline'}
          size={15}
          color={colors.sourceBadgeBorder}
        />
      )}
    </View>
  );
}

function cityFromLocation(location: string | null): string {
  if (!location) return 'your trip';
  // "London Heathrow (LHR)" -> "London"; "NRT" -> "NRT" (fall back to as-is).
  return location.split(' ')[0];
}

type CompletionStatus = 'both_done' | 'one_done' | 'both_pending';

function getFlightCompletionStatus(
  flightId: string,
  subscriptions: any[] | null,
  activeInsurance: { purchases: any[] } | null,
): CompletionStatus {
  const hasRoaming = subscriptions?.some(
    (s) => s.calendar_event_id === flightId && s.status === 'active',
  );
  const hasInsurance = activeInsurance?.purchases?.some((p) => p.calendar_event_id === flightId);

  if (hasRoaming && hasInsurance) return 'both_done';
  if (hasRoaming || hasInsurance) return 'one_done';
  return 'both_pending';
}

function getCardSubtitle(status: CompletionStatus): string {
  if (status === 'both_done') return "You're all set to fly! Everything is ready for your trip.";
  if (status === 'one_done') return "I've found one thing you'll want to complete before you travel.";
  return "I've found two things you'll want to complete before you travel.";
}

// Horizontal, snap-paged carousel of "needs your attention" flight cards —
// styled 1:1 against Figma node 1:35370: white 24px-radius card with a soft
// drop shadow, inset 20px-radius image banner, source badge, Urbanist
// title + Inter body copy, chips, and a grey footer action bar with a red
// square arrow button. Built on RN's built-in Animated API rather than
// reanimated, which isn't a dependency yet.
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

// Local fallback images (guaranteed to show)
const FALLBACK_IMAGE_SOURCES = [
  require('../../../assets/fallback-beach.jpg'),
  require('../../../assets/fallback-mountain.jpg'),
  require('../../../assets/fallback-sunset.jpg'),
  require('../../../assets/fallback-city.jpg'),
  require('../../../assets/fallback-adventure.jpg'),
];

function getRandomFallbackImage(seed: string): number {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return FALLBACK_IMAGE_SOURCES[hash % FALLBACK_IMAGE_SOURCES.length];
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
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const { subscriptions, activeInsurance } = useSubscriptionInsurance();
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
  const completionStatus = getFlightCompletionStatus(flight.id, subscriptions, activeInsurance);
  const isDomestic = flight.is_domestic ?? false;
  const cardSubtitle = getCardSubtitle(completionStatus);
  const shouldDisableButton = isDomestic || completionStatus === 'both_done';


  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <View style={styles.banner}>
        <Image
          source={
            imageLoadFailed
              ? getRandomFallbackImage(flight.id)
              : { uri: `https://picsum.photos/seed/${encodeURIComponent(flight.id)}/600/300` }
          }
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageLoadFailed(true)}
        />
        <View style={styles.badgeRow}>
          <SourceBadge source={flight.source} />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          Get your {destinationCity} trip ready
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {cardSubtitle}
        </Text>

        {!flight.is_domestic && (
          <View style={styles.tagRow}>
            <CheckableTag
              iconXml={chipMap}
              label="Travel Insurance"
              confirmed={insuranceActive || confirmedTags.has('insurance')}
              onPress={() => onToggleTag('insurance')}
            />
            <CheckableTag
              iconXml={chipDevices}
              label="Roaming"
              confirmed={roamingActive || confirmedTags.has('roaming')}
              onPress={() => onToggleTag('roaming')}
            />
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.ctaRow, shouldDisableButton && styles.ctaRowDisabled]}
        onPress={shouldDisableButton ? undefined : onPress}
        activeOpacity={shouldDisableButton ? 1 : 0.8}
        disabled={shouldDisableButton}
      >
        <Text style={[styles.ctaText, shouldDisableButton && styles.ctaTextDisabled]}>
          {isDomestic ? 'Domestic coming soon' : completionStatus === 'both_done' ? 'All set! Ready to fly' : 'Review recommendation'}
        </Text>
        <View style={[styles.ctaButton, shouldDisableButton && styles.ctaButtonDisabled]}>
          <SvgXml xml={arrowWhite} width={14} height={14} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  card: {
    width: CARD_WIDTH,
    minHeight: 385,
    marginRight: CARD_SPACING,
    borderRadius: 24,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 12,
    shadowOpacity: 0.07,
    elevation: 6,
  },
  banner: {
    height: 188,
    margin: 8,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  badgeRow: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
  },
  sourceBadge: {
    width: 33,
    height: 33,
    borderRadius: 33,
    backgroundColor: colors.white,
    borderWidth: 1.2,
    borderColor: colors.sourceBadgeBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceLogo: { width: 15, height: 15 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    maxWidth: 242,
  },
  tagRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardFooter,
    borderBottomLeftRadius: 23,
    borderBottomRightRadius: 23,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  ctaText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    lineHeight: 16,
    color: colors.textPrimary,
  },
  ctaButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.accentButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRowDisabled: {
    backgroundColor: '#E8E8E8',
    opacity: 0.6,
  },
  ctaTextDisabled: {
    color: '#999999',
  },
  ctaButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 100, backgroundColor: colors.dotInactive },
  dotActive: { backgroundColor: colors.accentCta, width: 24, height: 5 },
});
