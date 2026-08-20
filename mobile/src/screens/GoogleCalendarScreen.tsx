import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../lib/api';
import type { GoogleCalendarEvent, GoogleCalendarStatus, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'GoogleCalendar'>;

// Path segment the backend callback page bounces back to. Linking.createURL turns
// this into whatever the current runtime uses -- exp://127.0.0.1:8081/--/google-calendar
// under Expo Go, veda://google-calendar in a dev or standalone build -- which is
// why the return URL is computed here and sent to the backend rather than
// hardcoded on either side.
const RETURN_PATH = 'google-calendar';

export default function GoogleCalendarScreen({ navigation }: Props) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await api.googleCalendarStatus();
    setStatus(next);
    // Only a connected customer has events to read; asking otherwise just earns a 409.
    // flights_only=true so this preview matches what "Sync into Veda" persists.
    setEvents(next.connected ? await api.listGoogleCalendarEvents(20, true) : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => Alert.alert('Could not load Google Calendar', String(err)))
        .finally(() => setLoading(false));
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      Alert.alert('Could not load Google Calendar', String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    try {
      const returnUrl = Linking.createURL(RETURN_PATH);
      const { authorization_url } = await api.startGoogleCalendarAuth(returnUrl);

      // openAuthSessionAsync, not openBrowserAsync: it keeps the consent page in a
      // system auth session (SFAuthenticationSession / Custom Tab) and resolves as
      // soon as the callback redirects to returnUrl. It also resolves with
      // type 'cancel'/'dismiss' if the user backs out or closes the tab manually,
      // so re-reading status afterwards covers every exit path -- including the
      // browsers that refuse a scripted jump to a custom scheme.
      await WebBrowser.openAuthSessionAsync(authorization_url, returnUrl);
      await load();
    } catch (err) {
      Alert.alert('Could not connect', String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Google Calendar?',
      'Veda will revoke its access at Google and forget your credentials.',
      [
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
              Alert.alert('Could not disconnect', String(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const result = await api.syncGoogleCalendar();
      Alert.alert(
        'Sync complete',
        `Found ${result.synced} flight(s) out of ${result.fetched} event(s) checked.` +
          (result.skipped_non_flight > 0
            ? `\n\nSkipped ${result.skipped_non_flight} non-flight event(s).`
            : '') +
          (result.skipped_all_day > 0
            ? `\n\nSkipped ${result.skipped_all_day} all-day event(s) — they have no start time.`
            : ''),
      );
      await load();
    } catch (err) {
      Alert.alert('Sync failed', String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loading} />;
  }

  // The backend has no GOOGLE_CLIENT_ID/SECRET, so every route here 503s. Say so
  // plainly instead of letting the user tap Connect into a failure.
  if (!status?.configured) {
    return (
      <View style={styles.container}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Not configured on the server</Text>
          <Text style={styles.noticeBody}>
            The backend is missing GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, so Google Calendar
            is unavailable. Everything else in Veda still works.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>{status.connected ? 'Connected' : 'Not connected'}</Text>
        {status.connected ? (
          <Text style={styles.statusDetail}>
            {status.google_account_email ?? 'Google account linked'}
          </Text>
        ) : (
          <Text style={styles.statusDetail}>
            Link your Google Calendar so Veda sees your real trips.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {status.connected ? (
          <>
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={handleSync}
            >
              <Text style={styles.buttonText}>Sync into Veda</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busy}
              onPress={handleDisconnect}
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <Text style={[styles.destructive, busy && styles.textDisabled]}>Disconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={handleConnect}
          >
            <Text style={styles.buttonText}>Connect Google Calendar</Text>
          </TouchableOpacity>
        )}
        {busy ? <ActivityIndicator /> : null}
      </View>

      {status.connected ? (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListHeaderComponent={<Text style={styles.sectionTitle}>Upcoming flights in Google</Text>}
          ListEmptyComponent={<Text style={styles.empty}>No upcoming flights found.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.summary ?? '(no title)'}</Text>
              <Text style={styles.cardDate}>{formatWhen(item)}</Text>
              {item.location ? <Text style={styles.cardSubtitle}>{item.location}</Text> : null}
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

// All-day events carry `date` rather than `dateTime` -- the same distinction that
// makes the backend skip them on sync, surfaced here so the list matches reality.
function formatWhen(event: GoogleCalendarEvent): string {
  const start = event.start?.dateTime;
  if (start) {
    return new Date(start).toLocaleString();
  }
  return event.start?.date ? `${event.start.date} · all day (not synced)` : 'No start time';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { marginTop: 40 },
  notice: { margin: 20, padding: 16, borderRadius: 12, backgroundColor: '#fff4e5' },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: '#8a4b00' },
  noticeBody: { color: '#8a4b00', marginTop: 6, lineHeight: 20 },
  statusCard: {
    margin: 20,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statusLabel: { fontSize: 17, fontWeight: '700' },
  statusDetail: { color: '#444', marginTop: 4 },
  actions: { paddingHorizontal: 20, paddingTop: 16, gap: 12, alignItems: 'flex-start' },
  button: { backgroundColor: '#0a66c2', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  destructive: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
  textDisabled: { opacity: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, color: '#333' },
  list: { padding: 20 },
  empty: { color: '#666', marginTop: 8 },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { color: '#444', marginTop: 4 },
  cardDate: { color: '#888', marginTop: 4, fontSize: 13 },
});
