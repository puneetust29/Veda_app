import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, spacing, typography } from '../../theme';
import { api } from '../../lib/api';
import type { TravelInsurancePlan } from '../../types';

type State = 'idle' | 'processing' | 'success' | 'error';

type Props = {
  visible: boolean;
  plan: TravelInsurancePlan | null;
  calendarEventId?: string;
  savedPaymentMethodId: string;
  onClose: () => void;
  onSuccess: (purchaseData: any) => void;
};

export default function ConfirmPaymentModal({
  visible,
  plan,
  calendarEventId,
  savedPaymentMethodId,
  onClose,
  onSuccess,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handlePayment = async () => {
    if (!plan) return;

    try {
      setState('processing');
      setErrorMessage('');

      // Create payment intent on the backend
      const intent = await api.createInsurancePaymentIntent(
        plan.id,
        savedPaymentMethodId,
      );

      // Initialize the payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intent.client_secret,
        customerId: intent.customer_id,
        customerEphemeralKeySecret: intent.ephemeral_key_secret,
        merchantDisplayName: 'Veda',
      });

      if (initError) {
        setErrorMessage(initError.message);
        setState('error');
        return;
      }

      // Present the payment sheet (one-tap with saved card)
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        setErrorMessage(presentError.message);
        setState('error');
        return;
      }

      // Extract payment intent ID from client secret
      const paymentIntentId = intent.client_secret?.split('_secret_')[0] || '';

      // Confirm the insurance purchase on the backend
      const purchaseData = await api.confirmInsurancePurchase(
        plan.id,
        paymentIntentId,
        calendarEventId,
      );

      // Success!
      setState('success');
      setTimeout(() => {
        onSuccess(purchaseData);
      }, 1500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment failed');
      setState('error');
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  if (!plan) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {state === 'idle' && (
            <>
              <Text style={styles.title}>Confirm Payment</Text>
              <View style={styles.section}>
                <Text style={styles.label}>{plan.planName}</Text>
                <Text style={styles.amount}>
                  {plan.currency} {plan.premiumAmount.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.description}>
                Tap below to pay with your saved card. One-tap confirmation with Face ID or Touch ID.
              </Text>
              <TouchableOpacity
                style={styles.payButton}
                onPress={handlePayment}
              >
                <Text style={styles.payButtonText}>
                  Pay {plan.currency} {plan.premiumAmount.toFixed(2)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'processing' && (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={styles.label}>Processing payment...</Text>
            </View>
          )}

          {state === 'success' && (
            <>
              <View style={styles.centerContent}>
                <Text style={styles.successTitle}>✓ Payment Successful</Text>
                <Text style={styles.label}>Insurance cover activated</Text>
              </View>
              <TouchableOpacity style={styles.payButton} onPress={onSuccess}>
                <Text style={styles.payButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'error' && (
            <>
              <Text style={styles.errorTitle}>Payment Failed</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
              <TouchableOpacity
                style={styles.payButton}
                onPress={handleRetry}
              >
                <Text style={styles.payButtonText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary,
    borderBottomOpacity: 0.1,
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  amount: {
    ...typography.sectionTitle,
    color: colors.brand,
  },
  description: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  payButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  payButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
  },
  cancelButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  successTitle: {
    ...typography.sectionTitle,
    color: colors.brand,
    marginBottom: spacing.md,
  },
  errorTitle: {
    ...typography.sectionTitle,
    color: '#E74C3C',
    marginBottom: spacing.md,
  },
  errorMessage: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
});
