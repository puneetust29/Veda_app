import { StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '../../theme';

/**
 * Small footer note shown at the end of every chat thread reminding the user
 * that AI-generated content should be double-checked.
 */
export default function AiDisclaimer() {
  return <Text style={styles.text}>Veda AI may make mistakes. Please review.</Text>;
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
