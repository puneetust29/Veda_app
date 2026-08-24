import { ActivityIndicator, Alert, AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as ExpoLinking from 'expo-linking';

import { api } from '../lib/api';
import type { RecommendationCardPayload, UberRideProduct } from '../types';

type Props = {
  card: RecommendationCardPayload;
  calendarEventId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupLabel?: string;
};

async function openUber(uberAppUrl: string | null, deepLinkUrl: string | null) {
  if (uberAppUrl) {
    try { await Linking.openURL(uberAppUrl); return; } catch { /* fall through */ }
  }
  if (deepLinkUrl) { await Linking.openURL(deepLinkUrl); }
}

function confirmAndBook(
  product: UberRideProduct,
  calendarEventId: string | undefined,
  pickupLatitude: number | undefined,
  pickupLongitude: number | undefined,
  pickupLabel: string | undefined,
  onBooked: (msg: string) => void,
) {
  if (!calendarEventId) {
    Alert.alert('Error', 'Missing trip info — cannot book.');
    return;
  }
  Alert.alert(
    `Book ${product.display_name}?`,
    `${product.estimate}${product.eta_minutes ? ` · ~${product.eta_minutes} min` : ''}\n\nThis will charge your payment method on file with Uber.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Book Now',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await api.bookUberRide({
              calendarEventId,
              productName: product.display_name,
              pickupLatitude,
              pickupLongitude,
              pickupLabel,
            });
            onBooked(res.message);
          } catch (err: any) {
            Alert.alert('Booking failed', err?.message ?? 'Unknown error');
          }
        },
      },
    ],
  );
}

function UberRideCard({
  card,
  calendarEventId,
  pickupLatitude,
  pickupLongitude,
  pickupLabel,
}: {
  card: Extract<RecommendationCardPayload, { kind: 'uber_ride' }>;
  calendarEventId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupLabel?: string;
}) {
  const [bookedMsg, setBookedMsg] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(card.connect_uber_url ?? null);
  const [connecting, setConnecting] = useState(false);
  const [freshProducts, setFreshProducts] = useState<UberRideProduct[] | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  // When user returns from the browser after Uber login, re-check session and
  // refresh prices — the original card was built before the token existed.
  useEffect(() => {
    if (!connectUrl) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        try {
          const session = await api.getUberSession();
          if (session.connected) {
            setConnectUrl(null); // session established
            if (calendarEventId) {
              setLoadingRates(true);
              try {
                const options = await api.getUberOptions({
                  calendarEventId,
                  pickupLatitude,
                  pickupLongitude,
                  pickupLabel,
                });
                setFreshProducts(options.ride_products ?? []);
              } catch { /* keep showing whatever we had */
              } finally {
                setLoadingRates(false);
              }
            }
          }
        } catch { /* ignore */ }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [connectUrl, calendarEventId, pickupLatitude, pickupLongitude, pickupLabel]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const returnUrl = ExpoLinking.createURL('/');
      const { auth_url } = await api.getUberConnectUrl(returnUrl);
      await Linking.openURL(auth_url);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start Uber login.');
    } finally {
      setConnecting(false);
    }
  };

  const airportOptions = card.airport_options ?? [];
  const altOptions     = card.alternative_options ?? [];
  const products       = freshProducts ?? card.ride_products ?? [];
  const hasProducts    = products.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>UBER RIDE</Text>
        <Text style={styles.uberLogo}>✈</Text>
      </View>

      <Text style={styles.uberMessage}>{card.suggested_message}</Text>

      {/* Route row */}
      {(card.pickup_label || card.dropoff_label) && (
        <View style={styles.routeRow}>
          <Text style={styles.routeCity} numberOfLines={1}>{card.pickup_label ?? 'Current location'}</Text>
          <Text style={styles.routeArrow}>→</Text>
          <Text style={styles.routeCity} numberOfLines={1}>{card.dropoff_label}</Text>
        </View>
      )}

      {/* Booked confirmation */}
      {bookedMsg && (
        <View style={styles.bookedBanner}>
          <Text style={styles.bookedText}>{bookedMsg}</Text>
        </View>
      )}

      {/* Connect / Re-connect Uber */}
      {connectUrl && (
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={handleConnect}
          disabled={connecting}
        >
          <Text style={styles.outlineBtnText}>
            {connecting ? 'Opening…' : hasProducts ? 'Re-connect Uber account' : 'Connect Uber account'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Fetching live rates after connecting */}
      {loadingRates && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#111" />
          <Text style={styles.loadingText}>Fetching Uber rates…</Text>
        </View>
      )}

      {/* Product list with Book buttons */}
      {!bookedMsg && !loadingRates && hasProducts && (
        <View>
          <Text style={styles.sectionLabel}>Choose your ride</Text>
          {products.map((p) => (
            <View key={p.display_name} style={styles.productRow}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{p.display_name}</Text>
                <Text style={styles.productMeta}>
                  {p.eta_minutes ? `~${p.eta_minutes} min` : ''}
                  {p.capacity ? ` · ${p.capacity} seats` : ''}
                </Text>
              </View>
              <Text style={styles.productPrice}>{p.estimate}</Text>
              <TouchableOpacity
                style={styles.bookBtn}
                onPress={() =>
                  confirmAndBook(p, calendarEventId, pickupLatitude, pickupLongitude, pickupLabel, setBookedMsg)
                }
              >
                <Text style={styles.bookBtnText}>Book</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Fallback: no products — show deeplink or airport options */}
      {!bookedMsg && !loadingRates && !hasProducts && !card.connect_uber_url && (
        <>
          {airportOptions.length === 0 && (card.uber_app_url || card.deep_link_url) && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => openUber(card.uber_app_url, card.deep_link_url)}
            >
              <Text style={styles.primaryBtnText}>Open in Uber</Text>
            </TouchableOpacity>
          )}
          {airportOptions.length > 0 && (
            <View>
              <Text style={styles.sectionLabel}>Choose your departure airport</Text>
              {airportOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={styles.optionBtn}
                  onPress={() => openUber(opt.uber_app_url, opt.deep_link_url)}
                >
                  <Text style={styles.optionBtnText}>{opt.label}</Text>
                  <Text style={styles.optionChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {/* Alternative airport options (origin far from user) */}
      {altOptions.length > 0 && (
        <View style={styles.altSection}>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Or fly from near you</Text>
          {altOptions.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={styles.optionBtn}
              onPress={() => openUber(opt.uber_app_url, opt.deep_link_url)}
            >
              <Text style={styles.optionBtnText}>{opt.label}</Text>
              <Text style={styles.optionChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!bookedMsg && (
        <Text style={styles.disclaimer}>
          {hasProducts
            ? 'Booking charges your Uber payment method.'
            : 'Opens Uber with pickup and destination pre-filled.'}
        </Text>
      )}
    </View>
  );
}

export default function RecommendationCard({
  card,
  calendarEventId,
  pickupLatitude,
  pickupLongitude,
  pickupLabel,
}: Props) {
  switch (card.kind) {
    // ── Roaming plan ─────────────────────────────────────────────────────────
    case 'roaming_plan': {
      const plan = card.plan;
      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>ROAMING PLAN</Text>
          </View>

          <Text style={styles.planName}>{plan.plan_name}</Text>
          <View style={styles.planMetaRow}>
            <MetaPill label={`${plan.data_gb} GB`} />
            <MetaPill label={`${plan.duration_days} days`} />
            <MetaPill label={`${plan.price} ${plan.currency}`} />
          </View>

          {plan.description ? (
            <Text style={styles.planDescription}>{plan.description}</Text>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Why this plan</Text>
          <Text style={styles.reasoningText}>{card.reasoning}</Text>

          <View style={styles.judgeRow}>
            <Text style={[styles.judgeBadge, card.judge_approved ? styles.judgeApproved : styles.judgeFlagged]}>
              {card.judge_approved ? 'AI approved' : 'AI flagged'}
            </Text>
            {card.judge_feedback ? (
              <Text style={styles.judgeFeedback}>{card.judge_feedback}</Text>
            ) : null}
          </View>
        </View>
      );
    }

    // ── Uber ride ─────────────────────────────────────────────────────────────
    case 'uber_ride':
      return (
        <UberRideCard
          card={card}
          calendarEventId={calendarEventId}
          pickupLatitude={pickupLatitude}
          pickupLongitude={pickupLongitude}
          pickupLabel={pickupLabel}
        />
      );

    default: {
      const _exhaustive: never = card;
      return _exhaustive;
    }
  }
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },

  // Card header (label row)
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: '#ABABAB',
  },
  uberLogo: {
    fontSize: 16,
    color: '#ABABAB',
  },

  // ── Roaming plan ──
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F0F0F',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  planMetaRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaPill: {
    backgroundColor: '#F2F2F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  planDescription: {
    fontSize: 14,
    color: '#6B6B6B',
    lineHeight: 20,
    marginBottom: 4,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EDEDEB',
    marginVertical: 16,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#ABABAB',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B6B6B',
  },
  reasoningText: {
    fontSize: 14,
    color: '#6B6B6B',
    lineHeight: 21,
  },

  judgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  judgeBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  judgeApproved: {
    backgroundColor: '#EBF7EF',
    color: '#3A9E5F',
  },
  judgeFlagged: {
    backgroundColor: '#FEF3EC',
    color: '#D97A2A',
  },
  judgeFeedback: {
    fontSize: 13,
    color: '#6B6B6B',
    lineHeight: 19,
    flexShrink: 1,
  },

  // ── Uber ride ──
  uberMessage: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F0F0F',
    lineHeight: 24,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 14,
  },
  routeCity: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#6B6B6B',
  },
  routeArrow: {
    fontSize: 13,
    color: '#ABABAB',
  },

  quoteBlock: {
    backgroundColor: '#F7F7F5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  quotePrice: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F0F0F',
  },
  quoteMeta: {
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
  },
  quoteStatus: {
    fontSize: 12,
    color: '#ABABAB',
    marginBottom: 12,
  },

  primaryBtn: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  outlineBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DEDEDE',
    marginBottom: 4,
  },
  outlineBtnText: {
    color: '#0F0F0F',
    fontSize: 15,
    fontWeight: '500',
  },

  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDEDEB',
  },
  optionBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F0F0F',
  },
  optionChevron: {
    fontSize: 20,
    color: '#C8C8C8',
  },

  altSection: {
    marginTop: 4,
  },

  // Product list
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDEDEB',
    gap: 8,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  productMeta: {
    fontSize: 12,
    color: '#ABABAB',
    marginTop: 2,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F0F0F',
    marginRight: 8,
  },
  bookBtn: {
    backgroundColor: '#0F0F0F',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Booked banner
  bookedBanner: {
    backgroundColor: '#EBF7EF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    alignItems: 'center',
  },
  bookedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A9E5F',
  },

  disclaimer: {
    fontSize: 11,
    color: '#C8C8C8',
    textAlign: 'center',
    marginTop: 14,
  },
});
