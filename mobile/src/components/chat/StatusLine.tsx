import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  state: 'active' | 'done';
};

export default function StatusLine({ label, state }: Props) {
  return (
    <View style={styles.row}>
      {state === 'active' ? (
        <ActivityIndicator size="small" color="#888" style={styles.icon} />
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
    marginBottom: 8,
    paddingVertical: 2,
  },
  icon: { marginRight: 8, width: 16 },
  checkmark: { color: '#0a7a3f', fontWeight: '700', marginRight: 8, width: 16, textAlign: 'center' },
  label: { color: '#666', fontSize: 13, flexShrink: 1 },
});
