import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';

export type DropdownMenuItem = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: DropdownMenuItem[];
  /** Distance from the top of the screen to the menu card, so callers can
   * position it just under their trigger (e.g. a header avatar). */
  topOffset?: number;
};

// Generic reusable dropdown/menu popover: a full-screen transparent backdrop
// (tap-to-dismiss) plus a small right-aligned card of icon+label rows. Used
// for the Dashboard header's profile menu; any other trigger (avatar, "..."
// button, etc.) can reuse this instead of building a bespoke menu.
export default function DropdownMenu({ visible, onClose, items, topOffset = 100 }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.menu, { top: topOffset }]}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, index < items.length - 1 && styles.itemDivider]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={item.destructive ? colors.brand : colors.textPrimary}
              />
              <Text style={[styles.itemLabel, item.destructive && styles.itemLabelDestructive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  menu: {
    position: 'absolute',
    right: spacing.xl,
    minWidth: 200,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemLabel: { ...typography.body, color: colors.textPrimary },
  itemLabelDestructive: { color: colors.brand },
});
