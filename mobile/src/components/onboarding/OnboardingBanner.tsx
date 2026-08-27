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
    // borderRadius: 100,
    backgroundColor: colors.brandText,
    boxShadow: `0px 4px 8px 0px ${colors.bannerGlow} inset`,

    // experimental_backgroundImage: `radial-gradient(97.01% 97.01% at 50% 2.99%, #000000 11.15%, ${colors.brandText} 59.62%, #000000 100%)`,
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
