import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

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

const CONTROL_HEIGHT = 40;

const sendArrow = `<svg width="13.2144" height="13.2136" viewBox="0 0 13.2144 13.2136" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0.607639 6.61057H12.6059" stroke="white" stroke-width="1.21528" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6.60764 0.607639L12.6068 6.60679L6.60764 12.6059" stroke="white" stroke-width="1.21528" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * Shared pill-style chat composer with a compact red arrow send button.
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
    <View style={[styles.wrapper, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <View style={[styles.container, !editable && styles.containerDisabled]}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
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
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <SvgXml xml={sendArrow} width={13.2144} height={13.2136} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 8,
    backgroundColor: colors.white,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 62,
    paddingHorizontal: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    borderRadius: 24,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  input: {
    flex: 1,
    height: CONTROL_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 14,
    color: colors.textSecondary,
  },
  sendButton: {
    width: CONTROL_HEIGHT,
    height: CONTROL_HEIGHT,
    borderRadius: CONTROL_HEIGHT / 2,
    backgroundColor: '#E60000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  containerDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#DEDEDE',
    opacity: 0.6,
  },
});
