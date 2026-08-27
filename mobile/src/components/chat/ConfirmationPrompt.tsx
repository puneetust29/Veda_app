import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ChatItem } from '../../types';

type ConfirmationItem = Extract<ChatItem, { kind: 'confirmation' }>;

type Props = {
  item: ConfirmationItem;
  onConfirm: (actionId: string) => void;
  onDecline: (actionId: string) => void;
};

// Extract price from summary text (e.g., "Activate Asia Explorer India 7 — 22.0 EUR")
function extractPrice(summary: string): string | null {
  const match = summary.match(/—\s*([\d.]+\s*[A-Z]{3})/);
  return match ? match[1] : null;
}

export default function ConfirmationPrompt({ item, onConfirm, onDecline }: Props) {
  const price = extractPrice(item.summary);

  return (
    <View style={styles.card}>
      <Text style={styles.summary}>{item.summary}</Text>

      {item.state === 'pending' && item.risk === 'commit' && (
        <>
          {price && (
            <>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalPrice}>{price}</Text>
              </View>
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => onDecline(item.actionId)}>
              <Text style={styles.secondaryButtonText}>Modify</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => onConfirm(item.actionId)}>
              <Text style={styles.primaryButtonText}>Approve roaming</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {item.state === 'submitting' && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#D32F2F" />
          <Text style={styles.statusText}>Activating…</Text>
        </View>
      )}

      {item.state === 'confirmed' && <Text style={styles.confirmedLabel}>✓ Activated</Text>}

      {item.state === 'declined' && <Text style={styles.declinedLabel}>Not now</Text>}

      {item.state === 'failed' && (
        <View>
          <Text style={styles.errorText}>{item.error ?? 'Something went wrong activating this plan.'}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onConfirm(item.actionId)}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  summary: { fontSize: 15, fontWeight: '600', color: '#1F1F1F', marginBottom: 14 },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginBottom: 14,
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
  actions: { flexDirection: 'row', gap: 12 },
  primaryButton: {
    flex: 1,
    backgroundColor: '#D32F2F',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D32F2F',
  },
  secondaryButtonText: { color: '#D32F2F', fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: '#666666', fontSize: 14 },
  confirmedLabel: { color: '#1B5E20', fontWeight: '700', fontSize: 14 },
  declinedLabel: { color: '#999999', fontWeight: '600', fontSize: 14 },
  errorText: { color: '#D32F2F', marginBottom: 12, fontSize: 13 },
});
