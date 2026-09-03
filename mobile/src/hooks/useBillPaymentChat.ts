import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { CalendarEvent, ChatItem } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'awaiting_payment' | 'complete' | 'failed';

export function useBillPaymentChat(event: CalendarEvent) {
  const { customer } = useAuth();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [phase, setPhase] = useState<ChatPhase>('idle');

  // Initialize with bill summary
  const initializeBillChat = useCallback(() => {
    const rawDetails = event.raw_details as any || {};
    const billProvider = rawDetails.bill_provider || 'Broadband';
    const billAmount = rawDetails.bill_amount || 0;
    const billCurrency = rawDetails.bill_currency || 'USD';
    const dueDate = rawDetails.due_date ? new Date(rawDetails.due_date).toLocaleDateString() : 'Due soon';

    const greeting: ChatItem = {
      id: '1',
      kind: 'text',
      role: 'agent',
      text: `Here's your ${billProvider} broadband bill for this month. Amount due: ${billCurrency}${billAmount.toFixed(2)} on ${dueDate}.`,
      createdAt: Date.now(),
    };

    setItems([greeting]);
    setPhase('awaiting_payment');
  }, [event]);

  const handlePaymentSuccess = useCallback((purchaseData: any) => {
    const successMessage: ChatItem = {
      id: Date.now().toString(),
      kind: 'text',
      role: 'agent',
      text: `Payment successful! Your bill has been paid.`,
      createdAt: Date.now(),
    };

    setItems((prev) => [...prev, successMessage]);
    setPhase('complete');
  }, []);

  const handlePaymentError = useCallback((error: string) => {
    const errorMessage: ChatItem = {
      id: Date.now().toString(),
      kind: 'text',
      role: 'agent',
      text: `Payment failed: ${error}. Please try again.`,
      createdAt: Date.now(),
    };

    setItems((prev) => [...prev, errorMessage]);
    setPhase('failed');
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (items.length === 0 && phase === 'idle') {
      initializeBillChat();
    }
  }, []);

  return {
    items,
    phase,
    event,
    initializeBillChat,
    handlePaymentSuccess,
    handlePaymentError,
  };
}
