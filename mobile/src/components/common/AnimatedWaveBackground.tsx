import { Animated, StyleSheet, View } from 'react-native';

export default function AnimatedWaveBackground() {
  const wave1 = new Animated.Value(0);
  const wave2 = new Animated.Value(0);
  const wave3 = new Animated.Value(0);

  Animated.loop(
    Animated.timing(wave1, {
      toValue: 360,
      duration: 8000,
      useNativeDriver: false,
    }),
  ).start();

  Animated.loop(
    Animated.timing(wave2, {
      toValue: 360,
      duration: 10000,
      useNativeDriver: false,
    }),
  ).start();

  Animated.loop(
    Animated.timing(wave3, {
      toValue: 360,
      duration: 12000,
      useNativeDriver: false,
    }),
  ).start();

  return (
    <View style={styles.waveContainer}>
      <Animated.View
        style={[
          styles.waveLayer,
          styles.waveLayer1,
          {
            transform: [
              {
                translateY: wave1.interpolate({
                  inputRange: [0, 360],
                  outputRange: [0, -100],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.waveLayer,
          styles.waveLayer2,
          {
            transform: [
              {
                translateY: wave2.interpolate({
                  inputRange: [0, 360],
                  outputRange: [0, -80],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.waveLayer,
          styles.waveLayer3,
          {
            transform: [
              {
                translateY: wave3.interpolate({
                  inputRange: [0, 360],
                  outputRange: [0, -60],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  waveContainer: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  waveLayer: {
    position: 'absolute',
    width: '140%',
    height: 150,
    borderRadius: 999,
  },
  waveLayer1: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    top: '5%',
    left: '-20%',
  },
  waveLayer2: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    top: '25%',
    left: '-15%',
  },
  waveLayer3: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    top: '45%',
    left: '-20%',
  },
});
