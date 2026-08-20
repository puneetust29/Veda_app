import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Calendar from 'expo-calendar';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import AnimatedToggle from '../../components/onboarding/AnimatedToggle';
import StepHeader from '../../components/onboarding/StepHeader';
import StepProgressBar from '../../components/onboarding/StepProgressBar';
import { useOnboarding } from '../../context/OnboardingContext';
import { api } from '../../lib/api';
import { readDeviceCalendarEvents } from '../../lib/deviceCalendar';
import { colors, radii, spacing, typography } from '../../theme';
import type { OnboardingStackParamList } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AppPermissions'>;

const TIER_LABEL: Record<string, string> = {
  lite: 'Lite',
  balanced: 'Balanced',
  complete: 'Complete',
};

// Permission-first onboarding step: users can grant core device permissions
// here, before account linking, in the same flow.
export default function AppPermissionsScreen({ navigation }: Props) {
  const { planTier } = useOnboarding();
  const [devicePermission, setDevicePermission] = useState<Calendar.PermissionStatus | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);

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

  return (
    <View style={styles.container}>
      <StepHeader onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body}>
        <StepProgressBar step={3} />
        <Text style={styles.title}>Your {TIER_LABEL[planTier]} setup.</Text>
        <Text style={styles.subtitle}>I've picked these apps to help you get started. Change anything you'd like.</Text>

        <Text style={styles.sectionTitle}>Permissions</Text>
        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <View style={styles.permissionsBlock}>
            <View style={styles.appRow}>
              <View style={styles.appLabel}>
                <View style={[styles.appIconChip, { backgroundColor: '#3B82F6' }]}>
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

            <View style={styles.appRow}>
              <View style={styles.appLabel}>
                <View style={[styles.appIconChip, { backgroundColor: '#10B981' }]}>
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

        {/* Unused integration toggles are intentionally hidden for now until they're wired. */}

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
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  sectionTitle: { ...typography.bodyBold, color: colors.textPrimary, marginBottom: spacing.sm },
  loading: { marginTop: spacing.xl, marginBottom: spacing.lg },
  permissionsBlock: { marginBottom: spacing.lg },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  appLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  appIconChip: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  appText: { ...typography.body, color: colors.textPrimary },
  footerNote: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaText: { ...typography.bodyBold, color: colors.white, fontSize: 16 },
});
