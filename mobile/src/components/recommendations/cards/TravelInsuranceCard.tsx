import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  provider?: string;
  planName?: string;
  planType?: string;
  whyThisOne?: string[];
  coverage?: { label: string; value: string }[];
  premium?: number;
  currency?: string;
  expandedDetails?: { title: string; points: string[] }[];
  onViewDetails?: () => void;
};

export default function TravelInsuranceCard({
  provider = 'Allianz Assistance',
  planName = 'Family Travel Insurance',
  planType = 'Single Trip | Silver',
  whyThisOne = [
    'Covers all three of you under one policy.',
    'Silver includes medical cover suited to your trip without paying for extras.',
    "Single trip's enough, no need for annual cover.",
  ],
  coverage = [
    { label: 'Coverage duration', value: '12th August to 20th August' },
    { label: 'Benefits', value: 'Covers delayed departures, lost baggage + 12 coverages' },
  ],
  premium = 59,
  currency = '£',
  expandedDetails = [
    {
      title: 'Medical Coverage',
      points: [
        'Emergency medical expenses up to £100,000',
        'Dental treatment up to £500',
        'Prescription medications',
        'Hospital stay and surgical procedures',
      ],
    },
    {
      title: 'Travel Protection',
      points: [
        'Delayed departure (4+ hours): £100',
        'Lost baggage: up to £2,500',
        'Flight cancellation: full coverage',
        'Travel documents loss: £500',
      ],
    },
    {
      title: 'Personal Liability',
      points: [
        'Covers accidental injury to third parties: £1,000,000',
        'Property damage liability: £500,000',
      ],
    },
    {
      title: 'Emergency Services',
      points: [
        '24/7 emergency helpline',
        'Emergency evacuation covered',
        'Emergency dental treatment',
      ],
    },
  ],
  onViewDetails,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.providerLogo}>
          <Ionicons name="shield-checkmark" size={24} color={colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.provider}>{provider}</Text>
          <Text style={styles.planName}>{planName}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.planType}>{planType}</Text>
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
        <Text style={styles.sectionTitle}>Coverage includes</Text>
        {coverage.map((item, index) => (
          <View key={index} style={styles.detailRow}>
            <Text style={styles.detailLabel}>{item.label}</Text>
            <Text style={styles.detailValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.premiumRow}>
        <Text style={styles.premiumLabel}>Premium</Text>
        <Text style={styles.premiumPrice}>
          {currency}{premium}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.viewDetailsButton}
        onPress={() => {
          setShowDetails(!showDetails);
          onViewDetails?.();
        }}
      >
        <Text style={styles.viewDetailsText}>
          {showDetails ? 'Hide details' : 'View details'}
        </Text>
      </TouchableOpacity>

      {showDetails && (
        <View style={styles.expandedSection}>
          <Text style={styles.detailsTitle}>Full Coverage Details</Text>
          {expandedDetails.map((section, idx) => (
            <View key={idx} style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>{section.title}</Text>
              {section.points.map((point, pidx) => (
                <View key={pidx} style={styles.detailPoint}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                  <Text style={styles.detailPointText}>{point}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.termsText}>
            Terms and conditions apply. Full policy details will be sent to your email after purchase.
          </Text>
        </View>
      )}
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
    backgroundColor: '#F5DEDE',
    justifyContent: 'center',
    alignItems: 'center',
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
  planType: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
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
  detailRow: {
    marginBottom: spacing.md,
  },
  detailLabel: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  premiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopWidth: 2,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
    borderBottomWidth: 2,
    borderBottomColor: colors.textSecondary,
    borderBottomOpacity: 0.1,
  },
  premiumLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  premiumPrice: {
    ...typography.sectionTitle,
    color: colors.brand,
  },
  viewDetailsButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  viewDetailsText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.brand,
  },
  expandedSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
  },
  detailsTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  detailSection: {
    marginBottom: spacing.lg,
  },
  detailSectionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  detailPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  detailPointText: {
    flex: 1,
    ...typography.small,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  termsText: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
});
