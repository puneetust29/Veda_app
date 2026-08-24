import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  event: any;
  completedItems?: {
    flightBookings: boolean;
    hotelBookings: boolean;
    roaming: boolean;
    travelInsurance: boolean;
  };
  onToggleItem?: (item: string) => void;
  onContinue?: () => void;
};

export default function TripSummaryCard({ event, completedItems, onToggleItem, onContinue }: Props) {
  const startDate = event?.start_datetime ? new Date(event.start_datetime) : null;
  const endDate = event?.end_datetime ? new Date(event.end_datetime) : null;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  };

  const dateRangeText = startDate && endDate
    ? `${formatDate(startDate)}-${formatDate(endDate)}, ${event?.destination || 'Australia'}`
    : `12-20 August, ${event?.destination || 'Australia'}`;

  return (
    <>
      <View style={styles.card}>
        {/* Trip Details */}
        <View style={styles.tripDetails}>
          <Ionicons name="calendar-outline" size={24} color={colors.brand} />
          <Text style={styles.dateText}>{dateRangeText}</Text>
        </View>

        {/* Travellers Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Travellers</Text>
          <Text style={styles.sectionValue}>3 people</Text>
        </View>

        {/* Preparation Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preparation</Text>

          <ChecklistItem
            label="Flight bookings"
            completed={completedItems?.flightBookings}
            onToggle={() => onToggleItem?.('flightBookings')}
          />
          <ChecklistItem
            label="Hotel bookings"
            completed={completedItems?.hotelBookings}
            onToggle={() => onToggleItem?.('hotelBookings')}
          />
          <ChecklistItem
            label="Roaming"
            status="Ready to review"
            completed={completedItems?.roaming}
            onToggle={() => onToggleItem?.('roaming')}
          />
          <ChecklistItem
            label="Travel insurance"
            status="Ready to review"
            completed={completedItems?.travelInsurance}
            onToggle={() => onToggleItem?.('travelInsurance')}
          />
        </View>

        {/* Continue Button - INSIDE CARD */}
        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>

      {/* AI Disclaimer - OUTSIDE CARD, NOT ITALIC */}
      <Text style={styles.disclaimer}>Veda AI may make mistakes. Please review.</Text>
    </>
  );
}

function ChecklistItem({
  label,
  completed,
  status,
  onToggle,
}: {
  label: string;
  completed?: boolean;
  status?: string;
  onToggle?: () => void;
}) {
  return (
    <View style={styles.checklistItem}>
      {completed ? (
        <Ionicons name="checkmark" size={20} color={colors.brand} />
      ) : (
        <View style={styles.spinner}>
          <Ionicons name="ellipse-outline" size={18} color={colors.textSecondary} />
        </View>
      )}
      <Text style={styles.checklistLabel}>
        {label}
      </Text>
      {status && <Text style={styles.checklistStatus}>{status}</Text>}
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
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  spinner: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  checklistStatus: {
    fontSize: 12,
    color: colors.textSecondary,
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
  disclaimer: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'left',
    marginBottom: spacing.lg,
    fontStyle: 'normal',
  },
});
