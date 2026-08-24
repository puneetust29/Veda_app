import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../../theme';

type Selection = { gb: number; price: number };
type Selections = { Emily: Selection; Sophia: Selection; Oliver: Selection };

type Props = {
  selections: Selections;
  onSelect: (traveler: string, gb: number, price: number) => void;
  total: number;
  onApply: () => void;
};

export default function TravelerCustomization({
  selections,
  onSelect,
  total,
  onApply,
}: Props) {
  const travelers = [
    {
      name: 'Emily',
      options: [
        { gb: 1, price: 12 },
        { gb: 2, price: 18 },
        { gb: 5, price: 28 },
      ],
    },
    {
      name: 'Sophia',
      options: [
        { gb: 1, price: 8.5 },
        { gb: 2, price: 12.75 },
      ],
    },
    {
      name: 'Oliver',
      options: [
        { gb: 0, price: 0, label: 'No plan' },
        { gb: 1, price: 8.5 },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.message}>
        <Text style={styles.messageText}>
          Adjust each traveller's allowance and I'll update the total.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Adjust each traveller</Text>

        {travelers.map((traveler) => (
          <View key={traveler.name} style={styles.travelerSection}>
            <Text style={styles.travelerName}>{traveler.name}</Text>
            <View style={styles.optionsRow}>
              {traveler.options.map((option) => (
                <TouchableOpacity
                  key={`${option.gb}-${option.price}`}
                  style={[
                    styles.optionButton,
                    selections[traveler.name as keyof Selections].gb === option.gb &&
                      styles.optionButtonSelected,
                  ]}
                  onPress={() => onSelect(traveler.name, option.gb, option.price)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selections[traveler.name as keyof Selections].gb === option.gb &&
                        styles.optionTextSelected,
                    ]}
                  >
                    {option.label || `${option.gb} GB`}
                  </Text>
                  <Text
                    style={[
                      styles.optionPrice,
                      selections[traveler.name as keyof Selections].gb === option.gb &&
                        styles.optionPriceSelected,
                    ]}
                  >
                    £{option.price}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalPrice}>£{total.toFixed(2)}</Text>
      </View>

      <TouchableOpacity style={styles.applyButton} onPress={onApply}>
        <Text style={styles.applyButtonText}>Apply</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.1,
  },
  message: {
    backgroundColor: '#F5DEDE',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  messageText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  travelerSection: {
    marginBottom: spacing.lg,
  },
  travelerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  optionButton: {
    flex: 1,
    minWidth: '30%',
    borderWidth: 2,
    borderColor: colors.textSecondary,
    borderOpacity: 0.2,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  optionButtonSelected: {
    borderColor: colors.brand,
    backgroundColor: 'white',
  },
  optionText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  optionTextSelected: {
    color: colors.brand,
  },
  optionPrice: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  optionPriceSelected: {
    color: colors.brand,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
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
  applyButton: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  applyButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: 'white',
  },
});
