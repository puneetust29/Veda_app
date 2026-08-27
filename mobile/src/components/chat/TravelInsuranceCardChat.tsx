import { StyleSheet, View } from 'react-native';
import { useState, useEffect } from 'react';

import type { TravelInsurancePlan, Customer } from '../../types';
import TravelInsuranceCard from '../recommendations/cards/TravelInsuranceCard';
import ConfirmPaymentModal from '../common/ConfirmPaymentModal';
import { api } from '../../lib/api';

type Props = {
  plan: TravelInsurancePlan;
  calendarEventId: string;
  onInsurancePurchased?: (data: any) => void;
};

export default function TravelInsuranceCardChat({ plan, calendarEventId, onInsurancePurchased }: Props) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleProceed = () => {
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = (purchaseData: any) => {
    setShowPaymentModal(false);
    if (onInsurancePurchased) {
      onInsurancePurchased(purchaseData);
    }
  };

  // Use a test payment method for now (in production, this would come from saved cards)
  const paymentMethodId = 'pm_card_mastercard';

  return (
    <View style={styles.container}>
      <TravelInsuranceCard plan={plan} onProceed={onInsurancePurchased ? handleProceed : undefined} />
      <ConfirmPaymentModal
        visible={showPaymentModal}
        plan={plan}
        calendarEventId={calendarEventId}
        savedPaymentMethodId={paymentMethodId}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handlePaymentSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    marginBottom: 12,
  },
});
