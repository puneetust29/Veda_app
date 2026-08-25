import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';
import type { TravelInsurancePlan } from '../../../types';

type Props = {
  plan: TravelInsurancePlan;
  onViewDetails?: () => void;
  onProceed?: () => void;
};

export default function TravelInsuranceCard({ plan, onViewDetails, onProceed }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.providerLogo}>
          <Ionicons name="shield-checkmark" size={24} color={colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.provider}>{plan.provider}</Text>
          <Text style={styles.planName}>{plan.planName}</Text>
        </View>
      </View>

      {/* Plan Type */}
      <View style={styles.section}>
        <Text style={styles.planType}>{plan.planType}</Text>
      </View>

      {/* Why This One */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why this one</Text>
        {plan.whyThisOne.map((reason, i) => (
          <ChecklistItem key={i} text={reason} />
        ))}
      </View>

      {/* Coverage Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coverage includes</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Coverage duration</Text>
          <Text style={styles.detailValue}>
            {plan.coverageStart} to {plan.coverageEnd}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Benefits</Text>
          <Text style={styles.detailValue}>{plan.benefitsSummary}</Text>
        </View>
      </View>

      {/* Premium */}
      <View style={styles.premiumRow}>
        <Text style={styles.premiumLabel}>Premium</Text>
        <Text style={styles.premiumPrice}>
          {plan.currency} {plan.premiumAmount.toFixed(2)}
        </Text>
      </View>

      {/* Action Buttons */}
      <TouchableOpacity
        style={styles.viewDetailsButton}
        onPress={() => setShowDetails(!showDetails)}
      >
        <Text style={styles.viewDetailsText}>
          {showDetails ? 'Hide details' : 'View details'}
        </Text>
      </TouchableOpacity>

      {onProceed && (
        <TouchableOpacity style={styles.proceedButton} onPress={onProceed}>
          <Text style={styles.proceedButtonText}>Continue to Payment</Text>
        </TouchableOpacity>
      )}

      {/* Expanded Details */}
      {showDetails && (
        <View style={styles.expandedSection}>
          <Text style={styles.detailsTitle}>Full Coverage Details</Text>

          {Object.entries(plan.fullCoverageDetails).map(([title, items]) => (
            <DetailSection key={title} title={title}>
              {items.map((detail, i) => (
                <DetailPoint key={i} text={detail} />
              ))}
            </DetailSection>
          ))}

          <Text style={styles.termsText}>
            Terms and conditions apply. Full policy details will be sent to your email after purchase.
          </Text>
        </View>
      )}
    </View>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DetailPoint({ text }: { text: string }) {
  return (
    <View style={styles.detailPoint}>
      <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
      <Text style={styles.detailPointText}>{text}</Text>
    </View>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <View style={styles.checklistItem}>
      <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
      <Text style={styles.checklistText}>{text}</Text>
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
  proceedButton: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  proceedButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
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
