import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChatItemView from '../components/chat/ChatItemView';
import { useVedaChat } from '../hooks/useVedaChat';
import type { RootStackParamList } from '../types';
import { colors, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VedaChat'>;

export default function VedaChatScreen({ navigation }: Props) {
  const { items, phase, sendMessage, retry } = useVedaChat();
  const scrollViewRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item) => (
          <ChatItemView
            key={item.id}
            item={item}
            onChoiceSelect={(value) => {
              sendMessage(value);
            }}
          />
        ))}
      </ScrollView>

      {phase === 'failed' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={retry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask me about travel plans or Veda…"
          value={draft}
          onChangeText={setDraft}
          editable={phase !== 'streaming'}
          placeholderTextColor="#999"
        />
        <TouchableOpacity
          style={[styles.sendButton, phase === 'streaming' && styles.sendButtonDisabled]}
          onPress={() => {
            sendMessage(draft);
            setDraft('');
          }}
          disabled={phase === 'streaming' || !draft.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  thread: { flex: 1 },
  threadContent: { padding: spacing.lg, paddingBottom: spacing.md },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    padding: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: spacing.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: { color: colors.white, fontSize: 14, fontWeight: '600' },
});
