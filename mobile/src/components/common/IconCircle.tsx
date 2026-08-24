import { Ionicons } from '@expo/vector-icons';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';

import { colors } from '../../theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  backgroundColor?: string;
  style?: ViewStyle;
};

// Small reusable circular icon container — used for header icon buttons,
// avatars-as-initials fallback framing, suggestion tile icons, carousel CTA
// arrows, and source badges. Centralizes the "circle with an icon in it"
// pattern that recurred across dashboard components.
export default function IconCircle({
  icon,
  size = 32,
  iconSize,
  iconColor = colors.brand,
  backgroundColor = colors.brandTint,
  style,
}: Props) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={iconColor} />
    </View>
  );
}
