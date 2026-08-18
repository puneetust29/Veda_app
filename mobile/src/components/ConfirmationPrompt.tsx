import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ChatItem } from '../types';

type ConfirmationItem = Extract<ChatItem, { kind: 'confirmation' }>;

type Props = {
  item: ConfirmationItem;
  onConfirm: (actionId: string) => void;
  onDecline: (actionId: string) => void;
};

export default function ConfirmationPrompt({ item, onConfirm, onDecline }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.summary}>{item.summary}</Text>

      {item.state === 'pending' && item.risk === 'commit' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => onConfirm(item.actionId)}>
            <Text style={styles.primaryButtonText}>Activate this plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onDecline(item.actionId)}>
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.state === 'submitting' && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#111" />
          <Text style={styles.statusText}>Activating…</Text>
        </View>
      )}

      {item.state === 'confirmed' && <Text style={styles.confirmedLabel}>Activated ✓</Text>}

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
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  summary: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  primaryButton: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#111',
  },
  secondaryButtonText: { color: '#111', fontSize: 15, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: '#444', fontSize: 14 },
  confirmedLabel: { color: '#0a7a3f', fontWeight: '700' },
  declinedLabel: { color: '#888', fontWeight: '600' },
  errorText: { color: '#c0392b', marginBottom: 10 },
});
