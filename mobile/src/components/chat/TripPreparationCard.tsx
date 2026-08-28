import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalendarEvent } from '../../types';

type Props = {
  event: CalendarEvent;
  hasFlightBooking: boolean;
  hasHotelBooking: boolean;
  hasRoamingActive: boolean;
  hasInsuranceActive: boolean;
  hasTransportInfo?: boolean;
  loading?: boolean;
  onContinue: () => void;
};

export default function TripPreparationCard({
  event,
  hasFlightBooking,
  hasHotelBooking,
  hasRoamingActive,
  hasInsuranceActive,
  hasTransportInfo = false,
  loading = false,
  onContinue,
}: Props) {
  const startDate = new Date(event.start_datetime).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
  const endDate = new Date(event.end_datetime).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });

  const isLondonTrip =
    (event.destination?.toLowerCase().includes('london') ||
      event.destination?.toLowerCase().includes('lhr') ||
      event.destination?.toLowerCase().includes('gatwick') ||
      event.destination?.toLowerCase().includes('lgw') ||
      event.origin?.toLowerCase().includes('london') ||
      event.origin?.toLowerCase().includes('lhr')) ?? false;

  const statusItems = [
    { label: 'Flight bookings', active: hasFlightBooking },
    ...(hasHotelBooking ? [{ label: 'Hotel bookings', active: hasHotelBooking }] : []),
    { label: 'Roaming', active: hasRoamingActive },
    { label: 'Travel insurance', active: hasInsuranceActive },
    ...(isLondonTrip ? [{ label: 'London transport', active: hasTransportInfo }] : []),
  ];

  const anyPending =
    !hasRoamingActive || !hasInsuranceActive || (isLondonTrip && !hasTransportInfo);

  return (
    <View style={styles.card}>
      {/* Trip Info Section */}
      <View style={styles.tripInfo}>
        <View style={styles.calendarBadge}>
          <Text style={styles.calendarIcon}>📅</Text>
        </View>
        <Text style={styles.tripDates}>
          {startDate}-{endDate}, {event.destination}
        </Text>
      </View>

      {/* Travellers Section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Travellers</Text>
        <Text style={styles.travellerCount}>3 people</Text>
      </View>

      <View style={styles.divider} />

      {/* Preparation Section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Preparation</Text>
        <View style={styles.statusList}>
          {statusItems.map((item, idx) => (
            <View key={idx} style={styles.statusItem}>
              <View style={styles.statusIcon}>
                {item.active ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <View style={styles.emptyCircle} />
                )}
              </View>
              <Text style={[styles.statusLabel, !item.active && styles.pendingLabel]}>
                {item.label}
              </Text>
              {!item.active && (
                <Text style={styles.readyToReview}>Ready to review</Text>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Continue Button */}
      <TouchableOpacity
        style={[styles.continueButton, (loading || !anyPending) && styles.continueButtonDisabled]}
        onPress={onContinue}
        disabled={loading || !anyPending}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.continueButtonText}>Continue</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  tripInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  calendarBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  calendarIcon: {
    fontSize: 20,
  },
  tripDates: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F1F1F',
    flex: 1,
    lineHeight: 24,
  },
  section: {
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999999',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  travellerCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 8,
  },
  statusList: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
  },
  emptyCircle: {
    width: 12,
    height: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CCCCCC',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F1F1F',
    flex: 1,
  },
  pendingLabel: {
    fontWeight: '400',
    color: '#666666',
  },
  readyToReview: {
    fontSize: 12,
    color: '#999999',
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#D32F2F',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
