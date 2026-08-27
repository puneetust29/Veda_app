import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';
import type { TravelInsurancePlan } from '../../../types';

const PROVIDER_LOGO_COLORS: Record<string, string> = {
  Allianz: '#1E3A8A',
  default: '#1E40AF',
};

type Props = {
  plan: TravelInsurancePlan;
  onViewDetails?: () => void;
  onProceed?: () => void;
};

export default function TravelInsuranceCard({ plan, onViewDetails, onProceed }: Props) {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.providerLogo, { backgroundColor: PROVIDER_LOGO_COLORS[plan.provider] || PROVIDER_LOGO_COLORS.default }]}>
          <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
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

        <View style={styles.coverageItem}>
          <View style={styles.coverageIconBadge}>
            <Text style={styles.coverageIcon}>📅</Text>
          </View>
          <View style={styles.coverageContent}>
            <Text style={styles.coverageItemLabel}>Coverage duration</Text>
            <Text style={styles.coverageItemValue}>
              {plan.coverageStart} to {plan.coverageEnd}
            </Text>
          </View>
        </View>

        <View style={styles.coverageItem}>
          <View style={styles.coverageIconBadge}>
            <Text style={styles.coverageIcon}>🛡️</Text>
          </View>
          <View style={[styles.coverageContent, { flex: 1 }]}>
            <View style={styles.benefitsHeader}>
              <Text style={styles.coverageItemLabel}>Benefits</Text>
              <Pressable onPress={() => console.log('info pressed')}>
                <Ionicons name="information-circle" size={18} color="#D32F2F" />
              </Pressable>
            </View>
            <Text style={styles.coverageItemValue}>{plan.benefitsSummary}</Text>
          </View>
        </View>
      </View>

      {/* Divider before premium */}
      <View style={styles.divider} />

      {/* Premium */}
      <View style={styles.premiumRow}>
        <Text style={styles.premiumLabel}>Premium</Text>
        <Text style={styles.premiumPrice}>
          {plan.currency}{plan.premiumAmount.toFixed(2)}
        </Text>
      </View>

      {/* Divider before buttons */}
      <View style={styles.divider} />

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.viewDetailsButton}
          onPress={onViewDetails ? onViewDetails : () => setShowDetails(!showDetails)}
        >
          <Text style={styles.viewDetailsText}>View details</Text>
        </TouchableOpacity>

        {onProceed && (
          <TouchableOpacity style={styles.proceedButton} onPress={onProceed}>
            <Text style={styles.proceedButtonText}>Continue</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <View style={styles.checklistItem}>
      <Text style={styles.checkmarkIcon}>✓</Text>
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
    borderBottomColor: '#E8E8E8',
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
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  checkmarkIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D32F2F',
    marginTop: 2,
  },
  checklistText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 22,
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
  coverageItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  coverageIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverageIcon: {
    fontSize: 20,
  },
  coverageContent: {
    flex: 1,
  },
  coverageItemLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
    marginBottom: spacing.xs,
  },
  coverageItemValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  benefitsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: spacing.md,
  },
  premiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  premiumLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  premiumPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  viewDetailsButton: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D32F2F',
  },
  viewDetailsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D32F2F',
  },
  proceedButton: {
    flex: 1,
    backgroundColor: '#D32F2F',
    borderRadius: 24,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  proceedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
