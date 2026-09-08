import { StyleSheet, View } from 'react-native';
import { useState, useEffect } from 'react';

import type { TravelInsurancePlan, Customer, RoamingPlan } from '../../types';
import TravelInsuranceCard from '../recommendations/cards/TravelInsuranceCard';
import PaymentSummaryCard from './PaymentSummaryCard';
import CoverageDetailsCard from './CoverageDetailsCard';
import MessageBubble from './MessageBubble';
import LoadingStream from './LoadingStream';
import { api } from '../../lib/api';

type Props = {
  plan: TravelInsurancePlan;
  roamingPlan?: RoamingPlan | null;
  calendarEventId: string;
  onInsurancePurchased?: (data: any) => void;
};

export default function TravelInsuranceCardChat({
  plan,
  roamingPlan,
  calendarEventId,
  onInsurancePurchased,
}: Props) {
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [showCoverageDetails, setShowCoverageDetails] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethodBrand, setPaymentMethodBrand] = useState<string | undefined>();
  const [paymentMethodLast4, setPaymentMethodLast4] = useState<string | undefined>();
  const [paymentMethodLoading, setPaymentMethodLoading] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const customerData = await api.getMe();
        setCustomer(customerData);
      } catch (err) {
        console.warn('Failed to fetch customer data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, []);

  useEffect(() => {
    if (showPaymentSummary) {
      const fetchPaymentMethod = async () => {
        setPaymentMethodLoading(true);
        try {
          const response = await api.getCustomerPaymentMethods();
          setPaymentMethodBrand(response.brand ?? undefined);
          setPaymentMethodLast4(response.last4 ?? undefined);
        } catch (err) {
          // Silently handle payment method fetch failure (e.g., 404 when no saved methods)
          if (__DEV__) console.debug('Payment method not found:', err);
        } finally {
          setPaymentMethodLoading(false);
        }
      };
      fetchPaymentMethod();
    }
  }, [showPaymentSummary]);

  const handleProceed = () => {
    setShowPaymentSummary(true);
  };

  const handlePaymentSuccess = (purchaseData: any) => {
    setShowPaymentSummary(false);
    if (onInsurancePurchased) {
      onInsurancePurchased({
        ...purchaseData,
        cardBrand: paymentMethodBrand,
        cardLast4: paymentMethodLast4,
        insuranceAmount: plan.premiumAmount,
        insuranceCurrency: plan.currency,
      });
    }
  };

  // Use a test payment method for now (in production, this would come from saved cards)
  const paymentMethodId = 'pm_card_visa';

  if (showPaymentSummary && onInsurancePurchased) {
    return (
      <View style={styles.container}>
        <MessageBubble
          text="Everything is ready for your trip. Here's a summary before payment."
          tone="agent"
        />
        {paymentMethodLoading && (
          <LoadingStream items={[{ text: 'Looking into your payment method…', state: 'active' }]} isSingleItem />
        )}
        {!paymentMethodLoading && (
          <PaymentSummaryCard
            roamingPlan={roamingPlan}
            insurancePlan={plan}
            paymentMethodBrand={paymentMethodBrand}
            paymentMethodLast4={paymentMethodLast4}
            savedPaymentMethodId={paymentMethodId}
            calendarEventId={calendarEventId}
            onViewOptions={() => setShowPaymentSummary(false)}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TravelInsuranceCard plan={plan} onViewDetails={() => setShowCoverageDetails(true)} onProceed={onInsurancePurchased ? handleProceed : undefined} />
      {showCoverageDetails && (
        <>
          <MessageBubble
            text={`Here's everything the ${plan.planName} policy covers.`}
            tone="agent"
          />
          <CoverageDetailsCard
            plan={plan}
            onClose={() => setShowCoverageDetails(false)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    marginBottom: 12,
  },
});
