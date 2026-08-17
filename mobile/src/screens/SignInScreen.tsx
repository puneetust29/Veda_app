import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../context/AuthContext';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async () => {
    if (!phoneNumber.trim()) return;
    setSubmitting(true);
    try {
      await signIn(phoneNumber.trim());
    } catch (err) {
      Alert.alert('Could not sign in', err instanceof Error ? err.message : String(err));
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
        placeholder="+15550001111"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />

      <TouchableOpacity style={styles.button} disabled={submitting} onPress={handleSignIn}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </TouchableOpacity>
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
});
