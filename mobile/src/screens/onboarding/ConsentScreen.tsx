import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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

type AccordionId = 'use' | 'safe' | 'ai';

// Consent step now uses three collapsed accordions. The CTA stays disabled
// until each accordion has been opened at least once.
export default function ConsentScreen({ navigation }: Props) {
  const [openedAccordions, setOpenedAccordions] = useState<Record<AccordionId, boolean>>({
    use: false,
    safe: false,
    ai: false,
  });
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const openedCount = Object.values(openedAccordions).filter(Boolean).length;
  const allOpened = openedCount === 3;

  const handleAccordionToggle = (id: AccordionId, expanded: boolean) => {
    if (!expanded) return;
    setOpenedAccordions((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  useEffect(() => {
    Animated.timing(ctaAnim, { toValue: allOpened ? 1 : 0, duration: 300, useNativeDriver: false }).start();
  }, [allOpened, ctaAnim]);

  const ctaBackground = ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.brandTint, colors.brand] });
  const ctaTextColor = ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.brand, colors.white] });

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <Animated.ScrollView contentContainerStyle={styles.body}>
        <StepProgressBar step={5} totalSteps={5}/>
        <Text style={styles.title}>Your data belongs to you.</Text>
        <Text style={styles.subtitle}>
          Veda only accesses information you've approved, and you can change or remove permissions anytime.
        </Text>

        <AccordionSection
          title="How I'll use your information"
          onToggle={(expanded) => handleAccordionToggle('use', expanded)}
        >
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
        <AccordionSection title="How I'll protect your information" onToggle={(expanded) => handleAccordionToggle('safe', expanded)}>
          <Text style={styles.sectionExtra}>
            Your data is handled using secure systems and access controls. We only use approved information for the
            purposes described and review safeguards to reduce misuse or unauthorized access.
          </Text>
          <Text style={styles.sectionExtra}>
            You can review or change connected permissions in app settings. Removing access stops future syncing from
            that source.
          </Text>
        </AccordionSection>
        <AccordionSection title="How AI recommendations work" onToggle={(expanded) => handleAccordionToggle('ai', expanded)}>
          <Text style={styles.sectionExtra}>
            AI helps summarize signals from your approved data and suggest useful next actions. Suggestions are
            optional and are designed to support your decisions.
          </Text>
          <Text style={styles.sectionExtra}>
            Important actions, such as purchases or service changes, always require your explicit confirmation before
            anything is applied.
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
        <TouchableOpacity disabled={!allOpened} onPress={() => navigation.navigate('Success')}>
          <Animated.View style={[styles.cta, { backgroundColor: ctaBackground }]}>
            <Animated.Text style={[styles.ctaText, { color: ctaTextColor }]}>Agree & Continue</Animated.Text>
          </Animated.View>
        </TouchableOpacity>
        <Text style={styles.counterText}>{openedCount}/3 Terms read.</Text>
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
  counterText: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
