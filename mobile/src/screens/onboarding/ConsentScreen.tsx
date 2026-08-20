import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AccordionSection from '../../components/onboarding/AccordionSection';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Consent'>;

const BULLETS = [
  'Organise important events, plans and reminders',
  'Bring together relevant information from your connected accounts',
  'Coordinate shared plans and services across your family',
  'Recommend relevant Vodafone products, plans and services',
  'Support travel, scheduling and other everyday tasks',
  'Personalise information and recommendations based on your preferences',
  'Improve the performance, reliability and usability of Veda',
  'Detect fraud, misuse and security issues',
];

// The "Agree & Continue" button animates from a disabled tint to solid
// brand-red as the user scrolls to the bottom of the consent copy — matches
// the scroll-gated enable animation in the Figma "Your data belongs to you"
// screen (single accordion, no separate "how Veda shares" etc. sections).
export default function ConsentScreen({ navigation }: Props) {
  const [reachedEnd, setReachedEnd] = useState(false);
  const ctaAnim = useRef(new Animated.Value(0)).current;
  // Track both the scroll viewport and content heights so we can tell
  // whether there's anything to scroll at all — with the accordion
  // collapsed by default the content can fit on-screen, and a ScrollView
  // never fires onScroll in that case, which previously left the button
  // permanently disabled.
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);

  const unlock = () => {
    if (reachedEnd) return;
    setReachedEnd(true);
    Animated.timing(ctaAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
  };

  const checkFitsWithoutScrolling = () => {
    if (viewportHeight.current > 0 && contentHeight.current > 0 && contentHeight.current <= viewportHeight.current) {
      unlock();
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 24;
    if (nearBottom) unlock();
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    checkFitsWithoutScrolling();
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    contentHeight.current = height;
    checkFitsWithoutScrolling();
  };

  const ctaBackground = ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.brandTint, colors.brand] });
  const ctaTextColor = ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.brand, colors.white] });

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <Animated.ScrollView
        contentContainerStyle={styles.body}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
      >
        <StepProgressBar step={4} />
        <Text style={styles.title}>Your data belongs to you.</Text>
        <Text style={styles.subtitle}>
          Veda only accesses information you've approved, and you can change or remove permissions anytime.
        </Text>

        <AccordionSection title="How I'll use your information" defaultExpanded onToggle={checkFitsWithoutScrolling}>
          <Text style={styles.sectionIntro}>Veda uses information you choose to provide or connect to:</Text>
          {BULLETS.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{'\u2022'}</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
          <Text style={styles.sectionExtra}>
            Some features use AI to summarise information, identify relevant actions and generate recommendations.
            Recommendations are suggestions only, and important purchases, account changes or service activations
            will require your confirmation.
          </Text>
          <Text style={styles.sectionExtra}>
            Veda only uses information for clear, stated purposes and should collect no more information than is
            necessary for those purposes.
          </Text>
        </AccordionSection>

        <Text style={styles.agreement}>
          By selecting <Text style={styles.agreementBold}>Agree & Continue</Text>, you agree to Veda's terms and
          privacy policy.
        </Text>
        <View style={styles.legalLinks}>
          <Text style={styles.link}>Privacy Notice</Text>
          <Text style={styles.legalDivider}>·</Text>
          <Text style={styles.link}>Terms of Use</Text>
        </View>
      </Animated.ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity disabled={!reachedEnd} onPress={() => navigation.navigate('Success')}>
          <Animated.View style={[styles.cta, { backgroundColor: ctaBackground }]}>
            <Animated.Text style={[styles.ctaText, { color: ctaTextColor }]}>Agree & Continue</Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  sectionIntro: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  bulletDot: { ...typography.caption, color: colors.textSecondary },
  bulletText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  sectionExtra: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 18 },
  agreement: { ...typography.small, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 16 },
  agreementBold: { color: colors.textPrimary, fontWeight: '700' },
  legalLinks: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  link: { ...typography.small, color: colors.brand, fontWeight: '700' },
  legalDivider: { ...typography.small, color: colors.textMuted },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  cta: { borderRadius: radii.pill, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaText: { ...typography.bodyBold, fontSize: 16 },
});
