import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../theme';

// Red hero banner used behind the headline on Phone Entry / OTP screens.
// Approximates the Figma reference's radial red gradient + white "swoosh"
// mark using layered rotated shapes (no SVG dependency in this project yet).
export default function OnboardingBanner() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.brandDark, colors.brand]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.swooshWrap}>
        <View style={styles.swooshBase} />
        <View style={styles.swooshNotch} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 160, overflow: 'hidden' },
  swooshWrap: { position: 'absolute', bottom: -40, alignSelf: 'center' },
  swooshBase: {
    width: 130,
    height: 170,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.92)',
    transform: [{ rotate: '18deg' }],
  },
  swooshNotch: {
    position: 'absolute',
    top: 18,
    left: 14,
    width: 60,
    height: 90,
    borderRadius: 40,
    backgroundColor: colors.brand,
    transform: [{ rotate: '-12deg' }],
  },
});
