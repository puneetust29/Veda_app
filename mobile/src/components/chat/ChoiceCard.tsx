import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChoiceOption } from '../../types';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = {
  question: string;
  choices: ChoiceOption[];
  selected?: string;
  onSelect: (value: string) => void;
};

export default function ChoiceCard({ question, choices, selected, onSelect }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.question}>{question}</Text>
      <View style={styles.pills}>
        {choices.map((c) => {
          const isSelected = selected === c.value;
          return (
            <Pressable
              key={c.value}
              style={({ pressed }) => [
                styles.pill,
                isSelected && styles.pillSelected,
                pressed && !isSelected && styles.pillPressed,
                selected && !isSelected && styles.pillDimmed,
              ]}
              onPress={() => !selected && onSelect(c.value)}
              disabled={!!selected}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: isSelected, disabled: !!selected }}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextSelected, selected && !isSelected && styles.pillTextDimmed]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginVertical: spacing.xs,
    gap: spacing.md,
  },
  question: {
    ...typography.body,
    color: colors.textPrimary,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.background,
  },
  pillSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pillPressed: {
    backgroundColor: colors.brandTint,
  },
  pillDimmed: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.background,
  },
  pillText: {
    ...typography.small,
    color: colors.brand,
  },
  pillTextSelected: {
    color: colors.white,
  },
  pillTextDimmed: {
    color: colors.textDisabled,
  },
});
