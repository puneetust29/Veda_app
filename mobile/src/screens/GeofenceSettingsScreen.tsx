import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useGeofence } from '../context/GeofenceContext';
import { requestBackgroundPermission, requestForegroundPermission } from '../lib/locationService';
import { placeSearchService } from '../lib/placeSearchService';
import { locationIntelligenceService } from '../lib/locationIntelligenceService';
import { colors, fonts, radii, spacing, typography } from '../theme';
import type { Geofence, PlaceSearchSettings, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'GeofenceSettings'>;

const GEOFENCE_TYPE_ICON: Record<Geofence['type'], keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  work: 'business-outline',
  custom: 'location-outline',
  temporary: 'time-outline',
};

export default function GeofenceSettingsScreen({ navigation }: Props) {
  const { geofences, settings, loading, toggleGeofence, removeGeofence, updateSettings, removeAllData } =
    useGeofence();
  const [busy, setBusy] = useState(false);
  const [placeSettings, setPlaceSettings] = useState<PlaceSearchSettings>({
    placeSearchEnabled: false,
    proximityRecommendationsEnabled: false,
  });

  useEffect(() => {
    placeSearchService.getSettings().then(setPlaceSettings).catch(() => undefined);
  }, []);

  const handleTogglePlaceSearch = async (value: boolean) => {
    const next = { ...placeSettings, placeSearchEnabled: value };
    setPlaceSettings(next);
    await placeSearchService.saveSettings(next);
  };

  const handleToggleProximity = async (value: boolean) => {
    const next = { ...placeSettings, proximityRecommendationsEnabled: value };
    setPlaceSettings(next);
    await placeSearchService.saveSettings(next);
  };

  const handleToggleLocation = async (value: boolean) => {
    if (!value) {
      await updateSettings({ locationEnabled: false, backgroundLocationEnabled: false, geofencingEnabled: false });
      return;
    }
    setBusy(true);
    try {
      const fg = await requestForegroundPermission();
      if (fg !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          'Location access needed',
          'Enable Location access for Veda in Settings to use this feature.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      await updateSettings({ locationEnabled: true });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBackground = async (value: boolean) => {
    if (!value) {
      await updateSettings({ backgroundLocationEnabled: false, geofencingEnabled: false });
      return;
    }
    setBusy(true);
    try {
      // Request notification permission alongside background location so
      // geofence alerts can actually fire.
      await Notifications.requestPermissionsAsync();

      const bg = await requestBackgroundPermission();
      if (bg !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          '"Always" location access needed',
          'Veda needs "Always Allow" location access to monitor geofences in the background. Open Settings and set Location to "Always".',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      await updateSettings({ backgroundLocationEnabled: true });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleGeofencing = async (value: boolean) => {
    if (value && !settings.backgroundLocationEnabled) {
      Alert.alert(
        'Background location required',
        'Enable "Background location" above before turning on geofencing.',
      );
      return;
    }
    await updateSettings({ geofencingEnabled: value });
  };

  const handleDeleteGeofence = (geofence: Geofence) => {
    Alert.alert(
      `Remove "${geofence.label}"?`,
      'This will stop monitoring this location.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeGeofence(geofence.id),
        },
      ],
    );
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      {/* Privacy disclosure */}
      <View style={styles.disclosureCard}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
        <Text style={styles.disclosureText}>
          Location features are opt-in. Veda records only geofence crossing events — not your
          continuous GPS track. You can remove all stored data at any time below.
        </Text>
      </View>

      {/* Location toggles */}
      <Text style={styles.sectionTitle}>Location access</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="location-outline"
          iconBg={colors.success}
          label="Enable location"
          description="Required for all location features."
          value={settings.locationEnabled}
          onValueChange={handleToggleLocation}
          disabled={busy || loading}
        />
        <SettingsRow
          icon="navigate-outline"
          iconBg="#5856d6"
          label="Background location"
          description='Sets location access to "Always Allow" so geofences fire when the app is closed.'
          value={settings.backgroundLocationEnabled}
          onValueChange={handleToggleBackground}
          disabled={busy || loading || !settings.locationEnabled}
          last
        />
      </View>

      {/* Geofencing toggle */}
      <Text style={styles.sectionTitle}>Geofencing</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="radio-button-on-outline"
          iconBg={colors.brand}
          label="Monitor geofences"
          description="Veda will notice when you enter or leave saved locations."
          value={settings.geofencingEnabled}
          onValueChange={handleToggleGeofencing}
          disabled={busy || loading || !settings.backgroundLocationEnabled}
          last
        />
      </View>

      {/* Geofence list */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Saved locations</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('GeofenceEdit', undefined)}
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {geofences.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="location-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>No locations saved yet.</Text>
          <Text style={styles.emptySubtext}>Tap Add to create a Home, Work, or custom geofence.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {geofences.map((gf, i) => (
            <View
              key={gf.id}
              style={[styles.geofenceRow, i === geofences.length - 1 && styles.rowLast]}
            >
              <View style={styles.geofenceLeft}>
                <View style={[styles.gfIconChip, { backgroundColor: gf.enabled ? colors.brand : colors.textDisabled }]}>
                  <Ionicons name={GEOFENCE_TYPE_ICON[gf.type]} size={15} color={colors.white} />
                </View>
                <View>
                  <Text style={styles.gfLabel}>{gf.label}</Text>
                  <Text style={styles.gfMeta}>{gf.radiusMeters} m radius</Text>
                </View>
              </View>
              <View style={styles.geofenceRight}>
                <Switch
                  value={gf.enabled}
                  onValueChange={(v) => toggleGeofence(gf.id, v)}
                  trackColor={{ true: colors.brand }}
                  thumbColor={colors.white}
                />
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => navigation.navigate('GeofenceEdit', { geofenceId: gf.id })}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteGeofence(gf)}>
                  <Ionicons name="trash-outline" size={18} color={colors.brand} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Location Intelligence */}
      <Text style={styles.sectionTitle}>Location Intelligence</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="radio-outline"
          iconBg="#2980B9"
          label="Proactive place awareness"
          description="Veda quietly fetches what's nearby before each chat message so it can mention relevant places without you asking. Conversational searches ('find me a pharmacy') always work regardless of this setting."
          value={placeSettings.placeSearchEnabled}
          onValueChange={handleTogglePlaceSearch}
          disabled={busy || loading || !settings.locationEnabled}
        />
        <SettingsRow
          icon="notifications-outline"
          iconBg="#8E44AD"
          label="Proximity recommendations"
          description="Veda notifies you when you're near a relevant place (e.g., grocery store with items on your list)."
          value={placeSettings.proximityRecommendationsEnabled}
          onValueChange={handleToggleProximity}
          disabled={busy || loading || !placeSettings.placeSearchEnabled}
          last
        />
      </View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('SavedPlaces')}
      >
        <Ionicons name="star-outline" size={16} color={colors.white} />
        <Text style={styles.addButtonText}>View saved places</Text>
      </TouchableOpacity>

      {/* Privacy — remove all data */}
      <Text style={styles.sectionTitle}>Privacy</Text>
      <TouchableOpacity
        style={styles.destructiveCard}
        onPress={() => {
          Alert.alert(
            'Remove all location data?',
            'This removes all geofences, saved places, behavioral patterns, and location settings from this device. Cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove all',
                style: 'destructive',
                onPress: async () => {
                  await removeAllData();
                  await locationIntelligenceService.clearAllLocationData().catch(() => undefined);
                },
              },
            ],
          );
        }}
      >
        <Ionicons name="trash-outline" size={18} color={colors.brand} />
        <Text style={styles.destructiveText}>Remove all location data</Text>
      </TouchableOpacity>
      <Text style={styles.footerNote}>
        Removes geofences, saved places, behavioral patterns, and location settings from this device.
      </Text>
    </ScrollView>
  );
}

// --------------- sub-component ---------------

type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
};

