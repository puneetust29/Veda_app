import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  message?: string;
  backgroundColor?: string;
  textColor?: string;
};

export default function AIDisclaimerChip({
  message = 'Veda AI may make mistakes. Please review.',
  backgroundColor = '#FFF9E6',
  textColor = '#9A7A2B',
}: Props) {
  return (
    <View style={[styles.disclaimer, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disclaimer: {
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.md,
  },
  text: {
    ...typography.small,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
