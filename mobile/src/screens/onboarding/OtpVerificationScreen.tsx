import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import OnboardingBanner from '../../components/onboarding/OnboardingBanner';
import OtpInput from '../../components/onboarding/OtpInput';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OtpVerification'>;

type Status = 'idle' | 'verifying' | 'verified' | 'error';

export default function OtpVerificationScreen({ navigation }: Props) {
  const { phoneNumber } = useOnboarding();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const isComplete = code.length === 6;

  // No real OTP backend exists for this dev flow — any 6-digit code
  // "verifies" after a short simulated delay, mirroring the prototype.
  // Signing in here (rather than at the end of onboarding) means every
  // screen from this point on has a real auth token, so steps like
  // AccountSelection can make real authed API calls (e.g. Google OAuth).
  const handleVerify = async () => {
    if (!isComplete || status !== 'idle') return;
    setStatus('verifying');
    setTimeout(async () => {
      try {
        await signIn(phoneNumber);
        setStatus('verified');
        setTimeout(() => navigation.navigate('Welcome'), 600);
      } catch (err) {
        setStatus('error');
        Alert.alert('Could not verify', err instanceof Error ? err.message : String(err));
      }
    }, 1200);
  };

  return (
    <View style={styles.container}>
      <OnboardingBanner />
      <StepHeader onBack={() => navigation.goBack()} overlay />

      <View style={styles.body}>
        <StepProgressBar step={1} />
        <Text style={styles.title}>Verify it's you.</Text>
        <Text style={styles.subtitle}>
          Code sent to <Text style={styles.subtitleBold}>{phoneNumber || 'your number'}</Text>
        </Text>

        <View style={styles.otpWrap}>
          <OtpInput value={code} onChange={setCode} disabled={status === 'verifying' || status === 'verified'} />
        </View>
        <Text style={styles.resend}>Resend code in 0:45</Text>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={[
            styles.cta,
            (!isComplete || status === 'verifying') && styles.ctaDisabled,
            status === 'verified' && styles.ctaVerified,
          ]}
          disabled={!isComplete || status === 'verifying' || status === 'verified'}
          onPress={handleVerify}
        >
          {status === 'verifying' ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.ctaText, !isComplete && styles.ctaTextDisabled]}>
              {status === 'verified' ? 'Verified' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.changeNumberButton} onPress={() => navigation.goBack()}>
          <Text style={styles.changeNumberText}>Change number</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, flex: 1 },
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  subtitleBold: { color: colors.textPrimary, fontWeight: '700' },
  otpWrap: { marginBottom: spacing.md },
  resend: { ...typography.caption, color: colors.textMuted },
  spacer: { flex: 1 },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: colors.textDisabled },
  ctaVerified: { backgroundColor: colors.success },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  ctaTextDisabled: { color: colors.white },
  changeNumberButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  changeNumberText: { ...typography.bodyBold, color: colors.textPrimary, fontSize: 16 },
});
