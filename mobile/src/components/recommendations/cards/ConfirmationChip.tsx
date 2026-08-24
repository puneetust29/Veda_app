import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  label: string;
};

export default function ConfirmationChip({ label }: Props) {
  return (
    <View style={styles.chip}>
      <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
      <Text style={styles.text}>✓ {label} confirmed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F5DEDE',
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginVertical: spacing.md,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.body,
    color: colors.brand,
    fontWeight: '600',
  },
});
