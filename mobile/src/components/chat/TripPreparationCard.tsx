import { StyleSheet, Text, View } from 'react-native';
import type { CalendarEvent } from '../../types';
import ProgressIcon from '../icons/ProgressIcon';
import CalendarIcon from '../icons/CalendarIcon';
import CheckIcon from '../icons/CheckIcon';
import CardShell, { cardShellStyles } from './CardShell';

type Props = {
  event: CalendarEvent;
  returnFlightDate?: string;
  hasFlightBooking: boolean;
  hasHotelBooking: boolean;
  hasRoamingActive: boolean;
  hasInsuranceActive: boolean;
  loading?: boolean;
  onContinue: () => void;
};

export default function TripPreparationCard({
  event,
  returnFlightDate,
  hasFlightBooking,
  hasHotelBooking,
  hasRoamingActive,
  hasInsuranceActive,
  loading = false,
  onContinue,
}: Props) {
  const startDate = new Date(event.start_datetime).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
  const returnDate = returnFlightDate ? new Date(returnFlightDate).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  }) : null;

  const statusItems = [
    { label: 'Flight bookings', active: hasFlightBooking },
    ...(hasHotelBooking ? [{ label: 'Hotel bookings', active: hasHotelBooking }] : []),
    { label: 'Roaming', active: hasRoamingActive },
    { label: 'Travel insurance', active: hasInsuranceActive },
  ];

  const anyPending = !hasRoamingActive || !hasInsuranceActive;

  return (
    <CardShell
      badge={<CalendarIcon size={20} color="#E60000" />}
      title={`${returnDate ? `${startDate} - ${returnDate}` : startDate}, ${event.destination}`}
      buttonLabel="Continue"
      onButtonPress={onContinue}
      loading={loading}
      buttonDisabled={!anyPending}
    >
      {/* Travellers Section */}
      <View style={cardShellStyles.section}>
        <Text style={cardShellStyles.sectionLabel}>Travellers</Text>
        <Text style={cardShellStyles.sectionValue}>1 people</Text>
      </View>

      <View style={cardShellStyles.divider} />

      {/* Preparation Section */}
      <View style={cardShellStyles.section}>
        <Text style={styles.preparationTitle}>Preparation</Text>
        <View style={styles.statusList}>
          {statusItems.map((item, idx) => (
            <View key={idx} style={styles.statusItem}>
              <View style={styles.statusIconContainer}>
                {item.active ? (
                  <CheckIcon size={12} />
                ) : (
                  <ProgressIcon size={12} color="#6B7280" />
                )}
              </View>
              <Text style={styles.statusLabel}>{item.label}</Text>
              {!item.active && (
                <Text style={styles.readyToReview}>Ready to review</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  preparationTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Urbanist_600SemiBold',
    color: '#000000',
    marginBottom: 16,
  },
  statusList: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconContainer: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    color: '#1a1a1a',
    flex: 1,
  },
  readyToReview: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#6b7280',
    fontWeight: '400',
  },
});
