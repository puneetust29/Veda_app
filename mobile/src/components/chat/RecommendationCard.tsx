import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { RecommendationCardPayload, ChatItem } from '../../types';
import { vodafoneIcon } from '../dashboard/figmaSvgs';

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
        <View style={styles.cardShadow}>
          <View style={styles.planCard}>
          {/* Background Pattern */}
          <View style={styles.backgroundPattern} />
          {/* Provider Section */}
          <View style={styles.providerSection}>
            <View style={styles.providerBadge}>
              <SvgXml xml={vodafoneIcon} width={21} height={21} />
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>vodafone</Text>
            </View>
          </View>
          <View style={styles.providerSection}>
            <Text style={styles.providerName}>{card.plan.plan_name}</Text>
          </View>
          {/* Plan Name */}

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
        </View>
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
    cardShadow: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    borderRadius: 24,
  },
  planCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    overflow: 'hidden',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 141,
    backgroundColor: '#F5F5F5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    opacity: 0.3,
  },
  providerSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerBadge: {
    width: 21,
    height: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  providerIcon: {
    width: 21,
    height: 21,
    resizeMode: 'contain',
  },
  providerBadgeText: {
    fontSize: 17,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  providerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
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
    fontSize: 12,
    color: '#1A1A1A',
    fontWeight: '700',
    marginRight: 12,
    marginTop: 2,
  },
  reasoningText: {
    fontSize: 12,
    color: '#1A1A1A',
    flex: 1,
    lineHeight: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#F00405',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(230, 0, 0, 0.07)',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#E60000',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
