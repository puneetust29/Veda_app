import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AiDisclaimer from '../components/chat/AiDisclaimer';
import ChatInputBar from '../components/chat/ChatInputBar';
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
          <ChatItemView key={item.id} item={item} />
        ))}
        <AiDisclaimer />
      </ScrollView>

      {phase === 'failed' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={retry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ChatInputBar
        value={draft}
        onChangeText={setDraft}
        onSend={() => {
          sendMessage(draft);
          setDraft('');
        }}
        editable={phase !== 'streaming'}
        sendDisabled={phase === 'streaming'}
      />
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
});
