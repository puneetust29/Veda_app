import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import CheckmarkIcon from '../icons/CheckmarkIcon';
import { colors, fonts, spacing } from '../../theme';

type Props = {
  planType: 'roaming' | 'insurance';
};

export default function ConfirmationSuccessCard({ planType }: Props) {
  const displayText = planType === 'roaming' ? 'Roaming plan confirmed' : 'Travel insurance confirmed';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFFDFD', '#FFE4E4']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={styles.content}
      >
        <View style={styles.iconContainer}>
          <CheckmarkIcon size={32} />
        </View>
        <Text style={styles.text}>{displayText}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    marginHorizontal: spacing.xxxl,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.sm,
    // iOS shadow
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    // Android elevation
    elevation: 4,
  },
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
});
