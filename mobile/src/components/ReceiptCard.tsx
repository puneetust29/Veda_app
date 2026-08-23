import { StyleSheet, Text, View } from 'react-native';

import type { Subscription } from '../types';

type Props = {
  subscription: Subscription;
  planName: string;
};

export default function ReceiptCard({ subscription, planName }: Props) {
  const activatedAt = subscription.subscribed_at
    ? new Date(subscription.subscribed_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.check}>✓</Text>
        <Text style={styles.planName}>{planName}</Text>
      </View>
      {activatedAt && (
        <Text style={styles.meta}>Activated {activatedAt}</Text>
      )}
      <Text style={styles.status}>{subscription.status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F2FAF5',
    borderRadius: 18,
    padding: 18,
    borderLeftWidth: 3,
    borderLeftColor: '#3A9E5F',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  check: {
    fontSize: 16,
    color: '#3A9E5F',
    fontWeight: '700',
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F0F',
    flexShrink: 1,
  },
  meta: {
    color: '#6B6B6B',
    fontSize: 13,
    marginBottom: 2,
  },
  status: {
    color: '#ABABAB',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});
