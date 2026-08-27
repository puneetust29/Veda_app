import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChatItemView from '../components/chat/ChatItemView';
import { useWorkflowChat } from '../hooks/useWorkflowChat';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

function isInsuranceAlreadyPurchased(items: any[], currentIdx: number): boolean {
  // Check if there's a confirmation_success item with planType 'insurance' after this item
  for (let i = currentIdx + 1; i < items.length; i++) {
    if (items[i].kind === 'confirmation_success' && items[i].planType === 'insurance') {
      return true;
    }
  }
  return false;
}

export default function ChatScreen({ route, navigation }: Props) {
  const { event } = route.params;
  const { items, phase, confirm, decline, retry, sendMessage, handleInsurancePurchased, workflowState, continueWorkflow } = useWorkflowChat(event);
  const scrollViewRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* <View style={styles.tripHeader}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.subtitle}>
          {event.origin} → {event.destination}
        </Text>
        <Text style={styles.date}>
          {new Date(event.start_datetime).toLocaleDateString()} –{' '}
          {new Date(event.end_datetime).toLocaleDateString()}
        </Text>
      </View> */}

      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item, idx) => {
          // Skip hotel booking component
          if (item.kind === 'hotel') {
            return null;
          }

          // Skip rendering confirmation items for roaming plans - they're combined with the card
          if (item.kind === 'confirmation' && item.risk === 'commit') {
            const prevItem = idx > 0 ? items[idx - 1] : null;
            if (prevItem?.kind === 'card' && prevItem.card.kind === 'roaming_plan') {
              return null; // Skip - already rendered with the card
            }
          }

          return (
            <ChatItemView
              key={item.id}
              item={item}
              onConfirm={confirm}
              onDecline={decline}
              onInsurancePurchased={item.kind === 'travel_insurance' && isInsuranceAlreadyPurchased(items, idx) ? undefined : handleInsurancePurchased}
              onContinuePrep={continueWorkflow}
              // Pass the next item if it's a confirmation for a roaming card
              nextItem={
                item.kind === 'card' && item.card.kind === 'roaming_plan' && items[idx + 1]?.kind === 'confirmation'
                  ? items[idx + 1]
                  : undefined
              }
            />
          );
        })}
      </ScrollView>

      {phase === 'complete' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Subscriptions')}>
            <Text style={styles.primaryButtonText}>View my plans</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'failed' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={retry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.replace('FlightDetail', { event })}
          >
            <Text style={styles.secondaryButtonText}>Continue without chat</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask a follow-up question…"
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  tripHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1F1F1F' },
  subtitle: { color: '#666666', marginTop: 6, fontSize: 15 },
  date: { color: '#999999', marginTop: 4, fontSize: 13 },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 8 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#D32F2F',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D32F2F',
  },
  secondaryButtonText: { color: '#D32F2F', fontSize: 16, fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F9F9F9',
    color: '#1F1F1F',
  },
  sendButton: {
    backgroundColor: '#D32F2F',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
