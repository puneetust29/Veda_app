import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Calendar from 'expo-calendar';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import AnimatedToggle from '../../components/onboarding/AnimatedToggle';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding } from '../../context/OnboardingContext';
import { api } from '../../lib/api';
import { readDeviceCalendarEvents } from '../../lib/deviceCalendar';
import { brandIcons, colors, radii, spacing, typography, withOpacity } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AppPermissions'>;

const TIER_LABEL: Record<string, string> = {
  lite: 'Essential Access',
  balanced: 'Everyday Access',
  complete: 'Complete Access',
};

// --------------------------------------------------
// COSMETIC APP CATEGORIES — local-state toggles only (no OS permission,
// no backend call). Real device permissions (Calendar, Location) are
// handled separately below, since those need individual OS-prompt
// flows and shouldn't be bulk-toggled by "Connect all" or a category
// "Select all" without explicit per-item user intent.
// --------------------------------------------------

type AppItem = {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
};

type CategorySpec = {
  id: string;
  title: string;
  apps: AppItem[];
};

const CATEGORIES_BY_TIER: Record<string, CategorySpec[]> = {
  lite: [
    {
      id: 'navigation',
      title: 'Navigation',
      apps: [
        { id: 'google-maps', name: 'Google Maps', icon: 'location', iconColor: brandIcons.googleBlue },
        { id: 'find-my', name: 'Find My', icon: 'navigate', iconColor: brandIcons.googleGreen },
        { id: 'waze', name: 'Waze', icon: 'compass', iconColor: brandIcons.googleBlue },
      ],
    },
    {
      id: 'communication',
      title: 'Communication',
      apps: [
        { id: 'whatsapp', name: 'WhatsApp', icon: 'logo-whatsapp', iconColor: brandIcons.whatsappGreen },
        { id: 'messages', name: 'Messages', icon: 'chatbubble', iconColor: brandIcons.googleBlue },
        { id: 'linkedin', name: 'LinkedIn', icon: 'logo-linkedin', iconColor: brandIcons.linkedinBlue },
        { id: 'contacts', name: 'Contacts', icon: 'person', iconColor: brandIcons.googleBlue },
        { id: 'gmail', name: 'Gmail', icon: 'mail', iconColor: brandIcons.gmailRed },
      ],
    },
    {
      id: 'health',
      title: 'Health',
      apps: [{ id: 'health-app', name: 'Health', icon: 'heart', iconColor: brandIcons.healthSlate }],
    },
  ],
  balanced: [
    {
      id: 'navigation',
      title: 'Navigation',
      apps: [
        { id: 'google-maps', name: 'Google Maps', icon: 'location', iconColor: brandIcons.googleBlue },
        { id: 'find-my', name: 'Find My', icon: 'navigate', iconColor: brandIcons.googleGreen },
        { id: 'waze', name: 'Waze', icon: 'compass', iconColor: brandIcons.googleBlue },
      ],
    },
    {
      id: 'communication',
      title: 'Communication',
      apps: [
        { id: 'whatsapp', name: 'WhatsApp', icon: 'logo-whatsapp', iconColor: brandIcons.whatsappGreen },
        { id: 'messages', name: 'Messages', icon: 'chatbubble', iconColor: brandIcons.googleBlue },
        { id: 'linkedin', name: 'LinkedIn', icon: 'logo-linkedin', iconColor: brandIcons.linkedinBlue },
        { id: 'contacts', name: 'Contacts', icon: 'person', iconColor: brandIcons.googleBlue },
        { id: 'gmail', name: 'Gmail', icon: 'mail', iconColor: brandIcons.gmailRed },
      ],
    },
    {
      id: 'health',
      title: 'Health',
      apps: [{ id: 'health-app', name: 'Health', icon: 'heart', iconColor: brandIcons.healthSlate }],
    },
    {
      id: 'travel',
      title: 'Travel',
      apps: [
        { id: 'uber', name: 'Uber', icon: 'car-outline', iconColor: colors.black },
        { id: 'airlines', name: 'Airlines', icon: 'airplane-outline', iconColor: brandIcons.googleBlue },
        { id: 'train', name: 'Train', icon: 'train-outline', iconColor: brandIcons.travelOrange },
      ],
    },
    {
      id: 'entertainment',
      title: 'Entertainment',
      apps: [
        { id: 'spotify', name: 'Spotify', icon: 'musical-notes', iconColor: brandIcons.spotifyGreen },
        { id: 'netflix', name: 'Netflix', icon: 'play-circle', iconColor: colors.black },
        { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', iconColor: colors.brandText },
        { id: 'apple-music', name: 'Apple Music', icon: 'musical-note', iconColor: brandIcons.appleMusicPink },
      ],
    },
    {
      id: 'shopping',
      title: 'Shopping',
      apps: [
        { id: 'amazon', name: 'Amazon', icon: 'pricetag', iconColor: brandIcons.amazonTan },
        { id: 'ebay', name: 'eBay', icon: 'bag-handle', iconColor: brandIcons.ebayBlue },
        { id: 'apple-store', name: 'Apple Store', icon: 'logo-apple', iconColor: colors.black },
      ],
    },
  ],
  complete: [
    {
      id: 'navigation',
      title: 'Navigation',
      apps: [
        { id: 'google-maps', name: 'Google Maps', icon: 'location', iconColor: brandIcons.googleBlue },
        { id: 'find-my', name: 'Find My', icon: 'navigate', iconColor: brandIcons.googleGreen },
        { id: 'waze', name: 'Waze', icon: 'compass', iconColor: brandIcons.googleBlue },
      ],
    },
    {
      id: 'communication',
      title: 'Communication',
      apps: [
        { id: 'whatsapp', name: 'WhatsApp', icon: 'logo-whatsapp', iconColor: brandIcons.whatsappGreen },
        { id: 'messages', name: 'Messages', icon: 'chatbubble', iconColor: brandIcons.googleBlue },
        { id: 'linkedin', name: 'LinkedIn', icon: 'logo-linkedin', iconColor: brandIcons.linkedinBlue },
        { id: 'contacts', name: 'Contacts', icon: 'person', iconColor: brandIcons.googleBlue },
        { id: 'gmail', name: 'Gmail', icon: 'mail', iconColor: brandIcons.gmailRed },
      ],
    },
    {
      id: 'travel',
      title: 'Travel',
      apps: [
        { id: 'uber', name: 'Uber', icon: 'car-outline', iconColor: colors.black },
        { id: 'airlines', name: 'Airlines', icon: 'airplane-outline', iconColor: brandIcons.googleBlue },
        { id: 'train', name: 'Train', icon: 'train-outline', iconColor: brandIcons.travelOrange },
      ],
    },
    {
      id: 'entertainment',
      title: 'Entertainment',
      apps: [
        { id: 'spotify', name: 'Spotify', icon: 'musical-notes', iconColor: brandIcons.spotifyGreen },
        { id: 'netflix', name: 'Netflix', icon: 'play-circle', iconColor: colors.black },
        { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', iconColor: colors.brandText },
        { id: 'apple-music', name: 'Apple Music', icon: 'musical-note', iconColor: brandIcons.appleMusicPink },
      ],
    },
    {
      id: 'shopping',
      title: 'Shopping',
      apps: [
        { id: 'amazon', name: 'Amazon', icon: 'pricetag', iconColor: brandIcons.amazonTan },
        { id: 'ebay', name: 'eBay', icon: 'bag-handle', iconColor: brandIcons.ebayBlue },
        { id: 'apple-store', name: 'Apple Store', icon: 'logo-apple', iconColor: colors.black },
      ],
    },
    {
      id: 'health',
      title: 'Health',
      apps: [
        { id: 'health-app', name: 'Health', icon: 'heart', iconColor: brandIcons.healthSlate },
        { id: 'medkit', name: 'Medkit', icon: 'medkit', iconColor: brandIcons.travelOrange },
      ],
    },
    {
      id: 'family',
      title: 'Family',
      apps: [
        { id: 'family-link', name: 'Family Link', icon: 'people-circle', iconColor: brandIcons.familyPurple },
      ],
    },
    {
      id: 'utilities',
      title: 'Utilities',
      apps: [
        { id: 'icloud', name: 'iCloud', icon: 'cloud', iconColor: brandIcons.googleBlue },
        { id: 'notes', name: 'Notes', icon: 'document-text', iconColor: colors.black },
      ],
    },
    {
      id: 'community',
      title: 'Community',
      apps: [
        { id: 'instagram', name: 'Instagram', icon: 'logo-instagram', iconColor: brandIcons.instagramPink },
        { id: 'facebook', name: 'Facebook', icon: 'logo-facebook', iconColor: brandIcons.facebookBlue },
      ],
    },
  ],
};

function countApps(categories: CategorySpec[]): number {
  return categories.reduce((sum, c) => sum + c.apps.length, 0);
}

// Permission-first onboarding step: users can grant core device permissions
// here, before account linking, in the same flow.
export default function AppPermissionsScreen({ navigation }: Props) {
  const { planTier } = useOnboarding();
  const [devicePermission, setDevicePermission] = useState<Calendar.PermissionStatus | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);

  // cosmetic app toggles — appId -> enabled
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => CATEGORIES_BY_TIER[planTier] ?? [], [planTier]);
  const totalApps = useMemo(() => countApps(categories), [categories]);
  const enabledCount = Object.values(enabled).filter(Boolean).length;
  const allConnected = enabledCount === totalApps && totalApps > 0;

  const loadPermissions = useCallback(async () => {
    const [devicePermissions, locationPermissions] = await Promise.all([
      Calendar.getCalendarPermissionsAsync(),
      Location.getForegroundPermissionsAsync(),
    ]);
    setDevicePermission(devicePermissions.status);
    setLocationPermission(locationPermissions.status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadPermissions()
        .catch((err) => Alert.alert('Could not load permission status', String(err)))
        .finally(() => setLoading(false));
    }, [loadPermissions]),
  );

  const handleGrantDeviceCalendar = async () => {
    setDeviceBusy(true);
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      setDevicePermission(status);
      if (status === Calendar.PermissionStatus.GRANTED) {
        try {
          const events = await readDeviceCalendarEvents();
          await api.syncDeviceCalendar(events, true);
        } catch (err) {
          Alert.alert('Could not sync flights', err instanceof Error ? err.message : String(err));
        }
      } else if (status === Calendar.PermissionStatus.DENIED) {
        Alert.alert(
          'Calendar access denied',
          'Open Settings to allow Veda to access your calendars, then come back here.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (err) {
      Alert.alert('Could not request access', err instanceof Error ? err.message : String(err));
    } finally {
      setDeviceBusy(false);
    }
  };

  const handleGrantLocation = async () => {
    setLocationBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status === Location.PermissionStatus.DENIED) {
        Alert.alert(
          'Location access denied',
          'Open Settings to allow Veda to access your location for local weather on the dashboard.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (err) {
      Alert.alert('Could not request access', err instanceof Error ? err.message : String(err));
    } finally {
      setLocationBusy(false);
    }
  };

  const handleToggleDeviceCalendar = (nextValue: boolean) => {
    if (nextValue) {
      void handleGrantDeviceCalendar();
      return;
    }
    if (devicePermission === Calendar.PermissionStatus.GRANTED) {
      Alert.alert(
        'Manage Calendar access',
        'To turn this off, open Settings and disable Calendar access for Veda.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const handleToggleLocation = (nextValue: boolean) => {
    if (nextValue) {
      void handleGrantLocation();
      return;
    }
    if (locationPermission === Location.PermissionStatus.GRANTED) {
      Alert.alert(
        'Manage Location access',
        'To turn this off, open Settings and disable Location access for Veda.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  // --------------------------------------------------
  // Cosmetic app toggle handlers
  // --------------------------------------------------

  // const toggleApp = (id: string) => {
  //   setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  // };

  // const categoryEnabledCount = (category: CategorySpec) =>
  //   category.apps.filter((app) => enabled[app.id]).length;

  // const toggleCategory = (category: CategorySpec) => {
  //   const allOn = categoryEnabledCount(category) === category.apps.length;
  //   setEnabled((prev) => {
  //     const next = { ...prev };
  //     category.apps.forEach((app) => {
  //       next[app.id] = !allOn;
  //     });
  //     return next;
  //   });
  // };

  // const toggleAllApps = () => {
  //   setEnabled((prev) => {
  //     const next: Record<string, boolean> = { ...prev };
  //     categories.forEach((category) => {
  //       category.apps.forEach((app) => {
  //         next[app.id] = !allConnected;
  //       });
  //     });
  //     return next;
  //   });
  // };

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body}>
        <StepProgressBar step={4} totalSteps={5}/>

        <Text style={styles.title}>
          Choose apps for{'\n'}
          <Text style={styles.titleAccent}>{TIER_LABEL[planTier]}</Text>.
        </Text>
        <Text style={styles.subtitle}>
          Choose only the apps you want to connect. You can change or remove access at any time from settings.
        </Text>

        {/* <View style={styles.connectAllCard}> */}
          {/* <View style={styles.connectAllLeft}>
            <Ionicons name="layers-outline" size={18} color={colors.white} />
            <Text style={styles.connectAllText}>Connect all apps</Text>
          </View>
          <View style={styles.connectAllRight}>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {enabledCount}/{totalApps}
              </Text>
            </View>
            <AnimatedToggle value={allConnected} onValueChange={toggleAllApps} />
          </View>
        </View> */}

        {/* {categories.map((category) => (
          <View key={category.id} style={styles.categoryBlock}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryHeaderLeft}>
                <Text style={styles.categoryHeaderTitle}>{category.title}</Text>
                <View style={styles.countPillLight}>
                  <Text style={styles.countPillLightText}>
                    {categoryEnabledCount(category)}/{category.apps.length}
                  </Text>
                </View>
              </View>
              <View style={styles.selectAllRow}>
                <Text style={styles.selectAllText}>Select all</Text>
                <AnimatedToggle
                  value={categoryEnabledCount(category) === category.apps.length}
                  onValueChange={() => toggleCategory(category)}
                />
              </View>
            </View>

            {/* {category.apps.map((app, i) => (
              <View
                key={app.id}
                style={[styles.appRow, i === category.apps.length - 1 && styles.appRowLast]}
              >
                <View style={styles.appLabel}>
                  <View style={styles.appIconChip}>
                    <Ionicons name={app.icon} size={16} color={app.iconColor} />
                  </View>
                  <Text style={styles.appText}>{app.name}</Text>
                </View>
                <AnimatedToggle value={!!enabled[app.id]} onValueChange={() => toggleApp(app.id)} />
              </View>
            ))} */}
          {/* </View> */}
        {/* ))} */}

        {/* --------------------------------------------------
            REAL DEVICE PERMISSIONS — unchanged logic from before.
            Kept as its own section, deliberately NOT part of
            "Connect all" or any category "Select all" above, since
            these trigger real OS permission prompts and settings
            deep-links rather than a cosmetic local toggle.
        -------------------------------------------------- */}
        <Text style={styles.sectionTitle}>Device permissions</Text>
        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <View style={styles.categoryBlock}>
            <View style={[styles.appRow]}>
              <View style={styles.appLabel}>
                <View style={[styles.appIconChip, { backgroundColor: brandIcons.deviceCalendarBlue }]}>
                  <Ionicons name="calendar-outline" size={16} color={colors.white} />
                </View>
                <Text style={styles.appText}>Device Calendar</Text>
              </View>
              {deviceBusy ? (
                <ActivityIndicator />
              ) : (
                <AnimatedToggle
                  value={devicePermission === Calendar.PermissionStatus.GRANTED}
                  onValueChange={handleToggleDeviceCalendar}
                />
              )}
            </View>

            <View style={[styles.appRow, styles.appRowLast]}>
              <View style={styles.appLabel}>
                <View style={[styles.appIconChip, { backgroundColor: brandIcons.locationGreen }]}>
                  <Ionicons name="location-outline" size={16} color={colors.white} />
                </View>
                <Text style={styles.appText}>Location</Text>
              </View>
              {locationBusy ? (
                <ActivityIndicator />
              ) : (
                <AnimatedToggle
                  value={locationPermission === Location.PermissionStatus.GRANTED}
                  onValueChange={handleToggleLocation}
                />
              )}
            </View>
          </View>
        )}

        <Text style={styles.footerNote}>You can change these anytime.</Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('AccountSelection')}>
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },

  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    marginTop: spacing.md,
  },

  titleAccent: {
    color: colors.brand,
  },

  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },

  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },

  loading: { marginTop: spacing.lg, marginBottom: spacing.lg },

  // --------------------------------------------------
  // "CONNECT ALL APPS" — red banner row
  // --------------------------------------------------

  connectAllCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    height: 56,
    marginBottom: spacing.lg,
  },

  connectAllLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  connectAllText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 15,
  },

  connectAllRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  countPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.white, 0.5),
    backgroundColor: withOpacity(colors.white, 0.1),
  },

  countPillText: {
    ...typography.small,
    color: colors.white,
    fontSize: 11,
  },

  // --------------------------------------------------
  // CATEGORY SECTIONS (also reused for the device-permissions block)
  // --------------------------------------------------

  categoryBlock: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingTop: 14,
    paddingBottom: 6,
    marginBottom: spacing.md,
  },

  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  categoryHeaderTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 16,
  },

  countPillLight: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.pillFillLight,
  },

  countPillLightText: {
    ...typography.small,
    fontSize: 11,
    color: colors.textSecondary,
  },

  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  selectAllText: {
    ...typography.small,
    fontSize: 13,
    color: colors.textSecondary,
  },

  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowDivider,
  },

  appRowLast: {
    borderBottomWidth: 0,
  },

  appLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },

  appIconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  appText: {
    ...typography.body,
    color: colors.textPrimary,
  },

  footerNote: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // --------------------------------------------------
  // FOOTER
  // --------------------------------------------------

  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },

  cta: {
    backgroundColor: colors.brandBackGround,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },

  ctaText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 16,
  },
});