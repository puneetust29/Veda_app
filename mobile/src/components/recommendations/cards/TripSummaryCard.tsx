import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type ChecklistItem = {
  label: string;
  status?: string;
  completed?: boolean;
};

type Props = {
  event: any;
  travelers?: number;
  checklist?: ChecklistItem[];
  completedItems?: {
    flightBookings: boolean;
    hotelBookings: boolean;
    roaming: boolean;
    travelInsurance: boolean;
  };
  onToggleItem?: (item: string) => void;
  onContinue?: () => void;
};

export default function TripSummaryCard({
  event,
  travelers = 3,
  checklist,
  completedItems,
  onToggleItem,
  onContinue,
}: Props) {
  const startDate = event?.start_datetime ? new Date(event.start_datetime) : null;
  const endDate = event?.end_datetime ? new Date(event.end_datetime) : null;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  };

  const dateRangeText = startDate && endDate
    ? `${formatDate(startDate)}-${formatDate(endDate)}, ${event?.destination || 'Australia'}`
    : `12-20 August, ${event?.destination || 'Australia'}`;

  const defaultChecklist: ChecklistItem[] = [
    { label: 'Flight bookings', completed: completedItems?.flightBookings },
    { label: 'Hotel bookings', completed: completedItems?.hotelBookings },
    { label: 'Roaming', status: 'Ready to review', completed: completedItems?.roaming },
    { label: 'Travel insurance', status: 'Ready to review', completed: completedItems?.travelInsurance },
  ];

  const items = checklist || defaultChecklist;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.tripDetails}>
          <Ionicons name="calendar-outline" size={24} color={colors.brand} />
          <Text style={styles.dateText}>{dateRangeText}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Travellers</Text>
          <Text style={styles.sectionValue}>{travelers} people</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preparation</Text>
          {items.map((item, index) => (
            <ChecklistItemRow key={index} item={item} />
          ))}
        </View>

        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <View style={styles.checklistItem}>
      {item.completed ? (
        <Ionicons name="checkmark" size={20} color={colors.brand} />
      ) : (
        <Ionicons name="ellipse-outline" size={18} color={colors.textSecondary} />
      )}
      <View style={styles.checklistContent}>
        <Text style={styles.checklistLabel}>{item.label}</Text>
        {item.status && <Text style={styles.checklistStatus}>{item.status}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  tripDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionValue: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textPrimary,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  checklistContent: {
    flex: 1,
  },
  checklistLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  checklistStatus: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  continueButton: {
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
