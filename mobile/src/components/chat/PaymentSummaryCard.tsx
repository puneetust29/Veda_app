import React, { useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, fonts, spacing, typography } from '../../theme';
import { useSubscriptionInsurance } from '../../context/SubscriptionInsuranceContext';
import { api } from '../../lib/api';
import CalendarIcon from '../icons/CalendarIcon';
import CoverageDurationIcon from '../icons/CoverageDurationIcon';
import PaymentProcessingCard from './PaymentProcessingCard';
import type { TravelInsurancePlan, RoamingPlan } from '../../types';

type State = 'idle' | 'processing' | 'success' | 'error';


type Props = {
  roamingPlan?: RoamingPlan | null;
  insurancePlan: TravelInsurancePlan;
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
  savedPaymentMethodId: string;
  calendarEventId?: string;
  onViewOptions?: () => void;
  onSuccess: (purchaseData: any) => void;
};

export default function PaymentSummaryCard({
  roamingPlan,
  insurancePlan,
  paymentMethodBrand,
  paymentMethodLast4,
  savedPaymentMethodId,
  calendarEventId,
  onViewOptions,
  onSuccess,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

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
      <View style={styles.headerDivider} />

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
            <CoverageDurationIcon size={16} />
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
            <CalendarIcon size={16} color={colors.brand} />
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
            {paymentMethodBrand ? `Pay with ${paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1)}` : 'Pay'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 16,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 141,
    opacity: 0.16,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginBottom: 16,
  },
  itemSection: {
    marginBottom: 0,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 0,
    marginBottom: 16,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 1,
  },
  itemSubtext: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '400',
    color: '#3e3e3e',
  },
  itemPrice: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  divider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginBottom: 16,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 0,
    marginBottom: 44,
  },
  totalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalAmount: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1a1a1a',
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
    marginBottom: 24,
  },
  whatHappensTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineIcon: {
    width: 36,
    height: 36,
    borderRadius: 12.5,
    backgroundColor: 'rgba(230, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '300',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  timelineText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  policyNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: '#1a1a1a',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.brand,
    paddingHorizontal: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    lineHeight: 21.5,
    fontWeight: '600',
    color: colors.brand,
  },
  payButton: {
    flex: 1,
    backgroundColor: '#F00405',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  payButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
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
