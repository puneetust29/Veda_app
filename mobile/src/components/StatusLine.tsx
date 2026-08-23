import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  state: 'active' | 'done';
};

export default function StatusLine({ label, state }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        {state === 'active' ? (
          <ActivityIndicator size="small" color="#ABABAB" />
        ) : (
          <Text style={styles.check}>✓</Text>
        )}
      </View>
      <Text style={[styles.label, state === 'done' && styles.labelDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 3,
  },
  iconWrap: {
    width: 18,
    alignItems: 'center',
  },
  check: {
    fontSize: 13,
    color: '#ABABAB',
    fontWeight: '600',
  },
  label: {
    color: '#6B6B6B',
    fontSize: 13,
    fontWeight: '400',
    flexShrink: 1,
  },
  labelDone: {
    color: '#ABABAB',
  },
});
