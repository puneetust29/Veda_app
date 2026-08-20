import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Calendar from 'expo-calendar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../lib/api';
import { countDeviceEventsBySource, readDeviceCalendarEvents } from '../lib/deviceCalendar';
import { colors, radii, spacing, typography } from '../theme';
import type { DeviceCalendarEvent, DeviceCalendarSource, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceCalendar'>;

const SOURCE_LABELS: Record<DeviceCalendarSource, string> = {
  google: 'Google',
  apple: 'Apple',
  other: 'Other',
};

const SOURCE_COLORS: Record<DeviceCalendarSource, string> = {
  google: '#1a73e8',
  apple: colors.textSecondary,
  other: colors.textMuted,
};

// This screen is the single source of truth for "flights from my calendars":
// expo-calendar's getCalendarsAsync/getEventsAsync already merge every account
// the OS has synced onto the device -- Apple Calendar plus, if the user added
// them under Settings > Calendar, Google, Outlook, Yahoo, etc. -- into one
// flat event list. There is no separate Google OAuth flow in this app; if a
// user wants their Google events here, they add the Google account at the OS
// level and iOS/Android mirrors it into the calendar database this screen
// reads, same as Apple Calendar.
export default function DeviceCalendarScreen({ navigation }: Props) {
  const [permission, setPermission] = useState<Calendar.PermissionStatus | null>(null);
  const [events, setEvents] = useState<DeviceCalendarEvent[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<DeviceCalendarSource, number>>({
    google: 0,
    apple: 0,
    other: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    setPermission(status);
    if (status !== Calendar.PermissionStatus.GRANTED) {
      setEvents([]);
      return;
    }
    const fresh = await readDeviceCalendarEvents();
    setEvents(fresh);
    setSourceCounts(countDeviceEventsBySource(fresh));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch((err) => Alert.alert('Could not read device calendars', String(err)))
        .finally(() => setLoading(false));
    }, [load]),
  );

  const handleRequestPermission = async () => {
    setBusy(true);
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      setPermission(status);
      if (status === Calendar.PermissionStatus.GRANTED) {
        const fresh = await readDeviceCalendarEvents();
        setEvents(fresh);
        setSourceCounts(countDeviceEventsBySource(fresh));
      }
    } catch (err) {
      Alert.alert('Could not request permission', String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const fresh = await readDeviceCalendarEvents();
      setEvents(fresh);
      setSourceCounts(countDeviceEventsBySource(fresh));
      // flights_only=true: calendars on-device can include every personal and
      // work calendar synced to the phone, so only persisting detected
      // flights keeps calendar_events from filling up with noise the agents
      // don't care about. This one call persists flights found in Apple
      // Calendar and any other synced account (Google included) together --
      // there's no separate per-provider sync anymore.
      const result = await api.syncDeviceCalendar(fresh, true);
      setLastSyncSummary(
        `Read ${result.fetched} event(s), found ${result.synced} flight(s).` +
          (result.skipped_non_flight > 0
            ? ` Skipped ${result.skipped_non_flight} non-flight event(s).`
            : ''),
      );
    } catch (err) {
      Alert.alert('Sync failed', String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loading} />;
  }

  if (permission !== Calendar.PermissionStatus.GRANTED) {
    return (
      <View style={styles.container}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Calendar access needed</Text>
          <Text style={styles.noticeBody}>
            Veda reads your device calendars locally to detect upcoming flights -- Apple
            Calendar, plus Google, Outlook or any other calendar account you've added in
            Settings. Nothing leaves your phone except the flights Veda finds.
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={handleRequestPermission}
          >
            <Text style={styles.buttonText}>Grant calendar access</Text>
          </TouchableOpacity>
          {busy ? <ActivityIndicator /> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Calendars connected</Text>
        <Text style={styles.statusDetail}>
          Merging events from every calendar synced to this device.
        </Text>
        <View style={styles.sourceBadgeRow}>
          {(Object.keys(SOURCE_LABELS) as DeviceCalendarSource[])
            .filter((source) => sourceCounts[source] > 0)
            .map((source) => (
              <View key={source} style={[styles.sourceBadge, { borderColor: SOURCE_COLORS[source] }]}>
                <View style={[styles.sourceDot, { backgroundColor: SOURCE_COLORS[source] }]} />
                <Text style={[styles.sourceBadgeText, { color: SOURCE_COLORS[source] }]}>
                  {SOURCE_LABELS[source]} · {sourceCounts[source]}
                </Text>
              </View>
            ))}
        </View>
        {lastSyncSummary ? <Text style={styles.statusDetail}>{lastSyncSummary}</Text> : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={handleSync}
        >
          <Text style={styles.buttonText}>Sync flights into Veda</Text>
        </TouchableOpacity>
        {busy ? <ActivityIndicator /> : null}
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.device_event_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionTitle}>Upcoming events</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No upcoming events found.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title || '(no title)'}
              </Text>
              <View style={[styles.sourcePill, { backgroundColor: SOURCE_COLORS[item.source] }]}>
                <Text style={styles.sourcePillText}>{SOURCE_LABELS[item.source]}</Text>
              </View>
            </View>
            <Text style={styles.cardDate}>{new Date(item.start).toLocaleString()}</Text>
            {item.location ? <Text style={styles.cardSubtitle}>{item.location}</Text> : null}
            <Text style={styles.cardCalendarName}>{item.calendarTitle}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: 40 },
  notice: { margin: spacing.xl, padding: spacing.lg, borderRadius: radii.md, backgroundColor: '#fff4e5' },
  noticeTitle: { ...typography.bodyBold, color: '#8a4b00' },
  noticeBody: { color: '#8a4b00', marginTop: spacing.sm, lineHeight: 20 },
  statusCard: {
    margin: spacing.xl,
    marginBottom: 0,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusLabel: { ...typography.bodyBold, fontSize: 17, color: colors.textPrimary },
  statusDetail: { color: colors.textSecondary, marginTop: spacing.xs },
  sourceBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sourceDot: { width: 6, height: 6, borderRadius: 3 },
  sourceBadgeText: { ...typography.small, fontWeight: '600' },
  actions: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md, alignItems: 'flex-start' },
  button: { backgroundColor: colors.brand, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  sectionTitle: { ...typography.bodyBold, fontSize: 15, marginBottom: spacing.md, color: colors.textPrimary },
  list: { padding: spacing.xl },
  empty: { color: colors.textMuted, marginTop: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  sourcePill: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  sourcePillText: { ...typography.small, color: colors.white, fontWeight: '700' },
  cardSubtitle: { color: colors.textSecondary, marginTop: spacing.xs },
  cardDate: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 13 },
  cardCalendarName: { color: colors.textDisabled, marginTop: spacing.xs, fontSize: 12 },
});
