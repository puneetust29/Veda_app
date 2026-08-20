import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import AnimatedToggle from '../../components/onboarding/AnimatedToggle';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding, type AppPermission } from '../../context/OnboardingContext';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AppPermissions'>;

const TIER_LABEL: Record<string, string> = {
  lite: 'Lite',
  balanced: 'Balanced',
  complete: 'Complete',
};

// Category order + real-ish app icon colors matching the Figma "Your X
// setup." screen. Toggling an app animates its own thumb slide + color.
export default function AppPermissionsScreen({ navigation }: Props) {
  const { apps, toggleApp, planTier } = useOnboarding();
  const categories: AppPermission['category'][] = ['Navigation', 'Communication', 'Health'];

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body}>
        <StepProgressBar step={3} />
        <Text style={styles.title}>Your {TIER_LABEL[planTier]} setup.</Text>
        <Text style={styles.subtitle}>I've picked these apps to help you get started. Change anything you'd like.</Text>

        {categories.map((category) => (
          <View key={category} style={styles.categoryBlock}>
            <Text style={styles.categoryTitle}>{category}</Text>
            {apps
              .filter((app) => app.category === category)
              .map((app: AppPermission) => (
                <View key={app.id} style={styles.appRow}>
                  <View style={styles.appLabel}>
                    <View style={[styles.appIconChip, { backgroundColor: app.color }]}>
                      <Ionicons name={app.icon as never} size={16} color={colors.white} />
                    </View>
                    <Text style={styles.appText}>{app.label}</Text>
                  </View>
                  <AnimatedToggle value={app.connected} onValueChange={() => toggleApp(app.id)} />
                </View>
              ))}
          </View>
        ))}

        <Text style={styles.footerNote}>You can change these anytime.</Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('AccountSelection')}>
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  categoryBlock: { marginBottom: spacing.lg },
  categoryTitle: { ...typography.bodyBold, color: colors.textPrimary, marginBottom: spacing.sm },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  appLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  appIconChip: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  appText: { ...typography.body, color: colors.textPrimary },
  footerNote: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
});
