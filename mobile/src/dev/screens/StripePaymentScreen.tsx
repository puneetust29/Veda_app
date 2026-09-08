import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, spacing, typography } from '../../theme';
import { api } from '../../lib/api';

type State = 'idle' | 'processing' | 'success' | 'error';

export default function StripePaymentScreen() {
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handlePayment = async () => {
    try {
      setState('processing');
      setErrorMessage('');

      // Create a mock payment intent for $10 test payment
      // In a real scenario, this would call the backend
      const mockPaymentIntent = {
        client_secret: 'pi_test_' + Math.random().toString(36).substr(2, 24) + '_secret_' + Math.random().toString(36).substr(2, 24),
        customer_id: 'cus_test_' + Math.random().toString(36).substr(2, 9),
        ephemeral_key_secret: 'ek_live_' + Math.random().toString(36).substr(2, 48),
        publishable_key: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
      };

      // Initialize the payment sheet with test mode
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: mockPaymentIntent.client_secret,
        customerId: mockPaymentIntent.customer_id,
        customerEphemeralKeySecret: mockPaymentIntent.ephemeral_key_secret,
        merchantDisplayName: 'Veda',
      });

      if (initError) {
        setErrorMessage(initError.message);
        setState('error');
        return;
      }

      // Present the payment sheet
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        setErrorMessage(presentError.message);
        setState('error');
        return;
      }

      // Success!
      setState('success');
      setTimeout(() => {
        setState('idle');
      }, 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment failed');
      setState('error');
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerSection}>
        <Text style={styles.title}>Test Stripe Payment</Text>
        <Text style={styles.subtitle}>Mock $10 USD Payment</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📝 Test Payment Details</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Amount:</Text>
          <Text style={styles.infoValue}>$10.00 USD</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Type:</Text>
          <Text style={styles.infoValue}>Travel Insurance (Mock)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Mode:</Text>
          <Text style={styles.infoValue}>Test Mode</Text>
        </View>
      </View>

      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>💳 Test Card Numbers</Text>
        <View style={styles.instructionItem}>
          <Text style={styles.instructionLabel}>Success:</Text>
          <Text style={styles.instructionValue}>4242 4242 4242 4242</Text>
        </View>
        <View style={styles.instructionItem}>
          <Text style={styles.instructionLabel}>Decline:</Text>
          <Text style={styles.instructionValue}>4000 0000 0000 0002</Text>
        </View>
        <Text style={styles.instructionNote}>Exp: Any future date • CVC: Any 3 digits</Text>
      </View>

      <View style={styles.stateSection}>
        {state === 'idle' && (
          <>
            <TouchableOpacity
              style={styles.payButton}
              onPress={handlePayment}
            >
              <Text style={styles.payButtonText}>Open Stripe Payment Sheet</Text>
            </TouchableOpacity>
            <Text style={styles.description}>
              Tap to open the Stripe PaymentSheet. Use test card numbers above to test different scenarios.
            </Text>
          </>
        )}

        {state === 'processing' && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.label}>Initializing payment sheet...</Text>
          </View>
        )}

        {state === 'success' && (
          <>
            <View style={styles.centerContent}>
              <Text style={styles.successTitle}>✓ Payment Successful</Text>
              <Text style={styles.successLabel}>Test payment processed</Text>
            </View>
            <TouchableOpacity
              style={styles.payButton}
              onPress={handleRetry}
            >
              <Text style={styles.payButtonText}>Test Another Payment</Text>
            </TouchableOpacity>
          </>
        )}

        {state === 'error' && (
          <>
            <Text style={styles.errorTitle}>Payment Error</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.payButton}
              onPress={handleRetry}
            >
              <Text style={styles.payButtonText}>Try Again</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerSection: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoCard: {
    backgroundColor: '#F0F8FF',
    borderLeftWidth: 4,
    borderLeftColor: colors.brand,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  infoTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  infoLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  instructionsCard: {
    backgroundColor: '#FFF8E1',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  instructionsTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  instructionItem: {
    marginBottom: spacing.md,
  },
  instructionLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  instructionValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'Courier New',
  },
  instructionNote: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  stateSection: {
    marginTop: spacing.lg,
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  payButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
  },
  description: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 18,
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  successTitle: {
    ...typography.sectionTitle,
    color: colors.brand,
    marginBottom: spacing.md,
  },
  successLabel: {
    ...typography.body,
    color: colors.textSecondary,
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
