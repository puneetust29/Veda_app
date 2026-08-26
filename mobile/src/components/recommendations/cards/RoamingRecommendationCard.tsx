import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type Traveler = {
  name: string;
  initials: string;
  details: string;
  price?: string;
};

type Props = {
  provider?: string;
  planName?: string;
  whyThisOne?: string[];
  travelers?: Traveler[];
  total?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  children?: React.ReactNode;
};

export default function RoamingRecommendationCard({
  provider = 'Vodafone',
  planName = '8-day Around the World Extra',
  whyThisOne = [
    'Matches your typical data usage.',
    '8 days, exactly matches your trip.',
    'Works for all 3 travellers.',
  ],
  travelers = [
    { name: 'Emily', initials: 'E', details: '2 GB | 100 mins and 100 texts', price: '£18' },
    { name: 'Sophia', initials: 'S', details: '2 GB', price: '£12.75' },
    { name: 'Oliver', initials: 'O', details: 'No plan needed', price: '' },
  ],
  total = '£30.75',
  isExpanded,
  onToggleExpand,
  children,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.providerLogo}>
          <Text style={styles.logoText}>{provider.charAt(0)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.provider}>{provider}</Text>
          <Text style={styles.planName}>{planName}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why this one</Text>
        {whyThisOne.map((text, index) => (
          <View key={index} style={styles.checklistItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
            <Text style={styles.checklistText}>{text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Family setup</Text>

        {travelers.map((traveler, index) => (
          <View key={index} style={styles.travelerRow}>
            <View style={styles.travelerInitial}>
              <Text style={styles.travelerInitialText}>{traveler.initials}</Text>
            </View>
            <View style={styles.travelerInfo}>
              <Text style={styles.travelerName}>{traveler.name}</Text>
              <Text style={styles.travelerDetails}>{traveler.details}</Text>
            </View>
            {traveler.price && <Text style={styles.travelerPrice}>{traveler.price}</Text>}
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>{total}</Text>
        </View>
      </View>

      {children}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonOutline]}
          onPress={onToggleExpand}
        >
          <Text style={[styles.buttonText, styles.buttonTextOutline]}>
            {isExpanded ? 'Close' : 'Modify'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary,
    borderBottomOpacity: 0.1,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerText: {
    flex: 1,
  },
  provider: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  planName: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  checklistText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  travelerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary,
    borderBottomOpacity: 0.1,
  },
  travelerInitial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  travelerInitialText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.brand,
  },
  travelerInfo: {
    flex: 1,
  },
  travelerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  travelerDetails: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  travelerPrice: {
    ...typography.body,
    fontWeight: '600',
    color: colors.brand,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
  },
  totalLabel: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  totalPrice: {
    ...typography.sectionTitle,
    color: colors.brand,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.brand,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.brand,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
  },
  buttonTextOutline: {
    color: colors.brand,
  },
});
