import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList, PlanTier } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'PlanSelection'>;

type TierConfig = {
  id: PlanTier;
  label: string;
  hero: string;
  heroSubtitle: string;
  caption: string;
  prompts: string[];
};

const TIERS: TierConfig[] = [
  {
    id: 'lite',
    label: 'Lite',
    hero: 'Shopping, Sorted',
    heroSubtitle: 'Never miss what matters.',
    caption: 'Start with the essentials.',
    prompts: [
      "What's next on my calendar?",
      '"Leave in 10 minutes"',
      'Find a nearby cafe',
      'Help me plan tomorrow',
      'Call a contact',
    ],
  },
  {
    id: 'balanced',
    label: 'Balanced',
    hero: 'Everyday, Handled',
    heroSubtitle: 'A bit of everything that matters.',
    caption: 'Covers work, home and family.',
    prompts: [
      'Reschedule my 3pm',
      '"Traffic is heavy, leave now"',
      'Recharge the family plan',
      'Order groceries',
      'Book a table for two',
    ],
  },
  {
    id: 'complete',
    label: 'Complete',
    hero: 'Fully Connected',
    heroSubtitle: 'Everything, understood.',
    caption: 'Full context across your digital life.',
    prompts: [
      'Summarise my week',
      '"Flight delayed, notify family"',
      'Track my spending',
      'Plan a weekend trip',
      'Check device health',
    ],
  },
];

// Three ring icons orbiting a center heart — a simplified, screen-specific
// echo of the landing page's FloatingIcons treatment, matching the
// "Shopping, Sorted" hero art in the Figma reference.
function TierHero({ tier, topInset }: { tier: TierConfig; topInset: number }) {
  return (
    <View style={[styles.hero, { marginTop: topInset + spacing.lg }]}>
      {/* Ring + icon bubbles live in their own fixed-height area so they
          occupy real layout space — previously they were purely
          absolutely-positioned with no flow height, so the title text
          right after them rendered at the very top of `hero` and
          overlapped the icons instead of sitting below them. */}
      <View style={styles.ringArea}>
        <View style={styles.heroRing} />
        <View style={[styles.heroBubble, styles.heroBubbleLeft]}>
          <Ionicons name="medical-outline" size={20} color={colors.brand} />
        </View>
        <View style={[styles.heroBubble, styles.heroBubbleCenter]}>
          <Ionicons name="heart" size={24} color={colors.white} />
        </View>
        <View style={[styles.heroBubble, styles.heroBubbleRight]}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} />
        </View>
      </View>
      <Text style={styles.heroTitle}>{tier.hero}</Text>
      <Text style={styles.heroSubtitle}>{tier.heroSubtitle}</Text>
    </View>
  );
}

export default function PlanSelectionScreen({ navigation }: Props) {
  const { planTier, setPlanTier } = useOnboarding();
  const fade = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const selectTier = (tier: PlanTier) => {
    if (tier === planTier) return;
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setPlanTier(tier);
  };

  const current = TIERS.find((t) => t.id === planTier) ?? TIERS[0];

  return (
    <View style={styles.container}>
      <View style={styles.heroBanner}>
        <StepHeader onBack={() => navigation.goBack()} overlay />
        <TierHero tier={current} topInset={insets.top} />
      </View>

      <View style={styles.body}>
        <StepProgressBar step={2} />
        <Text style={styles.title}>Make Veda yours.</Text>
        <Text style={styles.subtitle}>Choose how much of your digital world you'd like me to understand.</Text>

        <View style={styles.tierChips}>
          {TIERS.map((tier) => (
            <TouchableOpacity
              key={tier.id}
              style={[styles.chip, tier.id === planTier && styles.chipActive]}
              onPress={() => selectTier(tier.id)}
            >
              <Text style={[styles.chipText, tier.id === planTier && styles.chipTextActive]}>{tier.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View style={[styles.card, { opacity: fade }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="layers-outline" size={18} color={colors.white} />
            <Text style={styles.cardHeaderText}>{current.label}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardCaption}>{current.caption}</Text>
            <View style={styles.promptWrap}>
              {current.prompts.map((prompt) => (
                <View key={prompt} style={styles.promptPill}>
                  <Text style={styles.promptText}>{prompt}</Text>
                </View>
              ))}
            </View>
            <View style={styles.appsRow}>
              {['logo-google', 'logo-whatsapp', 'mail-outline'].map((icon) => (
                <View key={icon} style={styles.appAvatar}>
                  <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.textSecondary} />
                </View>
              ))}
              <View style={styles.appAvatarMore}>
                <Text style={styles.appAvatarMoreText}>+5</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('AppPermissions')}>
          <Text style={styles.ctaText}>Select & Continue</Text>
        </TouchableOpacity>
        {/* Skip bypasses app/account setup entirely and goes straight to the
            consent step, matching the prototype's "Skip for now" behavior. */}
        <TouchableOpacity style={styles.skipButton} onPress={() => navigation.navigate('Consent')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heroBanner: {
    backgroundColor: colors.brand,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: spacing.xxl,
    overflow: 'visible',
    position: 'relative',
  },
  hero: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  ringArea: {
    width: '100%',
    height: 200,
    alignItems: 'center',
  },
  heroRing: {
    position: 'absolute',
    top: 20,
    left: '50%',
    marginLeft: -80,
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroBubble: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  heroBubbleLeft: { top: 60, left: 72, backgroundColor: colors.white },
  heroBubbleCenter: { top: 24, left: '50%', marginLeft: -24, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroBubbleRight: { top: 60, right: 72, backgroundColor: colors.white },
  heroTitle: { ...typography.title, color: colors.white, textAlign: 'center' },
  heroSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm, textAlign: 'center' },
  body: { paddingHorizontal: spacing.xl, flex: 1, paddingTop: spacing.lg },
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  tierChips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardHeaderText: { ...typography.bodyBold, color: colors.white },
  cardBody: { backgroundColor: colors.brandTint, padding: spacing.lg },
  cardCaption: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.md },
  promptWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  promptPill: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  promptText: { ...typography.small, color: colors.textPrimary, fontWeight: '400' },
  appsRow: { flexDirection: 'row', gap: spacing.sm },
  appAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appAvatarMore: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appAvatarMoreText: { ...typography.small, color: colors.textSecondary },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  skipButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  skipText: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 16 },
});
