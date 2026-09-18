import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { CalendarEvent, ChatItem } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'awaiting_payment' | 'complete' | 'failed';

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€' };

function formatCurrencyAmount(currency: string, amount: number): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}

function formatDueDate(dueDate: string | undefined): string {
  if (!dueDate) return 'Due soon';
  return new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

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
    const dueDate = formatDueDate(rawDetails.due_date);

    const greeting: ChatItem = {
      id: '1',
      kind: 'text',
      role: 'agent',
      text: `Your ${billProvider} broadband bill is ready. Amount due: **${formatCurrencyAmount(billCurrency, billAmount)} on ${dueDate}**`,
      createdAt: Date.now(),
      connectApps: ['gmail', 'vodafone'],
    };

    setItems([greeting]);
    setPhase('awaiting_payment');
  }, []);

  const handlePaymentSuccess = useCallback((purchaseData: any) => {
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
