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
          <TouchableOpacity style={styles.primaryBtn} onPress={() => onConfirm(item.actionId)}>
            <Text style={styles.primaryBtnText}>Activate this plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => onDecline(item.actionId)}>
            <Text style={styles.outlineBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.state === 'submitting' && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#0F0F0F" />
          <Text style={styles.statusText}>Activating…</Text>
        </View>
      )}

      {item.state === 'confirmed' && (
        <Text style={styles.confirmedLabel}>Activated ✓</Text>
      )}

      {item.state === 'declined' && (
        <Text style={styles.declinedLabel}>Skipped</Text>
      )}

      {item.state === 'failed' && (
        <View style={styles.actions}>
          <Text style={styles.errorText}>{item.error ?? 'Something went wrong activating this plan.'}</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => onConfirm(item.actionId)}>
            <Text style={styles.outlineBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
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
    shadowRadius: 8,
    elevation: 2,
  },
  summary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F0F0F',
    lineHeight: 22,
    marginBottom: 16,
  },
  actions: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
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
  },
  outlineBtnText: {
    color: '#0F0F0F',
    fontSize: 15,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    color: '#6B6B6B',
    fontSize: 14,
  },
  confirmedLabel: {
    color: '#3A9E5F',
    fontWeight: '600',
    fontSize: 14,
  },
  declinedLabel: {
    color: '#ABABAB',
    fontWeight: '500',
    fontSize: 14,
  },
  errorText: {
    color: '#C0392B',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
});
