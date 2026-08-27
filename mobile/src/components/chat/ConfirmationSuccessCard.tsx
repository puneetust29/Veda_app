import { StyleSheet, Text, View } from 'react-native';

type Props = {
  planType: 'roaming' | 'insurance';
};

export default function ConfirmationSuccessCard({ planType }: Props) {
  const displayText = planType === 'roaming' ? 'Roaming confirmed' : 'Travel insurance confirmed';

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>✓</Text>
      </View>
      <Text style={styles.text}>{displayText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE0E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 32,
    gap: 12,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
  },
});
