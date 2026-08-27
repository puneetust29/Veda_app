import { StyleSheet, Text, View } from 'react-native';

import type { Subscription } from '../../types';

type Props = {
  subscription: Subscription;
  planName: string;
};

export default function ReceiptCard({ subscription, planName }: Props) {
  const activatedAt = subscription.subscribed_at ? new Date(subscription.subscribed_at).toLocaleString() : null;

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>✓</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{planName}</Text>
        {activatedAt && <Text style={styles.meta}>Activated {activatedAt}</Text>}
        <Text style={styles.status}>Status: {subscription.status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  badgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1B5E20',
    marginBottom: 4,
  },
  meta: {
    color: '#666666',
    marginBottom: 3,
    fontSize: 12,
  },
  status: {
    color: '#666666',
    fontSize: 12,
    textTransform: 'capitalize',
  },
});
