import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, fonts, spacing } from '../../theme';
import { api } from '../../lib/api';
import { useSubscriptionInsurance } from '../../context/SubscriptionInsuranceContext';
import type { CalendarEvent } from '../../types';
import PaymentProcessingCard from './PaymentProcessingCard';

type State = 'idle' | 'processing' | 'success' | 'error';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
};

type Props = {
  bill: CalendarEvent;
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
  savedPaymentMethodId: string;
  onSuccess: (data: any) => void;
  onError?: (error: string) => void;
};

export default function BillPaymentCard({
  bill,
  paymentMethodBrand,
  paymentMethodLast4,
  savedPaymentMethodId,
  onSuccess,
  onError,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { refreshBills } = useSubscriptionInsurance();

  const rawDetails = bill.raw_details as any || {};
  const billType = rawDetails.bill_type || 'Utility';
  const billAmount = rawDetails.bill_amount || 0;
  const billCurrency = rawDetails.bill_currency || 'USD';
  const currencySymbol = CURRENCY_SYMBOLS[billCurrency] || billCurrency;

  const handlePayment = async () => {
    try {
      setState('processing');
      setErrorMessage('');

      // Create payment intent for bill (convert to cents for stripe)
      const amountInCents = Math.round(billAmount * 100);

      const intent = await api.createBillPaymentIntent(
        bill.id,
        amountInCents,
        billCurrency,
        savedPaymentMethodId,
      );

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intent.client_secret,
        customerId: intent.customer_id,
        customerEphemeralKeySecret: intent.ephemeral_key_secret,
        merchantDisplayName: 'Veda',
      });

      if (initError) {
        setErrorMessage(initError.message);
        setState('error');
        onError?.(initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        setErrorMessage(presentError.message);
        setState('error');
        onError?.(presentError.message);
        return;
      }

      const paymentIntentId = intent.client_secret?.split('_secret_')[0] || '';

      // Confirm bill payment
      const purchaseData = await api.confirmBillPayment(
        bill.id,
        paymentIntentId,
      );

      // Refresh bill payment status in context
      await refreshBills();

      setState('success');
      setTimeout(() => {
        onSuccess(purchaseData);
      }, 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Payment failed';
      setErrorMessage(errorMsg);
      setState('error');
      onError?.(errorMsg);
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  if (state === 'processing') {
    return <PaymentProcessingCard />;
  }

  return (
    <View style={styles.card}>
      {/* Title */}
      <Text style={styles.title}>This month's bills</Text>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Bills List */}
      <View style={styles.billsList}>
        <View style={styles.billRow}>
          <Text style={styles.billName}>{billType.charAt(0).toUpperCase() + billType.slice(1)}</Text>
          <Text style={styles.billAmount}>
            {currencySymbol}{billAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>
          {currencySymbol}{billAmount.toFixed(2)}
        </Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Payment Method */}
      {paymentMethodBrand && paymentMethodLast4 && (
        <View style={styles.paymentMethod}>
          <Text style={styles.paymentMethodText}>
            Paying with {paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1)} •••• {paymentMethodLast4}
          </Text>
        </View>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Error State */}
      {errorMessage && (
        <View style={styles.errorSection}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            style={[styles.button, styles.retryButton]}
            onPress={handleRetry}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Success State */}
      {state === 'success' && (
        <View style={styles.successSection}>
          <Text style={styles.successText}>✓ Payment Successful!</Text>
        </View>
      )}

      {/* Pay Button */}
      {state !== 'success' && !errorMessage && (
        <TouchableOpacity
          style={[styles.button, styles.payButton]}
          onPress={handlePayment}
          disabled={state === 'processing'}
        >
          {state === 'processing' ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Pay all</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.lg,
    marginVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: spacing.md,
  },
  billsList: {
    paddingVertical: spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  billName: {
    fontFamily: fonts.bodyLight,
    fontSize: 14,
    color: colors.textPrimary,
  },
  billAmount: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalLabel: {
    fontFamily: fonts.bodyLight,
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalAmount: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  paymentMethod: {
    paddingVertical: spacing.sm,
  },
  paymentMethodText: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textPrimary,
  },
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  payButton: {
    backgroundColor: colors.accentCta,
  },
  retryButton: {
    backgroundColor: colors.accentButton,
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: 'white',
  },
  errorSection: {
    paddingVertical: spacing.md,
  },
  errorText: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: '#E60000',
    marginBottom: spacing.md,
  },
  successSection: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  successText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: '#4CAF50',
  },
});
