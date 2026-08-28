import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RecommendationCardPayload, ChatItem } from '../../types';
import { openUber } from '../../lib/uberDeeplink';

type ConfirmationItem = Extract<ChatItem, { kind: 'confirmation' }>;

type Props = {
  card: RecommendationCardPayload;
  confirmation?: ConfirmationItem;
  onConfirm?: (actionId: string) => void;
  onDecline?: (actionId: string) => void;
};

// Extract price from summary text (e.g., "Activate Asia Explorer India 7 — 22.0 EUR")
function extractPrice(summary: string): string | null {
  const match = summary.match(/—\s*([\d.]+\s*[A-Z]{3})/);
  return match ? match[1] : null;
}

// Parse reasoning into bullet points - split by sentences or key phrases
function parseReasoningPoints(reasoning: string): string[] {
  // First check if it's already split by newlines
  const lines = reasoning.split('\n').filter((line) => line.trim());
  if (lines.length > 1) {
    return lines;
  }

  // If it's a single paragraph, try to split by sentences
  // Look for periods followed by space or end of string, but keep short phrases together
  const sentences = reasoning
    .split(/(?<=[.!?])\s+(?=[A-Z])|\.(?=\s[A-Z])|;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 200); // Filter out too short or too long fragments

  if (sentences.length > 1) {
    return sentences;
  }

  // If no good split found, just return the original reasoning as single point
  return [reasoning.trim()];
}

