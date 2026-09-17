import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';

import { useGeofence } from '../context/GeofenceContext';
import { getCurrentPosition } from '../lib/locationService';
import { colors, fonts, radii, spacing, typography } from '../theme';
import type { Geofence, GeofenceType, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'GeofenceEdit'>;

const TYPE_OPTIONS: Array<{ value: GeofenceType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'home', label: 'Home', icon: 'home-outline' },
  { value: 'work', label: 'Work', icon: 'business-outline' },
  { value: 'custom', label: 'Custom', icon: 'location-outline' },
];

const RADIUS_OPTIONS = [100, 200, 300, 500, 1000];

const DEFAULT_REGION: Region = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function GeofenceEditScreen({ navigation, route }: Props) {
  const geofenceId = route.params?.geofenceId;
  const { geofences, addGeofence, updateGeofence } = useGeofence();

  const existing = useMemo(
    () => (geofenceId ? geofences.find((g) => g.id === geofenceId) : undefined),
    [geofenceId, geofences],
  );

  const [label, setLabel] = useState(existing?.label ?? '');
  const [type, setType] = useState<GeofenceType>(existing?.type ?? 'home');
  const [radiusMeters, setRadiusMeters] = useState(existing?.radiusMeters ?? 200);
  const [coordinate, setCoordinate] = useState<{ latitude: number; longitude: number } | null>(
    existing ? { latitude: existing.latitude, longitude: existing.longitude } : null,
  );
  const [saving, setSaving] = useState(false);

  // Auto-fill label when type preset is tapped (unless the user has edited it)
  useEffect(() => {
    if (!existing && (label === '' || label === 'Home' || label === 'Work')) {
      setLabel(type === 'home' ? 'Home' : type === 'work' ? 'Work' : '');
    }
  }, [type, existing]); // intentionally excludes `label` to avoid stomping user edits

  useEffect(() => {
    if (coordinate) return;
    getCurrentPosition().then((pos) => {
      if (pos) setCoordinate(pos);
    });
  }, [coordinate]);

  const mapRegion: Region = coordinate
    ? {
        ...coordinate,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : DEFAULT_REGION;

  const canSave = label.trim().length > 0 && coordinate !== null;

  const handleSave = async () => {
    if (!coordinate) return;
    setSaving(true);
    try {
      const data: Omit<Geofence, 'id' | 'createdAt'> = {
        label: label.trim(),
        type,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        radiusMeters,
        enabled: existing?.enabled ?? true,
      };

      if (existing) {
        await updateGeofence(existing.id, data);
      } else {
        await addGeofence(data);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Map — tap to place pin */}
      <MapView
        style={styles.map}
        region={mapRegion}
        onPress={(e) => setCoordinate(e.nativeEvent.coordinate)}
        showsUserLocation
        showsMyLocationButton
      >
        {coordinate && (
          <>
            <Marker coordinate={coordinate} />
            <Circle
              center={coordinate}
              radius={radiusMeters}
              strokeColor={colors.brand}
              fillColor="rgba(192,57,43,0.15)"
            />
          </>
        )}
      </MapView>

      {!coordinate && (
        <View style={styles.mapHintBanner}>
          <Text style={styles.mapHintText}>Tap the map to place your geofence</Text>
        </View>
      )}

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        {/* Label */}
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.textInput}
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Home, Office, Gym"
          placeholderTextColor={colors.textMuted}
          maxLength={40}
          returnKeyType="done"
        />

        {/* Type */}
        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.typeChip, type === opt.value && styles.typeChipActive]}
              onPress={() => setType(opt.value)}
            >
              <Ionicons
                name={opt.icon}
                size={15}
                color={type === opt.value ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.typeChipText, type === opt.value && styles.typeChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Radius */}
        <Text style={styles.fieldLabel}>Radius</Text>
        <View style={styles.radiusRow}>
          {RADIUS_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusChip, radiusMeters === r && styles.radiusChipActive]}
              onPress={() => setRadiusMeters(r)}
            >
              <Text style={[styles.radiusChipText, radiusMeters === r && styles.radiusChipTextActive]}>
                {r >= 1000 ? `${r / 1000} km` : `${r} m`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Add geofence'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  map: { height: 240 },

  mapHintBanner: {
    position: 'absolute',
    top: 200,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  mapHintText: { fontFamily: fonts.medium, fontSize: 13, color: colors.white },

  form: { flex: 1 },
  formContent: { padding: spacing.xl, gap: spacing.sm, paddingBottom: 40 },

  fieldLabel: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: 4,
  },

  textInput: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },

  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.fieldFill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  typeChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  typeChipTextActive: { color: colors.white },

  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  radiusChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.fieldFill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  radiusChipActive: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  radiusChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  radiusChipTextActive: { color: colors.brand },

  saveButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radii.xl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: colors.ctaDisabledLight },
  saveButtonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
});
