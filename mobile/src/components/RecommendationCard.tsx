import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RecommendationCardPayload } from '../types';

type Props = {
  card: RecommendationCardPayload;
};

async function openUber(uberAppUrl: string | null, deepLinkUrl: string | null) {
  if (uberAppUrl) {
    try { await Linking.openURL(uberAppUrl); return; } catch { /* fall through */ }
  }
  if (deepLinkUrl) { await Linking.openURL(deepLinkUrl); }
}

export default function RecommendationCard({ card }: Props) {
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
    case 'uber_ride': {
      const airportOptions  = card.airport_options  ?? [];
      const altOptions      = card.alternative_options ?? [];

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>UBER RIDE</Text>
            <Text style={styles.uberLogo}>✈</Text>
          </View>

          <Text style={styles.uberMessage}>{card.suggested_message}</Text>

          {/* Direct route */}
          {(card.pickup_label || card.dropoff_label) && (
            <View style={styles.routeRow}>
              <Text style={styles.routeCity} numberOfLines={1}>{card.pickup_label ?? 'Current location'}</Text>
              <Text style={styles.routeArrow}>→</Text>
              <Text style={styles.routeCity} numberOfLines={1}>{card.dropoff_label}</Text>
            </View>
          )}

          {/* Live quote */}
          {card.live_quote && (
            <View style={styles.quoteBlock}>
              <Text style={styles.quotePrice}>{card.live_quote.estimate}</Text>
              <Text style={styles.quoteMeta}>
                {card.live_quote.product_name}
                {card.live_quote.eta_minutes ? ` · ~${card.live_quote.eta_minutes} min` : ''}
              </Text>
            </View>
          )}

          {card.quote_status && (
            <Text style={styles.quoteStatus}>{card.quote_status}</Text>
          )}

          {/* Connect Uber */}
          {card.connect_uber_url && (
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => Linking.openURL(card.connect_uber_url!)}
            >
              <Text style={styles.outlineBtnText}>Connect Uber account</Text>
            </TouchableOpacity>
          )}

          {/* Single-airport deeplink */}
          {airportOptions.length === 0 && !card.connect_uber_url && (card.uber_app_url || card.deep_link_url) && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => openUber(card.uber_app_url, card.deep_link_url)}
            >
              <Text style={styles.primaryBtnText}>Open in Uber</Text>
            </TouchableOpacity>
          )}

          {/* Multiple airport choices */}
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

          {/* Alternative airport options (origin is far from user) */}
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

          <Text style={styles.disclaimer}>Opens Uber with pickup and destination pre-filled.</Text>
        </View>
      );
    }

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

  disclaimer: {
    fontSize: 11,
    color: '#C8C8C8',
    textAlign: 'center',
    marginTop: 14,
  },
});
