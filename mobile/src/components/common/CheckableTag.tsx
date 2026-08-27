import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { colors, fonts } from '../../theme';
import { dotPending } from '../dashboard/figmaSvgs';

type Props = {
  /** SVG markup for the leading icon (see dashboard/figmaSvgs). */
  iconXml: string;
  label: string;
  confirmed: boolean;
  onPress: () => void;
  disabled?: boolean;
};

// Pill chip matching the Figma card chips (node 1:35385): soft red tint
// background, 16px leading icon, 11px Urbanist label, and a trailing status
// mark — the design's amber "pending" dot until confirmed, then a green
// checkmark. Originally built inline for the dashboard's flight-attention
// cards (Roaming / Travel Insurance); lives in `common/` so any other
// confirmable-item list can reuse it.
export default function CheckableTag({ iconXml, label, confirmed, onPress, disabled }: Props) {
  return (
    <TouchableOpacity
      style={[styles.tag, disabled && styles.tagDisabled]}
      onPress={!disabled ? onPress : undefined}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <SvgXml xml={iconXml} width={16} height={16} />
      <Text style={styles.tagText}>{label}</Text>
      {confirmed ? (
        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
      ) : (
        <SvgXml xml={dotPending} width={16} height={16} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.chipTint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagDisabled: { opacity: 0.6 },
  tagText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 16.5,
    color: colors.textPrimary,
  },
});
