import { TouchableOpacity, View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

type Props = {
  label: string;
  onChangePress: () => void;
};

export default function PickupLocationRow({ label, onChangePress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Ionicons name="location" size={18} color={colors.brand} />
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity onPress={onChangePress}>
          <Text style={styles.change}>Change</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  change: {
    fontSize: 13,
    color: colors.brand,
    fontWeight: '600',
  },
});
