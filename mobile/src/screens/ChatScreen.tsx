import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatItemView from '../components/chat/ChatItemView';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import LoadingStream from '../components/chat/LoadingStream';
import BillPaymentCard from '../components/chat/BillPaymentCard';
import PaymentCompleteCard from '../components/chat/PaymentCompleteCard';
import { useAuth } from '../context/AuthContext';
import { useWorkflowChat } from '../hooks/useWorkflowChat';
import { useBillPaymentChat } from '../hooks/useBillPaymentChat';
import { api } from '../lib/api';
import { INITIAL_STREAM_EVENTS } from '../lib/mockStream';
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
  const { customer } = useAuth();

  // Detect if this is a bill payment flow
  const isBillPayment = event.event_type === 'broadbandBill';

  console.log('[ChatScreen] opened for event:', event.title, '| type:', event.event_type, '| start:', event.start_datetime);

  // Use appropriate hook based on event type
  const workflowResult = useWorkflowChat(event);
  const billPaymentResult = useBillPaymentChat(event);

  const { items, phase } = isBillPayment ? billPaymentResult : workflowResult;
  const { confirm, decline, retry, sendMessage, handleInsurancePurchased, workflowState, continueWorkflow } = isBillPayment
    ? { confirm: () => {}, decline: () => {}, retry: () => {}, sendMessage: () => {}, handleInsurancePurchased: () => {}, workflowState: {}, continueWorkflow: () => {} }
    : workflowResult;

  const scrollViewRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [paymentMethodBrand, setPaymentMethodBrand] = useState<string>('');
  const [paymentMethodLast4, setPaymentMethodLast4] = useState<string>('');
  const [paidBillData, setPaidBillData] = useState<any>(null);
  const itemCountRef = useRef(0);

  const firstName = customer?.full_name?.split(' ')[0] ?? 'User';
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isBillPayment) {
      // Check if bill is already paid
      api.getBillPaymentStatus(event.id)
        .then((billPayment) => {
          if (billPayment) {
            setPaidBillData(billPayment);
          } else {
            // Bill not paid yet, fetch payment method
            api.getCustomerPaymentMethods()
              .then((method) => {
                if (method.id) {
                  setPaymentMethodId(method.id);
                  setPaymentMethodBrand(method.brand || '');
                  setPaymentMethodLast4(method.last4 || '');
                }
              })
              .catch((err) => console.warn('[ChatScreen] Failed to fetch payment method:', err));
          }
        })
        .catch((err) => console.warn('[ChatScreen] Failed to check bill payment status:', err));

      // Initialize bill chat if not already done
      if (items.length === 0) {
        billPaymentResult.initializeBillChat();
      }
    }
  }, [isBillPayment, billPaymentResult, items.length, event.id]);

  useEffect(() => {
    if (items.length > itemCountRef.current) {
      itemCountRef.current = items.length;
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [items]);

  return (
    <View style={styles.container}>
      <DashboardHeader
        avatarInitial={firstName.charAt(0).toUpperCase()}
        onPressHistory={() => navigation.goBack()}
        onPressClose={() => navigation.goBack()}
        menuItems={[]}
      />
      <View style={styles.content}>
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
      >
        {isBillPayment ? (
          <>
            {/* Bill greeting message */}
            {items.map((item) => (
              <ChatItemView key={item.id} item={item} />
            ))}

            {/* Show payment complete if already paid */}
            {paidBillData ? (
              <PaymentCompleteCard
                paymentMethodBrand={paymentMethodBrand}
                paymentMethodLast4={paymentMethodLast4}
                transactionId={paidBillData.payment_intent_id}
                amount={paidBillData.amount}
                currency={paidBillData.bill_details?.bill_currency || 'USD'}
              />
            ) : paymentMethodId ? (
              <BillPaymentCard
                bill={event}
                paymentMethodBrand={paymentMethodBrand}
                paymentMethodLast4={paymentMethodLast4}
                savedPaymentMethodId={paymentMethodId}
                onSuccess={() => {
                  billPaymentResult.handlePaymentSuccess({});
                  setTimeout(() => navigation.goBack(), 2000);
                }}
                onError={(error) => billPaymentResult.handlePaymentError(error)}
              />
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading payment details...</Text>
              </View>
            )}
          </>
        ) : items.length === 0 && phase === 'idle' ? (
          <LoadingStream items={INITIAL_STREAM_EVENTS} />
        ) : null}
        {!isBillPayment && items.map((item, idx) => {
          // Skip hotel booking component
          if (item.kind === 'hotel') return null;


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
              onInsurancePurchased={handleInsurancePurchased}
              onContinuePrep={continueWorkflow}
              continuePrepLoading={phase === 'streaming'}
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

      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, backgroundColor: '#FFFFFF' },
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
    paddingTop: 12,
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
  loadingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#999999',
  },
});
