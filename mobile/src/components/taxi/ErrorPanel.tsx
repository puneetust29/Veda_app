import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../../theme';

type Props = {
  message: string;
  onRetry: () => void;
};

export default function ErrorPanel({ message, onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      <TouchableOpacity style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: '#fff3f3',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcccc',
    gap: spacing.md,
  },
  text: {
    color: colors.brand,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
