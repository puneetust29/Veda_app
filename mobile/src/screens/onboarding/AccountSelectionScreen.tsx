import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StepHeader from '../../components/onboarding/StepHeader';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { colors, radii, spacing, typography } from '../../theme';
import type { GoogleCalendarStatus, OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AccountSelection'>;

const RETURN_PATH = 'google-auth-complete';

// Unified Google OAuth connect: requests both Calendar and Gmail scopes
// in a single consent. Users authenticate once instead of twice.
export default function AccountSelectionScreen({ navigation }: Props) {
  const { refreshCustomer } = useAuth();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus(await api.googleAuthStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => Alert.alert('Could not load account status', String(err)))
        .finally(() => setLoading(false));
    }, [load]),
  );

  const handleConnectGoogle = async () => {
    setBusy(true);
    try {
      const returnUrl = Linking.createURL(RETURN_PATH);
      const { authorization_url } = await api.startGoogleAuth(returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authorization_url, returnUrl);
      const next = await api.googleAuthStatus();
      setStatus(next);
      if (result.type === 'success' && next.connected) {
        await refreshCustomer().catch(() => {});

        // OAuth succeeded and credentials are stored, so scopes were granted
        // Mirror upcoming flights into Veda immediately
        try {
          await api.syncGoogleCalendar();
        } catch (err) {
          Alert.alert('Could not sync flights', err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      Alert.alert('Could not connect', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectGoogle = () => {
    Alert.alert(
      'Disconnect Google account?',
      'Veda will revoke access to Calendar and Gmail.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.disconnectGoogleAuth();
              await load();
            } catch (err) {
              Alert.alert('Could not disconnect', err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <Text style={styles.title}>Choose your accounts.</Text>
        <Text style={styles.subtitle}>
          Connect the accounts you'd like Veda to use. You can change this later.
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : !status?.configured ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Google isn't configured on the server</Text>
            <Text style={styles.noticeBody}>
              The backend is missing Google OAuth credentials, so this can't connect right now. You can
              still continue and connect it later from Settings.
            </Text>
          </View>
        ) : (
          <View style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.groupTitle}>Google Account</Text>
              <Text style={styles.groupSubtitle}>(Calendar + Gmail)</Text>
            </View>

            {status.connected ? (
              <View style={styles.accountRow}>
                <Text style={styles.accountEmail}>{status.google_account_email ?? 'Connected'}</Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
              </View>
            ) : (
              <Text style={styles.groupEmpty}>No account connected yet.</Text>
            )}

            {status.connected && (
              <View style={styles.servicesContainer}>
                <View style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.serviceName}>Calendar</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                </View>
                <View style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.serviceName}>Gmail</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.connectButton,
                status.connected && styles.disconnectButton,
                busy && styles.connectButtonDisabled,
              ]}
              disabled={busy}
              onPress={status.connected ? handleDisconnectGoogle : handleConnectGoogle}
            >
              {busy ? (
                <ActivityIndicator color={status.connected ? colors.brand : colors.white} />
              ) : (
                <Text style={[styles.connectButtonText, status.connected && styles.disconnectButtonText]}>
                  {status.connected ? 'Disconnect' : 'Connect Google'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Consent')}>
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, flex: 1 },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  loading: { marginTop: spacing.xxl },
  notice: { padding: spacing.lg, borderRadius: radii.md, backgroundColor: '#fff4e5', marginBottom: spacing.lg },
  noticeTitle: { ...typography.bodyBold, color: '#8a4b00' },
  noticeBody: { ...typography.caption, color: '#8a4b00', marginTop: spacing.xs, lineHeight: 18 },
  groupCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  groupTitle: { ...typography.bodyBold, color: colors.textPrimary },
  groupSubtitle: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  groupEmpty: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  accountEmail: { ...typography.body, color: colors.textPrimary, flex: 1 },
  servicesContainer: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  serviceName: { ...typography.body, color: colors.textPrimary },
  scopeWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#fff4e5',
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  scopeWarningText: { ...typography.caption, color: '#8a4b00', flex: 1, lineHeight: 18 },
  connectButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  connectButtonDisabled: { opacity: 0.6 },
  connectButtonText: { ...typography.bodyBold, color: colors.white },
  disconnectButtonText: { color: colors.brand },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
});
