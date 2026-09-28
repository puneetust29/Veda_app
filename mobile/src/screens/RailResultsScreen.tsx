import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RootStackParamList } from '../types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RailResults'>;

type Segment = {
  origin: { name: string };
  destination: { name: string };
  departureAt: string;
  arrivalAt: string;
  duration: number;
  transport: string;
  operator: { name: string };
};

type Offer = { id: string; price: { amount: number; currency: string } };

type SegmentCollection = { segments: Segment[]; offers: Offer[] | null };

type Journey = {
  id: string;
  status: string;
  itinerary: SegmentCollection[];
};

type JourneyWithOffer = Journey & { cheapestOffer: Offer | null };

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

function formatTime(dt: string): string {
  return dt.slice(11, 16);
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
}

async function fetchJourneys(
  originUid: string,
  destinationUid: string,
  date: string,
  passengers: number,
): Promise<Journey[]> {
  const url = `${API_BASE}/rail/journeys?origin=${originUid}&destination=${destinationUid}&date=${date}&passengers=${passengers}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

async function fetchOffers(journeyId: string, passengers: number): Promise<Offer[]> {
  const url = `${API_BASE}/rail/journeys/${journeyId}/offers?passengers=${passengers}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const offers: Offer[] = [];
  for (const item of data?.itinerary ?? []) {
    if (item.offers) offers.push(...item.offers);
  }
  return offers;
}

export default function RailResultsScreen({ route, navigation }: Props) {
  const { originUid, originName, destinationUid, destinationName, date, passengers } = route.params;

  const [journeys, setJourneys] = useState<JourneyWithOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOffers, setLoadingOffers] = useState<string | null>(null);
  const [selectedOffers, setSelectedOffers] = useState<Record<string, Offer[]>>({});

  useEffect(() => {
    fetchJourneys(originUid, destinationUid, date, passengers)
      .then((raw) => {
        setJourneys(raw.map((j) => ({ ...j, cheapestOffer: null })));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [originUid, destinationUid, date, passengers]);

  const handleExpand = async (journey: JourneyWithOffer) => {
    if (selectedOffers[journey.id]) {
      setSelectedOffers(prev => { const n = { ...prev }; delete n[journey.id]; return n; });
      return;
    }
    setLoadingOffers(journey.id);
    const offers = await fetchOffers(journey.id, passengers);
    const cheapest = offers.length > 0
      ? offers.reduce((a, b) => a.price.amount <= b.price.amount ? a : b)
      : null;
    setJourneys(prev => prev.map(j => j.id === journey.id ? { ...j, cheapestOffer: cheapest } : j));
    setSelectedOffers(prev => ({ ...prev, [journey.id]: offers }));
    setLoadingOffers(null);
  };

  const firstSegment = (j: Journey): Segment | null =>
    j.itinerary[0]?.segments?.[0] ?? null;

  const lastSegment = (j: Journey): Segment | null => {
    const segs = j.itinerary[0]?.segments;
    return segs?.[segs.length - 1] ?? null;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Searching trains…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (journeys.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No trains found for this route on {date}.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.routeHeader}>
        <Text style={styles.routeText}>{originName} → {destinationName}</Text>
        <Text style={styles.routeMeta}>{date} · {passengers} adult{passengers > 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={journeys}
        keyExtractor={j => j.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: journey }) => {
          const first = firstSegment(journey);
          const last = lastSegment(journey);
          const isExpanded = !!selectedOffers[journey.id];
          const offers = selectedOffers[journey.id];

          return (
            <Pressable style={styles.card} onPress={() => handleExpand(journey)}>
              <View style={styles.cardMain}>
                <View style={styles.timeBlock}>
                  <Text style={styles.time}>{first ? formatTime(first.departureAt) : '—'}</Text>
                  <Text style={styles.timeLabel}>{originName}</Text>
                </View>
                <View style={styles.durationBlock}>
                  <View style={styles.durationLine} />
                  <Text style={styles.durationText}>
                    {first ? formatDuration(first.duration) : ''}
                  </Text>
                  <Text style={styles.operatorText}>
                    {first?.operator.name ?? ''}
                  </Text>
                </View>
                <View style={styles.timeBlock}>
                  <Text style={styles.time}>{last ? formatTime(last.arrivalAt) : '—'}</Text>
                  <Text style={styles.timeLabel}>{destinationName}</Text>
                </View>
                <View style={styles.priceBlock}>
                  {journey.cheapestOffer ? (
                    <>
                      <Text style={styles.priceFrom}>from</Text>
                      <Text style={styles.price}>
                        {formatPrice(journey.cheapestOffer.price.amount, journey.cheapestOffer.price.currency)}
                      </Text>
                    </>
                  ) : loadingOffers === journey.id ? null : (
                    <Text style={styles.tapForPrices}>Tap for prices</Text>
                  )}
                </View>
              </View>

              {loadingOffers === journey.id && (
                <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: spacing.sm }} />
              )}

              {isExpanded && offers && (
                <View style={styles.offersSection}>
                  <Text style={styles.offersTitle}>Select a fare</Text>
                  {offers.map((offer, i) => (
                    <View key={offer.id} style={styles.offerRow}>
                      <Text style={styles.offerLabel}>Option {i + 1}</Text>
                      <View style={styles.offerRight}>
                        <Text style={styles.offerPrice}>
                          {formatPrice(offer.price.amount, offer.price.currency)}
                        </Text>
                        <TouchableOpacity
                          style={styles.bookBtn}
                          onPress={() => navigation.navigate('RailPassengerDetails', {
                            offerId: offer.id,
                            price: offer.price,
                            originName,
                            destinationName,
                            departureAt: first?.departureAt ?? '',
                            arrivalAt: last?.arrivalAt ?? '',
                            operator: first?.operator.name ?? '',
                            passengers,
                          })}
                        >
                          <Text style={styles.bookBtnText}>Book</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.textSecondary, fontSize: 15 },
  errorText: { color: colors.brand, fontSize: 15, textAlign: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  routeHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  routeText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  routeMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeBlock: { alignItems: 'center', minWidth: 56 },
  time: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  timeLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  durationBlock: { flex: 1, alignItems: 'center', gap: 2 },
  durationLine: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  durationText: { fontSize: 12, color: colors.textSecondary },
  operatorText: { fontSize: 11, color: colors.textSecondary },
  priceBlock: { alignItems: 'flex-end', minWidth: 64 },
  priceFrom: { fontSize: 10, color: colors.textSecondary },
  price: { fontSize: 16, fontWeight: '700', color: colors.brand },
  priceUnavailable: { fontSize: 14, color: colors.textSecondary },
  tapForPrices: { fontSize: 11, color: colors.brand, textDecorationLine: 'underline' },
  offersSection: { marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  offersTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  offerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  offerLabel: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  offerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offerPrice: { fontSize: 14, fontWeight: '700', color: colors.brand },
  bookBtn: { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  bookBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
