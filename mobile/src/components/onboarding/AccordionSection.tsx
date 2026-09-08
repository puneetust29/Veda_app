import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  /** When provided, the section becomes controlled: its open/closed state is
   * driven by this prop instead of internal state (used to keep only one
   * accordion open at a time). */
  expanded?: boolean;
  /** Called after an expand/collapse, so parents relying on content height
   * (e.g. a "scroll to enable" button) can re-check after the layout
   * change settles. */
  onToggle?: (expanded: boolean) => void;
  /** Set on the last accordion in a list to omit the bottom divider. */
  isLast?: boolean;
};

// Expand/collapse section with a rotating chevron — matches the "How Veda
// uses your information" style accordions on the consent screen. Uses
// LayoutAnimation for the height transition (simplest cross-platform option)
// and an Animated rotation for the chevron.
export default function AccordionSection({
  title,
  children,
  defaultExpanded = false,
  expanded: expandedProp,
  onToggle,
  isLast = false,
}: Props) {
  const isControlled = expandedProp !== undefined;
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = isControlled ? expandedProp : internalExpanded;
  const rotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, { toValue: expanded ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [expanded, rotation]);

  const toggle = () => {
    const nextExpanded = !expanded;
    if (!isControlled) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setInternalExpanded(nextExpanded);
    }
    onToggle?.(nextExpanded);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={[styles.container, isLast && styles.containerLast]}>
      <Pressable style={styles.header} onPress={toggle}>
        <Text style={styles.title}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </Animated.View>
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1, borderBottomColor: colors.border },
  containerLast: { borderBottomWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  title: { ...typography.bodyBold, color: colors.textPrimary, flex: 1 },
  body: { paddingBottom: spacing.md },
});
