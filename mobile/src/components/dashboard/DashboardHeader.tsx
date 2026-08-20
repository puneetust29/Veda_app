import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import DropdownMenu, { type DropdownMenuItem } from '../common/DropdownMenu';
import IconCircle from '../common/IconCircle';
import { colors, spacing, typography } from '../../theme';

type Props = {
  avatarInitial: string;
  onPressHistory?: () => void;
  /** Profile menu items (All plans, My plans, Device Calendar, Sign out,
   * etc.). No dedicated profile screen exists in the design yet, so tapping
   * the avatar opens this dropdown instead of navigating anywhere. */
  menuItems: DropdownMenuItem[];
};

// Red, rounded-bottom top bar: history icon on the left, brand mark
// centered, user avatar on the right — matches the Figma header treatment
// used across screens in the design file. The avatar opens a profile
// dropdown menu (see DropdownMenu in common/).
export default function DashboardHeader({ avatarInitial, onPressHistory, menuItems }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onPressHistory} disabled={!onPressHistory}>
        <IconCircle
          icon="time-outline"
          size={40}
          iconColor={colors.white}
          backgroundColor="rgba(255,255,255,0.18)"
        />
      </TouchableOpacity>

      <Text style={styles.logo}>V</Text>

      <TouchableOpacity style={styles.avatar} onPress={() => setMenuVisible(true)}>
        <Text style={styles.avatarText}>{avatarInitial}</Text>
      </TouchableOpacity>

      <DropdownMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
        topOffset={96}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.brand,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xxxl + spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  logo: { color: colors.white, fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, ...typography.bodyBold },
});