function SettingsRow({ icon, iconBg, label, description, value, onValueChange, disabled, last }: SettingsRowProps) {
  return (
    <View style={[styles.settingsRow, last && styles.rowLast]}>
      <View style={styles.settingsRowLeft}>
        <View style={[styles.gfIconChip, { backgroundColor: iconBg, opacity: disabled ? 0.4 : 1 }]}>
          <Ionicons name={icon} size={15} color={colors.white} />
        </View>
        <View style={styles.settingsRowText}>
          <Text style={[styles.settingsLabel, disabled && styles.disabledText]}>{label}</Text>
          <Text style={styles.settingsDesc}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.brand }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.xl, paddingBottom: 48 },

  disclosureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.successTint,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  disclosureText: {
    flex: 1,
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    fontSize: 16,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 4,
  },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowDivider,
  },
  settingsRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginRight: spacing.md,
  },
  settingsRowText: { flex: 1 },
  settingsLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  settingsDesc: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  disabledText: { color: colors.textDisabled },

  gfIconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  geofenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowDivider,
  },
  geofenceLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gfLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  gfMeta: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  geofenceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: { padding: 4 },
  deleteBtn: { padding: 4 },
  rowLast: { borderBottomWidth: 0 },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  emptyText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textSecondary },
  emptySubtext: { fontFamily: fonts.bodyLight, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  addButtonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },

  destructiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brandTint,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  destructiveText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.brand,
  },
  footerNote: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 17,
  },
});
