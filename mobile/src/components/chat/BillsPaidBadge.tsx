import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import CheckmarkIcon from '../icons/CheckmarkIcon';
import { colors, fonts, spacing } from '../../theme';

// Same visual language as ConfirmationSuccessCard (the roaming/insurance
// "confirmed" badge) — gradient card + CheckmarkIcon seal — but self-sized
// and centered per Figma node 78:35556 ("Bills Paid" badge) rather than
// stretched full-width.
export default function BillsPaidBadge() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFFDFD', '#FFE4E4']}
        locations={[0.008, 0.992]}
        start={{ x: 0, y: 0.53 }}
        end={{ x: 1, y: 0.47 }}
        style={styles.content}
      >
        <CheckmarkIcon size={24} />
        <Text style={styles.text}>Bills Paid</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    marginVertical: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 24,
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.122,
    shadowRadius: 16,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
});
