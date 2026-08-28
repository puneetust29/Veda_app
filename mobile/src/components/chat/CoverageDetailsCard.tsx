import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts, spacing, typography } from '../../theme';
import type { TravelInsurancePlan } from '../../types';

type Props = {
  plan: TravelInsurancePlan;
  onClose?: () => void;
};

export default function CoverageDetailsCard({ plan, onClose }: Props) {
  const parseCoverageItem = (item: string): { label: string; value: string } => {
    const parts = item.split('|');
    if (parts.length === 2) {
      return {
        label: parts[0].trim(),
        value: parts[1].trim(),
      };
    }
    return { label: item, value: '' };
  };

  return (
    <View style={styles.card}>
      {/* Title */}
      <Text style={styles.title}>What's covered — {plan.planName}</Text>

      {/* Coverage Items */}
      {Object.entries(plan.fullCoverageDetails).map(([category, items], categoryIndex) => (
        <View key={category}>
          {items.map((item, itemIndex) => {
            const { label, value } = parseCoverageItem(item);
            const isLastItem =
              categoryIndex === Object.entries(plan.fullCoverageDetails).length - 1 &&
              itemIndex === items.length - 1;

            return (
              <View key={`${category}-${itemIndex}`}>
                <View style={styles.coverageRow}>
                  <Text style={styles.coverageLabel}>{label}</Text>
                  {value && <Text style={styles.coverageValue}>{value}</Text>}
                </View>
                {!isLastItem && <View style={styles.divider} />}
              </View>
            );
          })}
        </View>
      ))}

      {/* Back Button */}
      {onClose && (
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 16,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: spacing.lg,
  },
  coverageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  coverageLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    paddingRight: spacing.md,
  },
  coverageValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  backButton: {
    backgroundColor: colors.accentCta,
    height: 49,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    width: '100%',
  },
  backButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
  },
});
