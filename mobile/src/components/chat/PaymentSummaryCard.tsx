import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, spacing, typography } from '../../theme';
import { api } from '../../lib/api';
import type { TravelInsurancePlan, RoamingPlan } from '../../types';

type State = 'idle' | 'processing' | 'success' | 'error';

type Props = {
  roamingPlan?: RoamingPlan | null;
  insurancePlan: TravelInsurancePlan;
  savedPaymentMethodId: string;
  calendarEventId?: string;
  onViewOptions?: () => void;
  onSuccess: (purchaseData: any) => void;
};

export default function PaymentSummaryCard({
  roamingPlan,
  insurancePlan,
  savedPaymentMethodId,
  calendarEventId,
  onViewOptions,
  onSuccess,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentMethodBrand, setPaymentMethodBrand] = useState<string | undefined>();
  const [paymentMethodLast4, setPaymentMethodLast4] = useState<string | undefined>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  useEffect(() => {
    const fetchPaymentMethod = async () => {
      try {
        const response = await api.getCustomerPaymentMethods();
        setPaymentMethodBrand(response.brand ?? undefined);
        setPaymentMethodLast4(response.last4 ?? undefined);
      } catch (err) {
        console.error('Failed to fetch payment method:', err);
      }
    };

    fetchPaymentMethod();
  }, []);

  const handlePayment = async () => {
    try {
      setState('processing');
      setErrorMessage('');

      const intent = await api.createInsurancePaymentIntent(
        insurancePlan.id,
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
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        setErrorMessage(presentError.message);
        setState('error');
        return;
      }

      const paymentIntentId = intent.client_secret?.split('_secret_')[0] || '';

      const purchaseData = await api.confirmInsurancePurchase(
        insurancePlan.id,
        paymentIntentId,
        calendarEventId,
      );

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

  const totalAmount = (roamingPlan?.price || 0) + insurancePlan.premiumAmount;

  if (state === 'processing') {
    return (
      <View style={styles.card}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.label}>Processing payment...</Text>
        </View>
      </View>
    );
  }

  if (state === 'success') {
    return (
      <View style={styles.card}>
        <View style={styles.centerContent}>
          <Text style={styles.successTitle}>✓ Payment Successful</Text>
          <Text style={styles.label}>Insurance cover activated</Text>
        </View>
        <TouchableOpacity style={styles.payButton} onPress={() => onSuccess(null)}>
          <Text style={styles.payButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.card}>
        <Text style={styles.errorTitle}>Payment Failed</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <TouchableOpacity
          style={styles.payButton}
          onPress={handleRetry}
        >
          <Text style={styles.payButtonText}>Try Again</Text>
        </TouchableOpacity>
        {onViewOptions && (
          <TouchableOpacity style={styles.cancelButton} onPress={onViewOptions}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Payment Summary</Text>

      {roamingPlan && (
        <View style={styles.itemSection}>
          <View style={styles.itemHeader}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{roamingPlan.plan_name}</Text>
              <Text style={styles.itemSubtext}>
                {roamingPlan.plan_name} | {roamingPlan.data_gb}GB, {roamingPlan.duration_days} days
              </Text>
            </View>
            <Text style={styles.itemPrice}>
              {roamingPlan.currency}{roamingPlan.price.toFixed(2)}
            </Text>
          </View>
          <View style={styles.divider} />
        </View>
      )}

      <View style={styles.itemSection}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{insurancePlan.planName}</Text>
            <Text style={styles.itemSubtext}>
              {insurancePlan.provider} | {insurancePlan.planType}
            </Text>
          </View>
          <Text style={styles.itemPrice}>
            {insurancePlan.currency}{insurancePlan.premiumAmount.toFixed(2)}
          </Text>
        </View>
        <View style={styles.divider} />
      </View>

      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>
          {insurancePlan.currency}{totalAmount.toFixed(2)}
        </Text>
      </View>

      {(paymentMethodBrand || paymentMethodLast4) && (
        <View style={styles.paymentMethodSection}>
          <Text style={styles.paymentLabel}>
            Paying with {paymentMethodBrand ? paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1) : 'Payment Method'} {paymentMethodLast4 ? `•••• ${paymentMethodLast4}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.whatHappensSection}>
        <Text style={styles.whatHappensTitle}>What happens next?</Text>

        <View style={styles.timelineItem}>
          <View style={styles.timelineIcon}>
            <Text style={styles.timelineIconText}>📶</Text>
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineLabel}>Roaming</Text>
            <Text style={styles.timelineText}>
              Charged on 12th August | Activates automatically
            </Text>
          </View>
        </View>

        <View style={styles.timelineItem}>
          <View style={styles.timelineIcon}>
            <Text style={styles.timelineIconText}>📅</Text>
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineLabel}>Travel insurance</Text>
            <Text style={styles.timelineText}>
              Charged immediately | Cover starts as soon as you buy
            </Text>
          </View>
        </View>

        <Text style={styles.policyNote}>
          Your policy documents will be available on Veda and sent via email after payment
        </Text>
      </View>

      <View style={styles.buttonGroup}>
        {onViewOptions && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onViewOptions}>
            <Text style={styles.secondaryButtonText}>View other options</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.payButton, onViewOptions ? { flex: 1 } : { width: '100%' }]}
          onPress={handlePayment}
        >
          <Text style={styles.payButtonText}>
            Pay with {paymentMethodBrand ? paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1) : ''} card
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  itemSection: {
    marginBottom: spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  itemName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  itemSubtext: {
    ...typography.small,
    color: colors.textSecondary,
  },
  itemPrice: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  totalLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalAmount: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  paymentMethodSection: {
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E0E0E0',
  },
  paymentLabel: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  whatHappensSection: {
    marginBottom: spacing.xl,
  },
  whatHappensTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FCE6E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  timelineIconText: {
    fontSize: 18,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  timelineText: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  policyNote: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: 50,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.brand,
  },
  payButton: {
    flex: 1,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: 50,
    alignItems: 'center',
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
  centerContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
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
