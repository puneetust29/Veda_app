import { StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CalendarEvent } from '../../types';
import ProgressIcon from '../icons/ProgressIcon';
import CalendarIcon from '../icons/CalendarIcon';

type Props = {
  event: CalendarEvent;
  hasFlightBooking: boolean;
  hasHotelBooking: boolean;
  hasRoamingActive: boolean;
  hasInsuranceActive: boolean;
  onContinue: () => void;
};

export default function TripPreparationCard({
  event,
  hasFlightBooking,
  hasHotelBooking,
  hasRoamingActive,
  hasInsuranceActive,
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

  const statusItems = [
    { label: 'Flight bookings', active: hasFlightBooking },
    ...(hasHotelBooking ? [{ label: 'Hotel bookings', active: hasHotelBooking }] : []),
    { label: 'Roaming', active: hasRoamingActive },
    { label: 'Travel insurance', active: hasInsuranceActive },
  ];

  const anyPending =
    !hasRoamingActive || !hasInsuranceActive;

  return (
    <View style={styles.cardShadow}>
      <View style={styles.card}>
        {/* Decorative Header Background */}
        <Image
          source={require('../../../assets/header-background.svg')}
          style={styles.decorativeHeader}
          resizeMode="cover"
        />

        {/* Trip Info Section */}
        <View style={styles.tripInfo}>
          <View style={styles.calendarBadge}>
            <CalendarIcon size={20} color="#E60000" />
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
          <Text style={styles.preparationTitle}>Preparation</Text>
          <View style={styles.statusList}>
            {statusItems.map((item, idx) => (
              <View key={idx} style={styles.statusItem}>
                <View style={styles.statusIconContainer}>
                  {item.active ? (
                    <Ionicons name="checkmark" size={12} color="#e60000" />
                  ) : (
                    <ProgressIcon size={12} color="#6B7280" />
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
          style={styles.continueButton}
          onPress={onContinue}
          disabled={!anyPending}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    borderRadius: 24,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  decorativeHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 141,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  tripInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    zIndex: 1,
  },
  calendarBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(230, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  calendarIcon: {
    fontSize: 20,
  },
  tripDates: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Urbanist_600SemiBold',
    color: '#000000',
    flex: 1,
    lineHeight: 24,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Urbanist_400Regular',
    color: '#000000',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  travellerCount: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Urbanist_600SemiBold',
    color: '#000000',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginHorizontal: 16,
    marginVertical: 12,
  },
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
  pendingLabel: {
    color: '#1a1a1a',
  },
  readyToReview: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#6b7280',
    fontWeight: '400',
  },
  continueButton: {
    backgroundColor: '#f00405',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Urbanist_700Bold',
  },
});
