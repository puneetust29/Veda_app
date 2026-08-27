import { StyleSheet, View } from 'react-native';
import { useState, useEffect } from 'react';

import type { TravelInsurancePlan, Customer, RoamingPlan } from '../../types';
import TravelInsuranceCard from '../recommendations/cards/TravelInsuranceCard';
import PaymentSummaryCard from './PaymentSummaryCard';
import CoverageDetailsCard from './CoverageDetailsCard';
import MessageBubble from './MessageBubble';
import { api } from '../../lib/api';

type Props = {
  plan: TravelInsurancePlan;
  roamingPlan?: RoamingPlan | null;
  calendarEventId: string;
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
  onInsurancePurchased?: (data: any) => void;
};

export default function TravelInsuranceCardChat({
  plan,
  roamingPlan,
  calendarEventId,
  paymentMethodBrand: propBrand,
  paymentMethodLast4: propLast4,
  onInsurancePurchased,
}: Props) {
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [showCoverageDetails, setShowCoverageDetails] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentBrand, setPaymentBrand] = useState(propBrand || 'Card');
  const [paymentLast4, setPaymentLast4] = useState(propLast4);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const customerData = await api.getMe();
        setCustomer(customerData);

        // If payment method details weren't provided as props, set defaults
        if (!propBrand) {
          setPaymentBrand('Card');
        }
        if (!propLast4) {
          setPaymentLast4(undefined);
        }
      } catch (err) {
        console.warn('Failed to fetch customer data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, [propBrand, propLast4]);

  const handleProceed = () => {
    setShowPaymentSummary(true);
  };

  const handlePaymentSuccess = (purchaseData: any) => {
    setShowPaymentSummary(false);
    if (onInsurancePurchased) {
      onInsurancePurchased(purchaseData);
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
        <PaymentSummaryCard
          roamingPlan={roamingPlan}
          insurancePlan={plan}
          paymentMethodBrand={paymentBrand}
          paymentMethodLast4={paymentLast4}
          savedPaymentMethodId={paymentMethodId}
          calendarEventId={calendarEventId}
          onViewOptions={() => setShowPaymentSummary(false)}
          onSuccess={handlePaymentSuccess}
        />
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
