import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '../../theme';
import { headerRings, logo as logoXml } from '../dashboard/figmaSvgs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RINGS_WIDTH = 775.552;
const RINGS_HEIGHT = 1035.95;

type Props = {
  onPressClose: () => void;
};

export default function ChatHeader({ onPressClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[colors.headerGradientStart, colors.headerGradientEnd]}
      start={{ x: 1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.header, { paddingTop: insets.top - 10 + spacing.sm + 2 }]}
    >
      <View pointerEvents="none" style={styles.ringsContainer}>
        <SvgXml xml={headerRings} width={RINGS_WIDTH} height={RINGS_HEIGHT} />
      </View>

      <TouchableOpacity style={styles.closeButton} onPress={onPressClose}>
        <Ionicons name="close" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <SvgXml xml={logoXml} width={33.35} height={22.16} />

      <TouchableOpacity style={styles.closeButton} onPress={onPressClose}>
        <Ionicons name="close" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  ringsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
