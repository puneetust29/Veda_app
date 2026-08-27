import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  state: 'active' | 'done';
};

export default function StatusLine({ label, state }: Props) {
  return (
    <View style={styles.row}>
      {state === 'active' ? (
        <ActivityIndicator size="small" color="#D32F2F" style={styles.icon} />
      ) : (
        <Text style={styles.checkmark}>✓</Text>
      )}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  icon: { marginRight: 10, width: 18 },
  checkmark: { color: '#4CAF50', fontWeight: '700', marginRight: 10, width: 18, textAlign: 'center', fontSize: 14 },
  label: { color: '#1F1F1F', fontSize: 14, flexShrink: 1, fontWeight: '500' },
});
