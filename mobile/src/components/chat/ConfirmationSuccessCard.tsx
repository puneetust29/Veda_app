import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import CheckmarkIcon from '../icons/CheckmarkIcon';
import { colors, fonts, spacing } from '../../theme';

type Props = {
  planType: 'roaming' | 'insurance';
};

export default function ({ planType }: Props) {
  const displayText = planType === 'roaming' ? 'Roaming plan confirmed' : 'Travel insurance confirmed';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFFDFD', '#FFE4E4']}
        locations={[0.008, 0.992]}
        start={{ x: 0, y: 0.53 }}
        end={{ x: 1, y: 0.47 }}
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
    backgroundColor: colors.white,
    borderRadius: 24,
    // iOS shadow
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.122,
    shadowRadius: 16,
    // Android elevation
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.sm,
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