export default function RecommendationCard({ card, confirmation, onConfirm, onDecline }: Props) {
  switch (card.kind) {
    case 'roaming_plan': {
      const price = confirmation ? extractPrice(confirmation.summary) : null;

      return (
        <View style={styles.planCard}>
          {/* Provider Section */}
          <View style={styles.providerSection}>
            <View style={styles.providerBadge}>
              <Text style={styles.providerBadgeText}>🌍</Text>
            </View>
            <Text style={styles.providerName}>{card.plan.country_name}</Text>
          </View>

          {/* Plan Name */}
          <Text style={styles.planName}>{card.plan.plan_name}</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Why This One Section */}
          <Text style={styles.sectionHeader}>Why this one</Text>
          <View style={styles.reasoningList}>
            {parseReasoningPoints(card.reasoning).map((line, idx) => (
              <View key={idx} style={styles.reasoningItem}>
                <Text style={styles.checkmark}>✓</Text>
                <Text style={styles.reasoningText}>{line}</Text>
              </View>
            ))}
          </View>

          {/* Family Setup Section - Placeholder */}
          <View style={styles.divider} />
          <Text style={styles.sectionHeader}>Family setup</Text>
          <View style={styles.familySetup}>
            <View style={styles.familyMember}>
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarText}>👤</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>All travellers</Text>
                <Text style={styles.memberPlan}>Data plan included</Text>
              </View>
            </View>
          </View>

          {/* Total & Buttons Section */}
          {confirmation && price && (
            <>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalPrice}>{price}</Text>
              </View>

              {confirmation.state === 'pending' && confirmation.risk === 'commit' && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => onDecline?.(confirmation.actionId)}
                  >
                    <Text style={styles.secondaryButtonText} numberOfLines={1}>Not now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => onConfirm?.(confirmation.actionId)}
                  >
                    <Text style={styles.primaryButtonText} numberOfLines={1}>Approve roaming</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      );
    }
    case 'uber_ride': {
      const hasDirectLink = card.uber_app_url || card.deep_link_url;
      const hasAirportOptions = card.airport_options.length > 0;

      const handleOpenUber = async (uber_app_url?: string | null, deep_link_url?: string | null) => {
        try {
          await openUber({ uber_app_url, deep_link_url });
        } catch {
          Alert.alert('Uber not available', 'Could not open Uber. Please install the Uber app or try again.');
        }
      };

      return (
        <View style={uberStyles.card}>
          {/* Header */}
          <View style={uberStyles.header}>
            <View style={uberStyles.wordmark}>
              <Text style={uberStyles.wordmarkText}>UBER</Text>
            </View>
            <Text style={uberStyles.tagline}>{card.suggested_message}</Text>
          </View>

          {/* Route */}
          <View style={uberStyles.route}>
            <View style={uberStyles.routeTimeline}>
              <View style={uberStyles.dotPickup} />
              <View style={uberStyles.routeConnector} />
              <View style={uberStyles.dotDropoff} />
            </View>
            <View style={uberStyles.routeLabels}>
              <View style={uberStyles.routeStop}>
                <Text style={uberStyles.routeStopLabel}>Pickup</Text>
                <Text style={uberStyles.routeStopValue} numberOfLines={1}>
                  {card.pickup_label || 'Current location'}
                </Text>
              </View>
              <View style={uberStyles.routeStop}>
                <Text style={uberStyles.routeStopLabel}>Drop-off</Text>
                <Text style={uberStyles.routeStopValue} numberOfLines={1}>
                  {card.dropoff_label || 'Destination'}
                </Text>
              </View>
            </View>
          </View>

          {/* Direct book CTA */}
          {hasDirectLink && !hasAirportOptions && (
            <TouchableOpacity
              style={uberStyles.ctaButton}
              onPress={() => handleOpenUber(card.uber_app_url, card.deep_link_url)}
              activeOpacity={0.85}
            >
              <Text style={uberStyles.ctaButtonText}>Open in Uber</Text>
            </TouchableOpacity>
          )}

          {/* Airport options */}
          {hasAirportOptions && (
            <>
              <Text style={uberStyles.optionsLabel}>Choose your airport</Text>
              {card.airport_options.map((opt, i) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[uberStyles.airportRow, i < card.airport_options.length - 1 && uberStyles.airportRowBorder]}
                  onPress={() => handleOpenUber(opt.uber_app_url, opt.deep_link_url)}
                  activeOpacity={0.7}
                >
                  <View style={uberStyles.airportDot} />
                  <Text style={uberStyles.airportRowText}>{opt.label}</Text>
                  <Text style={uberStyles.airportRowArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Alternative airports */}
          {card.alternative_options.length > 0 && (
            <>
              <View style={uberStyles.separator} />
              <Text style={uberStyles.optionsLabel}>Nearest airports</Text>
              {card.alternative_options.map((opt, i) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[uberStyles.airportRow, i < card.alternative_options.length - 1 && uberStyles.airportRowBorder]}
                  onPress={() => handleOpenUber(opt.uber_app_url, opt.deep_link_url)}
                  activeOpacity={0.7}
                >
                  <View style={uberStyles.airportDot} />
                  <Text style={uberStyles.airportRowText}>{opt.label}</Text>
                  <Text style={uberStyles.airportRowArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  planCard: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  providerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  providerBadgeText: {
    fontSize: 22,
  },
  providerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 16,
    lineHeight: 28,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 14,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
    marginBottom: 12,
  },
  reasoningList: {
    gap: 12,
  },
  reasoningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkmark: {
    fontSize: 16,
    color: '#D32F2F',
    fontWeight: '700',
    marginRight: 10,
    marginTop: 0,
  },
  reasoningText: {
    fontSize: 15,
    color: '#1F1F1F',
    flex: 1,
    lineHeight: 22,
  },
  familySetup: {
    gap: 10,
  },
  familyMember: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
  },
  memberInfo: {
    flex: 1,
    paddingTop: 2,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F1F1F',
    marginBottom: 2,
  },
  memberPlan: {
    fontSize: 13,
    color: '#999999',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#D32F2F',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D32F2F',
  },
  secondaryButtonText: {
    color: '#D32F2F',
    fontSize: 16,
    fontWeight: '600',
  },
  uberBadge: {
    backgroundColor: '#000000',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tripLabel: {
    fontSize: 13,
    color: '#999999',
    width: 28,
  },
  tripValue: {
    fontSize: 14,
    color: '#1F1F1F',
    fontWeight: '500',
    flex: 1,
  },
  airportOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  airportOptionText: {
    fontSize: 14,
    color: '#1F1F1F',
    fontWeight: '500',
    flex: 1,
  },
  airportOptionCta: {
    fontSize: 13,
    color: '#D32F2F',
    fontWeight: '600',
    marginLeft: 8,
  },
});

const uberStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 6,
  },
  wordmark: {
    alignSelf: 'flex-start',
  },
  wordmarkText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '400',
    lineHeight: 20,
  },
  route: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
    alignItems: 'stretch',
  },
  routeTimeline: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    width: 12,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#9E9E9E',
  },
  routeConnector: {
    flex: 1,
    width: 2,
    backgroundColor: '#E0E0E0',
    marginVertical: 4,
    minHeight: 20,
  },
  dotDropoff: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000000',
  },
  routeLabels: {
    flex: 1,
    gap: 16,
  },
  routeStop: {
    gap: 2,
  },
  routeStopLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeStopValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  ctaButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  optionsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  airportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  airportRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  airportDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000000',
    flexShrink: 0,
  },
  airportRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1F1F1F',
  },
  airportRowArrow: {
    fontSize: 20,
    color: '#9E9E9E',
    fontWeight: '300',
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginBottom: 16,
  },
});
