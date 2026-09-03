import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

type Prediction = { place_id: string; description: string };

type Props = {
  predictions: Prediction[];
  onSelect: (description: string) => void;
};

export default function DestinationSuggestions({ predictions, onSelect }: Props) {
  if (predictions.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Suggestions</Text>
      <View style={styles.grid}>
        {predictions.map((pred) => (
          <TouchableOpacity
            key={pred.place_id}
            style={styles.card}
            onPress={() => onSelect(pred.description)}
            activeOpacity={0.7}
          >
            <View style={styles.icon}>
              <Ionicons name="location" size={20} color={colors.white} />
            </View>
            <View style={styles.content}>
              <Text style={styles.text}>{pred.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  grid: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandTint,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#ffccc7',
    gap: spacing.lg,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 20,
  },
});
