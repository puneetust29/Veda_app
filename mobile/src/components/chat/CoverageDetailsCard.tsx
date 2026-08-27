import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, typography } from '../../theme';
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
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  coverageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  coverageLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    paddingRight: spacing.md,
  },
  coverageValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  backButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: 50,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  backButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
  },
});
