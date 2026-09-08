import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { colors, fonts, spacing, typography } from '../../../theme';
import type { TravelInsurancePlan, CalendarEvent } from '../../../types';
import AllianzMarkIcon from '../../icons/AllianzMarkIcon';
import CheckIcon from '../../icons/CheckIcon';
import Feather from '@expo/vector-icons/Feather';

type Props = {
  type: 'travel' | 'bill';
  data: TravelInsurancePlan | CalendarEvent;
  onViewDetails?: () => void;
  onProceed?: () => void;
};

export default function RecommendationCard({ type, data, onViewDetails, onProceed }: Props) {
  if (type === 'travel') {
    return <TravelCard plan={data as TravelInsurancePlan} onViewDetails={onViewDetails} onProceed={onProceed} />;
  }

  return <BillCard bill={data as CalendarEvent} onProceed={onProceed} />;
}

function TravelCard({
  plan,
  onViewDetails,
  onProceed
}: {
  plan: TravelInsurancePlan;
  onViewDetails?: () => void;
  onProceed?: () => void;
}) {
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
            <Feather name="calendar" size={20} color="#E60000" />
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
        <TouchableOpacity style={styles.viewDetailsButton} onPress={onViewDetails}>
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

function BillCard({
  bill,
  onProceed
}: {
  bill: CalendarEvent;
  onProceed?: () => void;
}) {
  const rawDetails = bill.raw_details as any || {};
  const billProvider = rawDetails.bill_provider || 'Broadband';
  const billAmount = rawDetails.bill_amount || 0;
  const billCurrency = rawDetails.bill_currency || 'USD';
  const dueDate = rawDetails.due_date ? new Date(rawDetails.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'Due soon';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.billHeader}>
        <Text style={styles.billTitle}>Pay this month's household bills</Text>
        <Text style={styles.billDescription}>I've gathered everything that's due this month.</Text>
      </View>

      {/* Bill Categories */}
      <View style={styles.billCategoriesSection}>
        <View style={styles.billCategories}>
          <BillCategoryTag label={billProvider} highlight />
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Bill Details */}
      <View style={styles.billDetailsSection}>
        <View style={styles.billDetailRow}>
          <View style={styles.billDetailLeft}>
            <Text style={styles.billDetailLabel}>Amount Due</Text>
            <Text style={styles.billDetailValue}>{billCurrency}{billAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.billDetailRight}>
            <Text style={styles.billDetailLabel}>Due Date</Text>
            <Text style={styles.billDetailValue}>{dueDate}</Text>
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Action Button */}
      <TouchableOpacity
        style={styles.reviewPayButton}
        onPress={onProceed}
      >
        <Text style={styles.reviewPayText}>Review & Pay</Text>
        <Feather name="arrow-right" size={20} color={colors.accentButton} />
      </TouchableOpacity>
    </View>
  );
}

function BillCategoryTag({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <View style={[styles.billCategoryTag, highlight && styles.billCategoryTagHighlight]}>
      <Text style={[styles.billCategoryLabel, highlight && styles.billCategoryLabelHighlight]}>
        {label}
      </Text>
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

  // Travel Card Styles
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

  // Bill Card Styles
  billHeader: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  billTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  billDescription: {
    fontFamily: fonts.bodyLight,
    fontSize: 14,
    color: colors.textSecondary,
  },
  billCategoriesSection: {
    paddingVertical: 16,
  },
  billCategories: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  billCategoryTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(230, 0, 0, 0.08)',
  },
  billCategoryTagHighlight: {
    backgroundColor: '#E60000',
  },
  billCategoryLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.accentButton,
  },
  billCategoryLabelHighlight: {
    color: 'white',
  },
  billDetailsSection: {
    paddingVertical: 12,
  },
  billDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billDetailLeft: {
    flex: 1,
  },
  billDetailRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  billDetailLabel: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  billDetailValue: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  reviewPayButton: {
    height: 49,
    backgroundColor: colors.accentCta,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  reviewPayText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: 'white',
  },
});
