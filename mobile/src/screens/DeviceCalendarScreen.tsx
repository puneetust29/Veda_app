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
import type { DeviceCalendarEvent, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceCalendar'>;

// How far ahead to read. expo-calendar has no "upcoming" concept of its own --
// getEventsAsync needs an explicit window, and events don't need syncing once
// they're in the past anyway.
const LOOKAHEAD_DAYS = 180;

export default function DeviceCalendarScreen({ navigation }: Props) {
  const [permission, setPermission] = useState<Calendar.PermissionStatus | null>(null);
  const [events, setEvents] = useState<DeviceCalendarEvent[]>([]);
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
    setEvents(await readDeviceEvents());
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
        setEvents(await readDeviceEvents());
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
      const fresh = await readDeviceEvents();
      setEvents(fresh);
      // flights_only=true: unlike Google sync (which mirrors every event so the
      // list view stays useful), device calendars can include every personal and
      // work calendar on the phone, so only persisting detected flights keeps
      // calendar_events from filling up with noise the agents don't care about.
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
            Veda reads your device calendars (including Apple Calendar) locally to detect
            upcoming flights. Nothing leaves your phone except the flights Veda finds.
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
        <Text style={styles.statusLabel}>Device calendars connected</Text>
        <Text style={styles.statusDetail}>
          Reads Apple Calendar and any other calendar account synced to this device.
        </Text>
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
        ListHeaderComponent={<Text style={styles.sectionTitle}>On this device</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No upcoming events found.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title || '(no title)'}</Text>
            <Text style={styles.cardDate}>{new Date(item.start).toLocaleString()}</Text>
            {item.location ? <Text style={styles.cardSubtitle}>{item.location}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

// Reads every calendar the OS exposes (Apple Calendar plus any other account
// synced to the device) and flattens them into the shape the backend expects.
// Unlike Google, there's no per-calendar OAuth scope here -- once permission is
// granted, all local calendars are visible, so this always queries all of them
// rather than letting the user pick one.
async function readDeviceEvents(): Promise<DeviceCalendarEvent[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const now = new Date();
  const end = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const rawEvents = await Calendar.getEventsAsync(
    calendars.map((cal) => cal.id),
    now,
    end,
  );

  return rawEvents.map((event) => ({
    device_event_id: event.id,
    title: event.title ?? '',
    location: event.location ?? '',
    notes: event.notes ?? '',
    start: new Date(event.startDate).toISOString(),
    end: new Date(event.endDate).toISOString(),
  }));
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
