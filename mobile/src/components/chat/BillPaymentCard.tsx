import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, fonts, spacing } from '../../theme';
import { api } from '../../lib/api';
import { useSubscriptionInsurance } from '../../context/SubscriptionInsuranceContext';
import type { CalendarEvent } from '../../types';
import PaymentProcessingCard from './PaymentProcessingCard';
import VisaLogo from '../../../assets/payment/visa.svg';
import MastercardLogo from '../../../assets/payment/mastercard.svg';
import AmexLogo from '../../../assets/payment/amex.svg';

type State = 'idle' | 'processing' | 'success' | 'error';

type BillLineItem = {
  name: string;
  amount: number;
};

type BrandLogoConfig = {
  Logo: React.ComponentType<any>;
  width: number;
  height: number;
};

const PAYMENT_BRAND_LOGOS: Record<string, BrandLogoConfig> = {
  visa: { Logo: VisaLogo, width: 48, height: 16 },
  mastercard: { Logo: MastercardLogo, width: 52, height: 34 },
  'master card': { Logo: MastercardLogo, width: 52, height: 34 },
  amex: { Logo: AmexLogo, width: 52, height: 34 },
  'american express': { Logo: AmexLogo, width: 52, height: 34 },
};

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
  const candidateItems = Array.isArray(rawDetails.bill_items)
    ? rawDetails.bill_items
    : Array.isArray(rawDetails.line_items)
      ? rawDetails.line_items
      : [];

  const billLineItems: BillLineItem[] = candidateItems
    .map((item: any) => {
      const amount = Number(item?.amount ?? item?.bill_amount ?? 0);
      const rawName = item?.name ?? item?.label ?? item?.bill_type ?? '';
      const name = String(rawName || '').trim();

      if (!name) {
        return null;
      }

      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter(Boolean) as BillLineItem[];

  const fallbackItem: BillLineItem = {
    name: billType.charAt(0).toUpperCase() + billType.slice(1),
    amount: billAmount,
  };

  const displayItems = billLineItems.length > 0 ? billLineItems : [fallbackItem];
  const totalAmount = displayItems.reduce((sum, item) => sum + item.amount, 0);
  const normalizedBrand = (paymentMethodBrand || '').trim().toLowerCase();
  const brandConfig = PAYMENT_BRAND_LOGOS[normalizedBrand];

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
      <View style={styles.titleSection}>
        <Text style={styles.title}>This month's bills</Text>
      </View>

      <View style={styles.divider} />

      {/* Bills List */}
      <View style={styles.billsList}>
        {displayItems.map((item, index) => (
          <View
            key={`${item.name}-${index}`}
            style={[styles.billRow, index === displayItems.length - 1 && styles.billRowLast]}
          >
            <Text style={styles.billName}>{item.name}</Text>
            <Text style={styles.billAmount}>
              {currencySymbol}{item.amount.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>
          {currencySymbol}{totalAmount.toFixed(2)}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Payment Method */}
      {paymentMethodBrand && paymentMethodLast4 && (
        <View style={styles.paymentMethod}>
          <View style={styles.paymentBrandWrap}>
            {brandConfig ? (
              <brandConfig.Logo width={brandConfig.width} height={brandConfig.height} />
            ) : (
              <Text style={styles.paymentBrandLabel}>{paymentMethodBrand.toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.paymentMethodText}>
            Paying with {paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1)} •••• {paymentMethodLast4}
          </Text>
        </View>
      )}

      {paymentMethodBrand && paymentMethodLast4 && <View style={styles.divider} />}

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
          <Text style={styles.successText}>Payment successful</Text>
        </View>
      )}

      {/* Pay Button */}
      {state !== 'success' && !errorMessage && (
        <TouchableOpacity
          style={[styles.button, styles.payButton]}
          onPress={handlePayment}
          disabled={false}
        >
          <Text style={styles.buttonText}>Pay all</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginVertical: spacing.md,
    shadowOpacity: 0,
    elevation: 0,
    overflow: 'hidden',
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    lineHeight: 21,
    color: '#181818',
  },
  divider: {
    height: 1,
    backgroundColor: '#ECECEC',
  },
  billsList: {
    paddingVertical: 18,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  billRowLast: {},
  billName: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: '#212529',
  },
  billAmount: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: '#212529',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  totalLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7075',
  },
  totalAmount: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 22,
    color: '#212529',
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 12,
  },
  paymentBrandWrap: {
    width: 52,
    minHeight: 18,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  paymentBrandLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.8,
    color: '#1E2A78',
  },
  paymentMethodText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 18,
    color: '#666B70',
  },
  button: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 20,
  },
  payButton: {
    backgroundColor: colors.accentCta,
  },
  retryButton: {
    backgroundColor: colors.accentButton,
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 22,
    color: 'white',
  },
  errorSection: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: '#C20000',
    marginBottom: 16,
  },
  successSection: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  successText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.success,
  },
});
