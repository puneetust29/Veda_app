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
import { arrowWhite, chipDevices, chipMap, dotPending } from './figmaSvgs';

type Props = {
  flights: CalendarEvent[];
  bills?: CalendarEvent[];
  activeRoamingEventIds: Set<string>;
  activeInsuranceEventIds: Set<string>;
  onPressFlight: (flight: CalendarEvent) => void;
  onPressBill?: (bill: CalendarEvent) => void;
};

type TagKey = 'roaming' | 'insurance';

function isBillPaid(billEventId: string, activeBills: { bills: any[] } | null): boolean {
  return activeBills?.bills?.some((b) => b.bill_event_id === billEventId) ?? false;
}

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
export default function AttentionCarousel({ flights, bills = [], activeRoamingEventIds, activeInsuranceEventIds, onPressFlight, onPressBill }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  // Per-flight, per-tag confirmation state for chips with no backend-tracked status.
  // Insurance status now comes from backend, so only track local confirmations if needed.
  const [confirmed, setConfirmed] = useState<Record<string, Set<TagKey>>>({}); // TODO: Consider removing if not needed
  const { activeBills } = useSubscriptionInsurance();

  // Combine flights and bills, sorted by start_datetime
  const allEvents = [...flights, ...bills].sort((a, b) => {
    const dateA = new Date(a.start_datetime).getTime();
    const dateB = new Date(b.start_datetime).getTime();
    return dateA - dateB;
  });

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
    setActiveIndex(Math.max(0, Math.min(index, allEvents.length - 1)));
  };

  if (allEvents.length === 0) {
    return <Text style={styles.empty}>No upcoming events found.</Text>;
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
        {allEvents.map((event, index) => (
          <AttentionCard
            key={event.id}
            event={event}
            type={event.event_type as 'flight' | 'broadbandBill'}
            index={index}
            scrollX={scrollX}
            roamingActive={activeRoamingEventIds.has(event.id)}
            insuranceActive={activeInsuranceEventIds.has(event.id)}
            billPaid={event.event_type === 'broadbandBill' ? isBillPaid(event.id, activeBills) : false}
            confirmedTags={confirmed[event.id] ?? new Set<TagKey>()}
            onToggleTag={(tag) => toggleTag(event.id, tag)}
            onPress={() => event.event_type === 'flight' ? onPressFlight(event) : onPressBill?.(event)}
          />
        ))}
      </Animated.ScrollView>

      {allEvents.length > 1 ? (
        <View style={styles.dots}>
          {allEvents.map((event, index) => (
            <View key={event.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
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
  event,
  type,
  index,
  scrollX,
  roamingActive,
  insuranceActive,
  billPaid,
  confirmedTags,
  onToggleTag,
  onPress,
}: {
  event: CalendarEvent;
  type: 'flight' | 'broadbandBill';
  index: number;
  scrollX: Animated.Value;
  roamingActive: boolean;
  insuranceActive: boolean;
  billPaid: boolean;
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

  // Bill card rendering
  if (type === 'broadbandBill') {
    const rawDetails = event.raw_details as any || {};
    const billType = rawDetails.bill_type || 'Utility';
    const billAmount = rawDetails.bill_amount || 0;
    const billCurrency = rawDetails.bill_currency || 'USD';
    const dueDate = rawDetails.due_date ? new Date(rawDetails.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Due soon';

    return (
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {/* Banner with image */}
        <View style={styles.banner}>
          <Image
            source={
              imageLoadFailed
                ? getRandomFallbackImage(event.id)
                : { uri: `https://picsum.photos/seed/${encodeURIComponent(event.id)}/600/300` }
            }
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImageLoadFailed(true)}
          />
          <View style={styles.badgeRow}>
            <SourceBadge source={event.source} />
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {billPaid ? 'Bill Payment Complete' : 'Pay this month\'s household bills'}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            {billPaid ? `Paid on ${new Date(event.start_datetime).toLocaleDateString()}` : 'I\'ve gathered everything that\'s due this month.'}
          </Text>

          {/* Bill Type Tag with Checkmark */}
          <View style={styles.billTagRow}>
            <View style={styles.billTag}>
              <Text style={styles.billTagLabel}>{billType.charAt(0).toUpperCase() + billType.slice(1)}</Text>
              {billPaid ? (
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              ) : (
                <SvgXml xml={dotPending} width={14} height={14} />
              )}
            </View>
          </View>
        </View>

        {/* Footer with amount and button */}
        <TouchableOpacity
          style={[styles.ctaRow, billPaid && styles.ctaRowDisabled]}
          onPress={billPaid ? undefined : onPress}
          activeOpacity={billPaid ? 1 : 0.8}
          disabled={billPaid}
        >
          <Text style={[styles.ctaText, billPaid && styles.ctaTextDisabled]}>
            {billPaid ? 'Payment Complete' : 'Review & Pay'}
          </Text>
          <View style={styles.ctaButton}>
            <SvgXml xml={arrowWhite} width={14} height={14} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Flight card rendering
  const destinationCity = cityFromLocation(event.destination);
  const completionStatus = getFlightCompletionStatus(event.id, subscriptions, activeInsurance);
  const isDomestic = event.is_domestic ?? false;
  const cardSubtitle = getCardSubtitle(completionStatus);
  const shouldDisableButton = isDomestic || completionStatus === 'both_done';

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <View style={styles.banner}>
        <Image
          source={
            imageLoadFailed
              ? getRandomFallbackImage(event.id)
              : { uri: `https://picsum.photos/seed/${encodeURIComponent(event.id)}/600/300` }
          }
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageLoadFailed(true)}
        />
        <View style={styles.badgeRow}>
          <SourceBadge source={event.source} />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          Get your {destinationCity} trip ready
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {cardSubtitle}
        </Text>

        {!event.is_domestic && (
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
  billCategoriesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  billCategory: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(230, 0, 0, 0.08)',
  },
  billCategoryHighlight: {
    backgroundColor: '#E60000',
  },
  billCategoryLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.accentButton,
  },
  billCategoryLabelHighlight: {
    color: 'white',
  },
  billTagRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  billTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.chipTint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  billTagLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 16.5,
    color: colors.textPrimary,
  },
});
