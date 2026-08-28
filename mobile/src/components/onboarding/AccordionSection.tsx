import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  /** Called after an expand/collapse, so parents relying on content height
   * (e.g. a "scroll to enable" button) can re-check after the layout
   * change settles. */
  onToggle?: (expanded: boolean) => void;
};

// Expand/collapse section with a rotating chevron — matches the "How Veda
// uses your information" style accordions on the consent screen. Uses
// LayoutAnimation for the height transition (simplest cross-platform option)
// and an Animated rotation for the chevron.
export default function AccordionSection({ title, children, defaultExpanded = false, onToggle }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotation = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  const toggle = () => {
    const nextExpanded = !expanded;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotation, { toValue: nextExpanded ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    setExpanded(nextExpanded);
    onToggle?.(nextExpanded);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={styles.container}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  title: { ...typography.bodyBold, color: colors.textPrimary, flex: 1 },
  body: { paddingBottom: spacing.md },
});
