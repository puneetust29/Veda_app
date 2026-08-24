import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Calendar from 'expo-calendar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DropdownMenuItem } from '../components/common/DropdownMenu';
import AskVedaButton from '../components/dashboard/AskVedaButton';
import AskVedaModal from '../components/dashboard/AskVedaModal';
import VedaChatScreen from '../components/chat/VedaChatScreen';
import TravelRecommendationFlow from '../components/recommendations/TravelRecommendationFlow';
import AttentionCarousel from '../components/dashboard/AttentionCarousel';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import GreetingWeather from '../components/dashboard/GreetingWeather';
import SuggestionGrid, { type Suggestion } from '../components/dashboard/SuggestionGrid';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { readDeviceCalendarEvents } from '../lib/deviceCalendar';
import { FALLBACK_WEATHER, getDeviceWeatherSummary } from '../lib/weather';
import { colors, spacing, typography } from '../theme';
import type { CalendarEvent, RootStackParamList, WeatherSummary } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

// Used when location permission is denied or weather cannot be fetched.
const PLACEHOLDER_WEATHER = FALLBACK_WEATHER;

// Silently mirrors both calendar sources into calendar_events before the
// dashboard reads them, so a returning user sees up-to-date flights without
// an extra "sync" tap on the Calendars screen. Deliberately non-blocking on
// failure (best-effort background refresh) and never prompts for anything
// the user hasn't already granted -- it only acts on connections/permissions
// that already exist:
//   - Google: only synced if the customer already completed OAuth consent
//     (status.connected), so this never triggers a browser popup.
//   - Device: only read if calendar permission is already GRANTED, so this
//     never triggers the OS permission dialog on a fresh install.
async function silentlySyncCalendars(): Promise<void> {
  await Promise.allSettled([
    (async () => {
      const status = await api.googleCalendarStatus();
      if (status.configured && status.connected) {
        await api.syncGoogleCalendar();
      }
    })(),
    (async () => {
      const { status } = await Calendar.getCalendarPermissionsAsync();
      if (status === Calendar.PermissionStatus.GRANTED) {
        const events = await readDeviceCalendarEvents();
        await api.syncDeviceCalendar(events, true);
      }
    })(),
  ]);
}

export default function DashboardScreen({ navigation }: Props) {
  const { customer, signOut } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weather, setWeather] = useState<WeatherSummary>(PLACEHOLDER_WEATHER);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vedaModalVisible, setVedaModalVisible] = useState(false);
  const [vedaChatVisible, setVedaChatVisible] = useState(false);
  const [selectedFlightEvent, setSelectedFlightEvent] = useState<CalendarEvent | null>(null);

  const loadEvents = useCallback(async () => {
    const data = await api.listCalendarEvents();
    setEvents(data);
  }, []);

  const loadWeather = useCallback(async () => {
    try {
      setWeather(await getDeviceWeatherSummary());
    } catch (err) {
      console.warn('[Dashboard] weather fetch failed', err);
      setWeather(PLACEHOLDER_WEATHER);
    }
  }, []);


  const syncAndLoadEvents = useCallback(async () => {
    // Best-effort: a sync failure (offline, expired Google token, etc.)
    // shouldn't block showing whatever calendar_events already has.
    await Promise.allSettled([
      (async () => {
        await silentlySyncCalendars().catch((err) =>
          console.warn('[Dashboard] background calendar sync failed', err),
        );
        await loadEvents();
      })(),
      loadWeather(),
    ]);
  }, [loadEvents, loadWeather]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      syncAndLoadEvents().finally(() => setLoading(false));
    }, [syncAndLoadEvents]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncAndLoadEvents();
    setRefreshing(false);
  };

  const upcomingFlights = events.filter((event) => event.event_type === 'flight');
  const firstName = customer?.full_name?.split(' ')[0] ?? 'there';

  // "Connect apps" tiles are visual placeholders for integrations that
  // aren't wired up yet; the rest route into existing screens/nav entries.
  const suggestions: Suggestion[] = [
    { id: 'school-fees', icon: 'school-outline', label: 'Pay school fees' },
    { id: 'health-checkup', icon: 'medkit-outline', label: 'Book annual health checkup' },
    { id: 'broadband', icon: 'home-outline', label: 'Renew home broadband' },
    { id: 'groceries', icon: 'cart-outline', label: 'Restock weekly groceries', connectApps: true },
    {
      id: 'meetings',
      icon: 'calendar-outline',
      label: "Plan next week's meetings",
      connectApps: true,
      onPress: () => navigation.navigate('DeviceCalendar'),
    },
    { id: 'food', icon: 'fast-food-outline', label: 'Order food', connectApps: true },
  ];

  // No dedicated profile/settings screen exists in the Figma design yet, so
  // these account-level actions live in the header's avatar dropdown.
  const menuItems: DropdownMenuItem[] = [
    { id: 'all-plans', icon: 'list-outline', label: 'All plans', onPress: () => navigation.navigate('RoamingPlans') },
    { id: 'my-plans', icon: 'card-outline', label: 'My plans', onPress: () => navigation.navigate('Subscriptions') },
    {
      id: 'device-calendar',
      icon: 'calendar-outline',
      label: 'Calendars',
      onPress: () => navigation.navigate('DeviceCalendar'),
    },
    { id: 'sign-out', icon: 'log-out-outline', label: 'Sign out', onPress: signOut, destructive: true },
  ];

  if (selectedFlightEvent) {
    return <TravelRecommendationFlow event={selectedFlightEvent} onClose={() => setSelectedFlightEvent(null)} />;
  }

  if (vedaChatVisible) {
    return <VedaChatScreen onClose={() => setVedaChatVisible(false)} />;
  }

  return (
    <View style={styles.container}>
      <DashboardHeader avatarInitial={firstName.charAt(0).toUpperCase()} menuItems={menuItems} />

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <GreetingWeather name={firstName} weather={weather} />

          <View style={styles.attentionHeader}>
            <Text style={styles.attentionTitle}>What needs your attention</Text>
            {upcomingFlights.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{upcomingFlights.length}</Text>
              </View>
            ) : null}
          </View>

          <AttentionCarousel
            flights={upcomingFlights}
            onPressFlight={(event) => setSelectedFlightEvent(event)}
          />

          <SuggestionGrid suggestions={suggestions} />
        </ScrollView>
      )}

      <AskVedaButton onPress={() => setVedaModalVisible(true)} />
      <AskVedaModal
        visible={vedaModalVisible}
        onClose={() => setVedaModalVisible(false)}
        onStartChat={(message) => {
          setVedaChatVisible(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: spacing.xxxl },
  scrollContent: { paddingBottom: spacing.xl },
  attentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  attentionTitle: { ...typography.sectionTitle, color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.brandTint,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: { ...typography.small, color: colors.brand },
});
