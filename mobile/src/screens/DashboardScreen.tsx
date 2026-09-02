import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Calendar from 'expo-calendar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DropdownMenuItem } from '../components/common/DropdownMenu';
import DashboardLoadingSkeleton from '../components/common/ShimmerLoader';
import AskVedaButton from '../components/dashboard/AskVedaButton';
import AttentionCarousel from '../components/dashboard/AttentionCarousel';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import GreetingWeather from '../components/dashboard/GreetingWeather';
import SuggestionGrid, { type Suggestion } from '../components/dashboard/SuggestionGrid';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionInsurance } from '../context/SubscriptionInsuranceContext';
import { DEV_CATALOG_ENABLED } from '../dev/devFlags';
import { api } from '../lib/api';
import { readDeviceCalendarEvents } from '../lib/deviceCalendar';
import { FALLBACK_WEATHER, getDeviceWeatherSummary } from '../lib/weather';
import {
  tileBuildings,
  tileCalendar,
  tileEcommerce,
  tileFood,
  tileHealth,
  tileMap,
} from '../components/dashboard/figmaSvgs';
import { colors, fonts, spacing } from '../theme';
import type { CalendarEvent, RootStackParamList, WeatherSummary } from '../types';

const appGmail = require('../../assets/dashboard/app-gmail.png');
const appGcal = require('../../assets/dashboard/app-gcal.png');
const ellipse1 = require('../../assets/dashboard/ellipse-1.png');
const ellipse2 = require('../../assets/dashboard/ellipse-2.png');
const ellipse3 = require('../../assets/dashboard/ellipse-3.png');

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

// Used when location permission is denied or weather cannot be fetched.
const PLACEHOLDER_WEATHER = FALLBACK_WEATHER;

// Silently mirrors calendar sources into calendar_events before the
// dashboard reads them, so a returning user sees up-to-date flights without
// manual syncing. Deliberately non-blocking on failure (best-effort background
// refresh) and never prompts for anything the user hasn't already granted --
// it only acts on connections/permissions that already exist:
//   - Google Calendar: synced if customer completed OAuth consent
//   - Device Calendar: synced if permission is GRANTED
//   - Gmail flights: synced if customer connected Gmail (extracts flights from emails)
async function silentlySyncCalendars(): Promise<void> {
  await Promise.allSettled([
    (async () => {
      const status = await api.googleAuthStatus();
      if (status.configured && status.calendar_connected) {
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
    (async () => {
      try {
        await api.syncGmail();
      } catch (err) {
        console.warn('[Dashboard] Gmail sync failed', err);
      }
    })(),
  ]);
}

export default function DashboardScreen({ navigation }: Props) {
  const { customer, signOut } = useAuth();
  const { subscriptions, activeInsurance } = useSubscriptionInsurance();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weather, setWeather] = useState<WeatherSummary>(PLACEHOLDER_WEATHER);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadEvents = useCallback(async () => {
    const calendarEvents = await api.listCalendarEvents();
    setEvents(calendarEvents);
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
      if (events.length === 0) {
        setLoading(true);
        syncAndLoadEvents().finally(() => setLoading(false));
      } else {
        setSyncing(true);
        syncAndLoadEvents().finally(() => setSyncing(false));
      }

      // Set up 5-minute auto-sync timer
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
      }
      autoSyncIntervalRef.current = setInterval(() => {
        setSyncing(true);
        syncAndLoadEvents().finally(() => setSyncing(false));
      }, 5 * 60 * 1000); // 5 minutes

      return () => {
        if (autoSyncIntervalRef.current) {
          clearInterval(autoSyncIntervalRef.current);
          autoSyncIntervalRef.current = null;
        }
      };
    }, [syncAndLoadEvents, events.length]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncAndLoadEvents();
    setRefreshing(false);
  };

  const upcomingFlights = events
    .filter((event) => event.event_type === 'flight')
    .sort((a, b) => {
      const isLondon = (e: typeof a) =>
        (e.origin ?? '').toLowerCase().includes('london') ||
        (e.destination ?? '').toLowerCase().includes('london');
      return Number(isLondon(b)) - Number(isLondon(a));
    });
  console.log('[Dashboard] upcomingFlights order:', upcomingFlights.map((e, i) => `#${i+1} "${e.title}" origin=${e.origin} dest=${e.destination} start=${e.start_datetime} end=${e.end_datetime}`));
  const firstName = customer?.full_name?.split(' ')[0] ?? 'there';

  // "Connect apps" tiles are visual placeholders for integrations that
  // aren't wired up yet; the rest route into existing screens/nav entries.
  const suggestions: Suggestion[] = [
    { id: 'school-fees', iconXml: tileMap, label: 'Pay school fees' },
    { id: 'health-checkup', iconXml: tileHealth, label: 'Book annual health checkup' },
    { id: 'broadband', iconXml: tileBuildings, label: 'Renew home broadband' },
    {
      id: 'groceries',
      iconXml: tileEcommerce,
      label: 'Restock weekly groceries',
      connectAppIcons: [{ source: ellipse1 }, { source: ellipse2 }],
    },
    {
      id: 'meetings',
      iconXml: tileCalendar,
      label: "Plan next week's meetings",
      connectAppIcons: [
        { source: appGmail, inset: true },
        { source: appGcal, inset: true },
      ],
      onPress: () => navigation.navigate('DeviceCalendar'),
    },
    {
      id: 'food',
      iconXml: tileFood,
      label: 'Order food',
      connectAppIcons: [{ source: ellipse1 }, { source: ellipse3 }],
    },
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
    {
      id: 'gmail',
      icon: 'mail-outline',
      label: 'Gmail',
      onPress: () => navigation.navigate('Gmail'),
    },
    {
      id: 'contacts',
      icon: 'person-outline',
      label: 'Contacts',
      onPress: () => navigation.navigate('Contacts'),
    },
    ...(DEV_CATALOG_ENABLED
      ? [
          {
            id: 'dev-integrations',
            icon: 'flask-outline' as const,
            label: 'Integrations (Dev)',
            onPress: () => navigation.navigate('Dev'),
          },
        ]
      : []),
    { id: 'sign-out', icon: 'log-out-outline', label: 'Sign out', onPress: signOut, destructive: true },
  ];

  return (
    <View style={styles.container}>
      <DashboardHeader avatarInitial={firstName.charAt(0).toUpperCase()} menuItems={menuItems} />

      <View style={styles.sheet}>
        {loading && events.length === 0 ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <DashboardLoadingSkeleton />
          </ScrollView>
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
              activeRoamingEventIds={
                new Set(
                  (subscriptions ?? [])
                    .filter((sub) => sub.status === 'active')
                    .map((sub) => sub.calendar_event_id),
                )
              }
              activeInsuranceEventIds={
                new Set((activeInsurance?.purchases ?? []).map((p) => p.calendar_event_id))
              }
              onPressFlight={(event) => {
                const idx = upcomingFlights.findIndex((f) => f.id === event.id);
                console.log(`[Dashboard] opened card #${idx + 1} "${event.title}" origin=${event.origin} dest=${event.destination} start=${event.start_datetime}`);
                navigation.navigate('Chat', { event });
              }}
            />

            <SuggestionGrid suggestions={suggestions} />
          </ScrollView>
        )}

        <AskVedaButton onPress={() => navigation.navigate('VedaChat')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.headerGradientEnd },
  sheet: {
    flex: 1,
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  scrollContent: { paddingBottom: 96 },
  attentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xxl,
    marginTop: spacing.xxxl,
    marginBottom: spacing.xl,
  },
  attentionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  countBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 14,
    color: colors.textPrimary,
  },
});
