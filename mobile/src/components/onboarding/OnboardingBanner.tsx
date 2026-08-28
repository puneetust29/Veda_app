import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HeroBanner from '../../../assets/onboarding-banner-swoosh.svg'
import BannerRings from '../../../assets/onboarding-banner-rings.svg'

import { colors } from '../../theme';

// linear-gradient(104.62deg, #E70001 6.94%, #970000 93.97%) — same hero
// banner gradient token used on PlanSelectionScreen (Figma hero banner
// component shared across onboarding screens).
const BANNER_GRADIENT = {
  colors: [colors.gradientBannerStart, colors.gradientBannerEnd] as const,
  locations: [0.0694, 0.9397] as const,
  start: { x: 0, y: 0.32 },
  end: { x: 1, y: 0.68 },
};

// Red hero banner used behind the headline on Phone Entry / OTP screens.
// Uses Figma vector SVG with a radial-gradient background (requires New Architecture).
export default function OnboardingBanner() {
  return (
    <LinearGradient {...BANNER_GRADIENT} style={styles.container}>
      <BannerRings
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMin slice"
        style={styles.rings}
      />
      <View style={styles.swooshContainer}>
        <HeroBanner width={200} height={280} style={styles.swoosh} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 250,
    overflow: 'hidden',
  },
  rings: {
    ...StyleSheet.absoluteFillObject,
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
