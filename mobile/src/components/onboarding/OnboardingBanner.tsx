import { StyleSheet, View, Image } from 'react-native';
import HeroBanner from '../../../assets/onboarding-banner-swoosh.svg'

import { colors } from '../../theme';

// Red hero banner used behind the headline on Phone Entry / OTP screens.
// Uses Figma vector SVG with a radial-gradient background (requires New Architecture).
export default function OnboardingBanner() {
  return (
    <View style={styles.container}>
      <View style={styles.swooshContainer}>
        <HeroBanner width={200} height={280} style={styles.swoosh} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 250,
    overflow: 'hidden',
    backgroundColor: colors.brandText,
  },
  swooshContainer: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    width: 200,
    height: 310,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swoosh: {
    width: '100%',
    height: '100%',
    shadowColor: colors.bannerGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
});
