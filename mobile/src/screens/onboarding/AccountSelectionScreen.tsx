import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { colors, fonts, radii, spacing, typography } from '../../theme';
import type { GoogleCalendarStatus, OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AccountSelection'>;

const RETURN_PATH = 'google-auth-complete';

// Unified Google OAuth connect: requests both Calendar and Gmail scopes
// in a single consent. One account, one connect flow, access to both
// services -- there's no per-service account picker here.
export default function AccountSelectionScreen({ navigation }: Props) {
  const { refreshCustomer } = useAuth();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const appGoogle = require('../../../assets/dashboard/app-google.png');

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
        <StepProgressBar step={4} totalSteps={5} />

        <Text style={styles.title}>Choose your accounts.</Text>
        <Text style={styles.subtitle}>
          {status?.connected
            ? 'Select one or more accounts for each connected app. You can change this later.'
            : "Connect the accounts you'd like Veda to use. You can change this later."}
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
              <Image source={appGoogle} style={{width: 18, height: 18}} />
              <Text style={styles.groupTitle}>Google Account</Text>
              <View style={styles.groupPill}>
                <Text style={styles.groupPillText}>Calendar + Gmail</Text>
              </View>
            </View>

            {status.connected ? (
              <View style={styles.accountRow}>
                <Text style={styles.accountEmail}>{status.google_account_email ?? 'Connected'}</Text>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={14} color="#111" />
                </View>
              </View>
            ) : (
              <Text style={styles.groupEmpty}>No account connected yet.</Text>
            )}

            {status.connected && (
              <>
                <View style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.serviceName}>Calendar</Text>
                  </View>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#111" />
                  </View>
                </View>
                <View style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.serviceName}>Gmail</Text>
                  </View>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#111" />
                  </View>
                </View>
              </>
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
                <ActivityIndicator color={status.connected ? '#f00405' : colors.white} />
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
        {status?.connected && <Text style={styles.selectionNote}>Select at least one account for each app.</Text>}
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
  title: { fontSize: 38, fontWeight: '600', fontFamily: fonts.semiBold, color: colors.textPrimary, marginBottom: spacing.sm, lineHeight: 46 },
  subtitle: { fontSize: 14, fontWeight: '300', fontFamily: fonts.bodyLight, color: '#6b7280', marginBottom: spacing.lg, lineHeight: 21 },
  loading: { marginTop: spacing.xxl },
  notice: { padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.warningTint, marginBottom: spacing.lg },
  noticeTitle: { ...typography.bodyBold, color: colors.warningText },
  noticeBody: { ...typography.caption, color: colors.warningText, marginTop: spacing.xs, lineHeight: 18 },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold, color: colors.textPrimary },
  groupPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
  },
  groupPillText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  groupEmpty: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  accountEmail: { fontSize: 16, fontWeight: '400', fontFamily: fonts.body, color: colors.textPrimary, flex: 1 },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  serviceName: { fontSize: 16, fontWeight: '400', fontFamily: fonts.body, color: colors.textPrimary },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#f00405',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningTint,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  scopeWarningText: { ...typography.caption, color: colors.warningText, flex: 1, lineHeight: 18 },
  connectButton: {
    backgroundColor: '#f00405',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  disconnectButton: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: '#f00405',
  },
  connectButtonDisabled: { opacity: 0.6 },
  connectButtonText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold, color: colors.white },
  disconnectButtonText: { color: '#f00405' },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  selectionNote: {
    fontSize: 14,
    fontWeight: '300',
    fontFamily: fonts.bodyLight,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  cta: {
    backgroundColor: '#f00405',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    elevation: 3,
    shadowColor: '#f00405',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '700', fontFamily: fonts.bold },
});
