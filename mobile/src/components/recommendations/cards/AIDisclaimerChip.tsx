import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../../theme';

export default function AIDisclaimerChip() {
  return (
    <View style={styles.disclaimer}>
      <Text style={styles.text}>Veda AI may make mistakes. Please review.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disclaimer: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.md,
  },
  text: {
    ...typography.small,
    color: '#9A7A2B',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
