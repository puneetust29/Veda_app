import { StyleSheet, Text, View } from 'react-native';

import type { RecommendationCardPayload } from '../../types';

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
    default:
      // `RecommendationCardPayload` only has one member today (`roaming_plan`).
      // Unlike `ChatItemView`'s switch (a true multi-member union), TS can't
      // narrow a single-member union to `never` here, so this branch is a
      // plain fallback rather than a `never`-checked exhaustiveness guard —
      // it becomes live again the moment a second card kind is added above.
      return null;
  }
}

const styles = StyleSheet.create({
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
