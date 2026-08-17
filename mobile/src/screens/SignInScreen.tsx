import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../context/AuthContext';

export default function SignInScreen() {
  const { requestOtp, verifyOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSendOtp = async () => {
    if (!phoneNumber.trim()) return;
    setSubmitting(true);
    try {
      await requestOtp(phoneNumber.trim());
      setOtpSent(true);
    } catch (err) {
      Alert.alert('Could not send code', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) return;
    setSubmitting(true);
    try {
      await verifyOtp(phoneNumber.trim(), otp.trim());
    } catch (err) {
      Alert.alert('Invalid code', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in with your mobile number</Text>

      <TextInput
        style={styles.input}
        placeholder="+44 7xxx xxxxxx"
        keyboardType="phone-pad"
        autoComplete="tel"
        editable={!otpSent}
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />

      {otpSent && (
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          keyboardType="number-pad"
          value={otp}
          onChangeText={setOtp}
        />
      )}

      <TouchableOpacity
        style={styles.button}
        disabled={submitting}
        onPress={otpSent ? handleVerifyOtp : handleSendOtp}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{otpSent ? 'Verify code' : 'Send code'}</Text>
        )}
      </TouchableOpacity>

      {otpSent && (
        <TouchableOpacity onPress={() => setOtpSent(false)} disabled={submitting}>
          <Text style={styles.link}>Use a different number</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#666', textAlign: 'center', marginTop: 16 },
});
