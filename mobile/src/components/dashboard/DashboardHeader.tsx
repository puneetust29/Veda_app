import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import DropdownMenu, { type DropdownMenuItem } from '../common/DropdownMenu';
import { colors, fonts, spacing } from '../../theme';
import { headerRings, history as historyXml, logo as logoXml } from './figmaSvgs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// The decorative rings (Figma node 1:35333) are a 775.552x1035.95 group
// whose center sits 3.22px left of the frame's center line and ~21px from
// the top of the 414x1329 frame.
const RINGS_WIDTH = 775.552;
const RINGS_HEIGHT = 1035.95;

type Props = {
  avatarInitial: string;
  onPressHistory?: () => void;
  /** Profile menu items (All plans, My plans, Device Calendar, Sign out,
   * etc.). No dedicated profile screen exists in the design yet, so tapping
   * the avatar opens this dropdown instead of navigating anywhere. */
  menuItems: DropdownMenuItem[];
};

// Red gradient top bar (Figma node 1:35348): 56px history button on the
// left, Vinto brand mark centered, 56px user avatar on the right. The white
// content sheet below overlaps this header with a 24px top radius, so the
// gradient gets extra bottom padding. The avatar opens a profile dropdown
// menu (see DropdownMenu in common/).
export default function DashboardHeader({ avatarInitial, onPressHistory, menuItems }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[colors.headerGradientStart, colors.headerGradientEnd]}
      start={{ x: 1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.header, { paddingTop: insets.top - 10 + spacing.sm + 2 }]}
    >
      <View pointerEvents="none" style={[styles.rings, { top: insets.top - 10 - RINGS_HEIGHT / 2 }]}>
        <SvgXml xml={headerRings} width={RINGS_WIDTH} height={RINGS_HEIGHT} />
      </View>

      <TouchableOpacity
        style={styles.iconButton}
        onPress={onPressHistory}
        disabled={!onPressHistory}
      >
        <SvgXml xml={historyXml} width={24} height={24} />
      </TouchableOpacity>

      <SvgXml xml={logoXml} width={33.35} height={22.16} />

      <TouchableOpacity style={styles.avatar} onPress={() => setMenuVisible(true)}>
        <Text style={styles.avatarText}>{avatarInitial}</Text>
      </TouchableOpacity>

      <DropdownMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
        topOffset={insets.top + spacing.md + 56 + spacing.sm}
      />
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
  rings: {
    position: 'absolute',
    left: SCREEN_WIDTH / 2 - 3.22 - RINGS_WIDTH / 2,
  },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(243,243,243,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 20 },
});
