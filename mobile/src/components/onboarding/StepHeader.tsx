import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme';

type Props = {
  onBack?: () => void;
  /** True when this header sits on top of the red OnboardingBanner (Phone
   * Entry / OTP) rather than a plain white background (Welcome, etc.) — uses
   * a translucent white circle instead of the default light-gray one. */
  overlay?: boolean;
};

// Small back-chevron header reused across the onboarding steps (phone entry,
// OTP, welcome, plan selection, permissions, accounts, consent) — every
// screen after the landing page has this in the Figma prototype. Accounts
// for the safe-area top inset (notch/Dynamic Island) itself since these
// screens don't wrap in a SafeAreaView — without it, the button rendered
// under the status bar and was untappable.
export default function StepHeader({ onBack, overlay }: Props) {
  const insets = useSafeAreaInsets();
  if (!onBack) return null;

  // Overlay mode sits above hero banners. Keep it anchored with a fixed top
  // offset (plus safe area) and a high z-index so later siblings (ScrollView)
  // don't paint over it.
  if (overlay) {
    return (
      <View style={[styles.container, styles.containerOverlay, { top: insets.top + spacing.sm }]}>
        <TouchableOpacity style={[styles.circle, styles.circleOverlay]} onPress={onBack} hitSlop={16}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <TouchableOpacity style={[styles.circle, styles.circleDefault]} onPress={onBack} hitSlop={16}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

export type OnboardingNav = NativeStackNavigationProp<import('../../types').OnboardingStackParamList>;

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  containerOverlay: { position: 'absolute', left: 0, right: 0, zIndex: 1000, elevation: 1000 },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  circleDefault: { backgroundColor: colors.surface },
  // Dark translucent (not white-on-white) so the chevron stays visible
  // regardless of what's behind it — the banner's light "swoosh" graphic
  // made a white-tinted circle nearly invisible.
  circleOverlay: { backgroundColor: 'rgba(0,0,0,0.28)' },
});
