import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  label: string;
  backgroundColor?: string;
  textColor?: string;
};

export default function ConfirmationChip({
  label,
  backgroundColor = '#F5DEDE',
  textColor = colors.brand,
}: Props) {
  return (
    <View style={[styles.chip, { backgroundColor }]}>
      <Ionicons name="checkmark-circle" size={20} color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>✓ {label} confirmed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginVertical: spacing.md,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.body,
    fontWeight: '600',
  },
});
