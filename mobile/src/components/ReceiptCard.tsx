import { StyleSheet, Text, View } from 'react-native';

import type { Subscription } from '../types';

type Props = {
  subscription: Subscription;
  planName: string;
};

export default function ReceiptCard({ subscription, planName }: Props) {
  const activatedAt = subscription.subscribed_at ? new Date(subscription.subscribed_at).toLocaleString() : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>✓ {planName}</Text>
      {activatedAt && <Text style={styles.meta}>Activated {activatedAt}</Text>}
      <Text style={styles.status}>Status: {subscription.status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#d7ead9',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#f2fbf3',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0a7a3f' },
  meta: { color: '#444', marginTop: 6, fontSize: 13 },
  status: { color: '#444', marginTop: 2, fontSize: 13, textTransform: 'capitalize' },
});
