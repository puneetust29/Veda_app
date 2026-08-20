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

// Same return-path scheme used by the Google OAuth connect flow -- Linking
// createURL resolves to whatever the current runtime uses (exp:// under
// Expo Go, veda:// in a build).
const RETURN_PATH = 'google-calendar';

// The calendar.events scope Google must grant for sync to work. Google's
// consent screen can let a user grant only some of the requested scopes
// (e.g. just profile/email, not Calendar) -- when that happens the OAuth
// "succeeds" but every calendar API call 403s, so we check for this
// specifically rather than trusting `connected` alone.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function hasCalendarScope(status: GoogleCalendarStatus): boolean {
  return !!status.scope?.includes(CALENDAR_SCOPE);
}

// Real Google OAuth connect (api.startGoogleCalendarAuth +
// WebBrowser.openAuthSessionAsync), rather than a hardcoded list of fake
// accounts. This is separate from the flight-detection calendar screen,
// which reads calendars straight off the device via expo-calendar instead.
// Outlook has no backend integration yet, so it's shown as "Coming soon"
// instead of faking data for it too.
export default function AccountSelectionScreen({ navigation }: Props) {
  const { refreshCustomer } = useAuth();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus(await api.googleCalendarStatus());
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
      const { authorization_url } = await api.startGoogleCalendarAuth(returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authorization_url, returnUrl);
      const next = await api.googleCalendarStatus();
      setStatus(next);
      if (result.type === 'success' && next.connected) {
        // The connect may have filled in the customer's real name from their
        // Google profile (see backend _adopt_google_name) -- refetch so the
        // rest of onboarding (and the Dashboard greeting) reflects it.
        await refreshCustomer().catch(() => {});

        if (!hasCalendarScope(next)) {
          // Google let the user grant profile/email but not Calendar access
          // (its consent screen allows picking scopes individually) -- sync
          // would just 403, so say so plainly instead of silently showing
          // "No upcoming flights found" with no explanation.
          Alert.alert(
            'Calendar access not granted',
            "Google connected your account, but Calendar access wasn't granted, so Veda can't read your events yet. Disconnect and reconnect, making sure to allow Calendar access this time.",
          );
          return;
        }

        // Mirror upcoming flights into Veda immediately so the Dashboard
        // shows real travel events instead of "No upcoming flights found."
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
    Alert.alert('Disconnect Google account?', 'Veda will revoke its access at Google and forget your credentials.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.disconnectGoogleCalendar();
            await load();
          } catch (err) {
            Alert.alert('Could not disconnect', err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
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
              <Text style={styles.groupTitle}>Gmail</Text>
            </View>
            {status.connected ? (
              <View style={styles.accountRow}>
                <Text style={styles.accountEmail}>{status.google_account_email ?? 'Connected'}</Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
              </View>
            ) : (
              <Text style={styles.groupEmpty}>No account connected yet.</Text>
            )}
            {status.connected && !hasCalendarScope(status) ? (
              <View style={styles.scopeWarning}>
                <Ionicons name="warning-outline" size={16} color="#8a4b00" />
                <Text style={styles.scopeWarningText}>
                  Calendar access wasn't granted. Disconnect and reconnect, allowing Calendar this time,
                  to see your travel events.
                </Text>
              </View>
            ) : null}
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
                  {status.connected ? 'Disconnect' : 'Connect Gmail'}
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
  groupEmpty: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  accountEmail: { ...typography.body, color: colors.textPrimary, flex: 1 },
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
  // Outlined (not solid-red) so the "Disconnect" label stays legible --
  // reusing the solid brand-red button for both states previously put red
  // text on a red background, making the label invisible.
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
