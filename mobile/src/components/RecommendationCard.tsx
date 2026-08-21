import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RecommendationCardPayload } from '../types';

type Props = {
  card: RecommendationCardPayload;
};

// Plan-card JSX/styles lifted near-verbatim from FlightDetailScreen.tsx's
// `recommendation.candidate_plan` block. Switches on `card.kind` so a future
// card variant (a second agent's recommendation shape) is an added branch,
// not a rewrite.
export default function RecommendationCard({ card }: Props) {
  switch (card.kind) {
    case 'roaming_plan':
      return (
        <View style={styles.planCard}>
          <Text style={styles.planName}>{card.plan.plan_name}</Text>
          <Text style={styles.planMeta}>
            {card.plan.data_gb}GB · {card.plan.duration_days} days · {card.plan.price} {card.plan.currency}
          </Text>
          <Text style={styles.planDescription}>{card.plan.description}</Text>

          <Text style={styles.sectionLabel}>Why the AI picked this</Text>
          <Text style={styles.reasoning}>{card.reasoning}</Text>

          <Text style={styles.sectionLabel}>AI reviewer: {card.judge_approved ? 'Approved ✅' : 'Flagged ⚠️'}</Text>
          <Text style={styles.reasoning}>{card.judge_feedback}</Text>
        </View>
      );
    case 'uber_ride': {
      const url = card.uber_app_url ?? card.deep_link_url;
      return (
        <View style={styles.uberCard}>
          <Text style={styles.uberHeading}>🚗 Uber Ride Suggestion</Text>
          {card.pickup_label && card.dropoff_label && (
            <Text style={styles.uberRoute}>
              {card.pickup_label} → {card.dropoff_label}
            </Text>
          )}
          <Text style={styles.uberMessage}>{card.suggested_message}</Text>
          {url && (
            <TouchableOpacity
              style={styles.uberButton}
              onPress={() => Linking.openURL(url)}
            >
              <Text style={styles.uberButtonText}>Open in Uber</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.uberDisclaimer}>
            Opens the Uber app with pickup and dropoff pre-filled.
          </Text>
        </View>
      );
    }

    default: {
      // Exhaustiveness guard — TS will error here if a new card kind is added
      // to RecommendationCardPayload without a matching case above.
      const _exhaustive: never = card;
      return _exhaustive;
    }
  }
}

const styles = StyleSheet.create({
  uberCard: {
    borderWidth: 1,
    borderColor: '#ffe0b2',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff8f0',
    marginBottom: 10,
  },
  uberHeading: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 6 },
  uberRoute: { fontSize: 13, color: '#555', marginBottom: 8 },
  uberMessage: { fontSize: 15, color: '#333', lineHeight: 21, marginBottom: 14 },
  uberButton: {
    backgroundColor: '#000',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  uberButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  uberDisclaimer: { fontSize: 11, color: '#999', textAlign: 'center' },
  planCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  planName: { fontSize: 18, fontWeight: '700' },
  planMeta: { color: '#444', marginTop: 4 },
  planDescription: { color: '#666', marginTop: 8 },
  sectionLabel: { fontWeight: '600', marginTop: 16, marginBottom: 4 },
  reasoning: { color: '#444', lineHeight: 20 },
});
