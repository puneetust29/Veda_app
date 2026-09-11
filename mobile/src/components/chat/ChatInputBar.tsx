import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { colors } from '../../theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  /** Disables typing (e.g. while a reply is streaming). */
  editable?: boolean;
  /** Disables the send button independently of `editable`. */
  sendDisabled?: boolean;
  /** Shows a spinner in place of the send icon. */
  loading?: boolean;
  /** Extra padding below the bar, typically the safe-area bottom inset. */
  bottomInset?: number;
};

const CONTROL_HEIGHT = 52;

/**
 * Shared pill-style chat composer: a rounded text field with a light outline
 * and a separate circular grey send button with a paper-plane icon.
 */
export default function ChatInputBar({
  value,
  onChangeText,
  onSend,
  placeholder = 'Reply to Veda',
  editable = true,
  sendDisabled = false,
  loading = false,
  bottomInset = 0,
}: Props) {
  const canSend = !sendDisabled && !loading && value.trim().length > 0;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#8A8A8A"
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        returnKeyType="send"
        onSubmitEditing={canSend ? onSend : undefined}
        blurOnSubmit={false}
      />
      <TouchableOpacity
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send"
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator color="#555555" size="small" />
        ) : (
          <Ionicons name="paper-plane-outline" size={22} color="#555555" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    // Soft shadow along the top edge instead of a hard divider.
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 4,
  },
  input: {
    flex: 1,
    height: CONTROL_HEIGHT,
    borderRadius: CONTROL_HEIGHT / 2,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 0,
    fontSize: 17,
    color: colors.textPrimary,
  },
  sendButton: {
    width: CONTROL_HEIGHT,
    height: CONTROL_HEIGHT,
    borderRadius: CONTROL_HEIGHT / 2,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
});
