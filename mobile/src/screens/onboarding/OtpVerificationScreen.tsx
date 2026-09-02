import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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

const RESEND_TIMEOUT = 45;

export default function OtpVerificationScreen({ navigation }: Props) {
  const { phoneNumber } = useOnboarding();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [resendTimer, setResendTimer] = useState(RESEND_TIMEOUT);
  const [canResend, setCanResend] = useState(false);
  const [otpResetKey, setOtpResetKey] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);

  const isComplete = code.length === 6;

  // How much of this screen the keyboard covers. Measured rather than taken from
  // the keyboard's own height so it stays correct whether or not the window
  // resizes for the keyboard (Android edge-to-edge, on by default in Expo 54,
  // means it does not) — if it does resize, screenHeight shrinks to the keyboard
  // top and this lands on 0 instead of double-shifting.
  const keyboardOverlap =
    keyboardTop === null || screenHeight === 0 ? 0 : Math.max(screenHeight - keyboardTop, 0);

  useEffect(() => {
    // The keyboard is usually already up when we land here (previous screen's
    // input, plus OtpInput autofocuses), so no show event ever fires for it.
    // Seed from the live metrics; this is what KeyboardAvoidingView cannot do.
    setKeyboardTop(Keyboard.metrics()?.screenY ?? null);

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subscriptions = [
      Keyboard.addListener(showEvent, (event) => setKeyboardTop(event.endCoordinates.screenY)),
      Keyboard.addListener(hideEvent, () => setKeyboardTop(null)),
    ];

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendTimer]);

  useEffect(() => {
    if (code.length === 6 && status === 'idle') {
      handleVerify();
    }
  }, [code]);

  const handleCodeChange = (newCode: string) => {
    if (status === 'verifying' || status === 'verified') return;
    setCode(newCode);
    if (status === 'error') {
      setStatus('idle');
    }
  };

  const handleResendCode = () => {
    if (!canResend) return;
    setResendTimer(RESEND_TIMEOUT);
    setCanResend(false);
    setCode('');
    setOtpResetKey((prev) => prev + 1);
    Alert.alert('Code sent', `New OTP sent to ${phoneNumber}`);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleVerify = async () => {
    if (!isComplete || status !== 'idle') return;
    setStatus('verifying');
    setTimeout(async () => {
      try {
        await signIn(phoneNumber, code);
        setStatus('verified');
        setTimeout(() => navigation.navigate('Welcome'), 600);
      } catch (err) {
        setStatus('error');
        setCode('');
        setOtpResetKey((prev) => prev + 1);
        const errorMsg = err instanceof Error ? err.message : String(err);
        const userFriendlyMsg = errorMsg.includes('Invalid OTP')
          ? 'Incorrect code. Please try again.'
          : 'Unable to verify. Please try again.';
        Alert.alert('Verification failed', userFriendlyMsg);
      }
    }, 1200);
  };

  return (
    <View
      style={styles.container}
      onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
    >
      <OnboardingBanner />
      <StepHeader onBack={() => navigation.goBack()} overlay />

      <View style={[styles.body, { paddingBottom: keyboardOverlap }]}>
        <StepProgressBar step={1} totalSteps={5}/>
        <Text style={styles.title}>Verify it's you.</Text>
        <Text style={styles.subtitle}>
          Code sent to <Text style={styles.subtitleBold}>{phoneNumber || 'your number'}</Text>
        </Text>

        <View style={styles.otpWrap}>
          <OtpInput
            key={otpResetKey}
            value={code}
            onChange={handleCodeChange}
            disabled={status === 'verifying' || status === 'verified'}
            variant={status === 'verified' ? 'success' : 'default'}
          />
        </View>
        <TouchableOpacity
          onPress={handleResendCode}
          disabled={!canResend}
          style={styles.resendButton}
        >
          <Text style={[styles.resend, !canResend && styles.resendDisabled]}>
            {canResend ? 'Resend code' : `Resend code in ${formatTime(resendTimer)}`}
          </Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={[
            styles.cta,
            !isComplete && status !== 'verified' && styles.ctaDisabled,
            status === 'error' && styles.ctaError,
          ]}
          disabled={!isComplete && status !== 'verified'}
          onPress={status === 'verified' ? () => navigation.navigate('Welcome') : handleVerify}
        >
          <Text style={[styles.ctaText, !isComplete && styles.ctaTextDisabled]}>
            {status === 'verifying' ? 'Verifying' : status === 'verified' ? 'Verified' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1},
  body: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, flex: 1, backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden', position: 'relative', marginTop: -35,  },
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  subtitleBold: { color: colors.textPrimary, fontWeight: '700' },
  otpWrap: { marginBottom: spacing.md },
  resendButton: { paddingVertical: spacing.sm },
  resend: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  resendDisabled: { color: colors.textMuted, fontWeight: '400' },
  spacer: { flex: 1 },
  cta: {
    backgroundColor: colors.brandBackGround,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: colors.textDisabled },
  ctaError: { backgroundColor: colors.brandBackGround },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
  ctaTextDisabled: { color: colors.white },
});
