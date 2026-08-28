import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { colors, fonts, spacing, typography } from '../../../theme';
import type { TravelInsurancePlan } from '../../../types';
import AllianzMarkIcon from '../../icons/AllianzMarkIcon';
import BenefitsIcon from '../../icons/BenefitsIcon';
import CheckIcon from '../../icons/CheckIcon';
import InfoIcon from '../../icons/InfoIcon';
import CalendarIcon from '../../icons/CalendarIcon';
import Feather from '@expo/vector-icons/Feather';

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
        <View style={styles.providerRow}>
          <View style={styles.providerMark}>
            <AllianzMarkIcon size={20} />
          </View>
          <Text style={styles.provider}>{plan.provider}</Text>
        </View>
        <Text style={styles.planName}>{plan.planName}</Text>
      </View>

      {/* Plan Type */}
      <View style={styles.planTypeSection}>
        <Text style={styles.planType}>{plan.planType}</Text>
      </View>

      {/* Why This One */}
      <View style={styles.whySection}>
        <Text style={styles.sectionTitle}>Why this one</Text>
        {plan.whyThisOne.map((reason, i) => (
          <ChecklistItem key={i} text={reason} />
        ))}
      </View>

      {/* Coverage Details */}
      <View style={styles.coverageSection}>
        <Text style={styles.sectionTitle}>Coverage includes</Text>

        <View style={styles.coverageItem}>
          <View style={styles.coverageIconBadge}>
            <CalendarIcon size={20} color="#E60000" />
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
            <Feather name="shield" size={20} color="#E60000" />
          </View>
          <View style={[styles.coverageContent, { flex: 1 }]}>
            <Text style={styles.coverageItemLabel}>Benefits</Text>
            <View style={styles.benefitsValueRow}>
              <Text style={styles.coverageItemValue}>{plan.benefitsSummary}</Text>
              <Pressable accessibilityLabel="More information about benefits">
                <InfoIcon size={16} />
              </Pressable>
            </View>
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
      <CheckIcon size={12} />
      <Text style={styles.checklistText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 16,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  providerMark: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  provider: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  planName: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  planTypeSection: { paddingTop: 16 },
  planType: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  whySection: {
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  coverageSection: {
    paddingTop: 18,
    paddingBottom: 2,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 18,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: 12,
  },
  checklistText: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 16,
  },
  detailRow: {
    marginBottom: 20,
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
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(230, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverageContent: {
    flex: 1,
  },
  coverageItemLabel: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  coverageItemValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 17,
    flex: 1,
  },
  benefitsValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  premiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  premiumLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  premiumPrice: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingTop: 8,
  },
  viewDetailsButton: {
    height: 49,
    width: '47%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(230, 0, 0, 0.07)',
    backgroundColor: '#FFFFFF',
  },
  viewDetailsText: {
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    color: colors.accentButton,
  },
  proceedButton: {
    flex: 1,
    height: 49,
    backgroundColor: colors.accentCta,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: 'white',
  },
});
