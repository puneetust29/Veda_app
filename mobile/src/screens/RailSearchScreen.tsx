import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RootStackParamList } from '../types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RailSearch'>;

type Station = { uid: string; name: string; countryCode: string; isMeta: boolean };
type Field = 'origin' | 'destination';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function RailSearchScreen({ navigation }: Props) {
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [originText, setOriginText] = useState('');
  const [destinationText, setDestinationText] = useState('');
  const [origin, setOrigin] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [date, setDate] = useState(tomorrowString());
  const [passengers, setPassengers] = useState(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [searching, setSearching] = useState(false);

  const searchStations = useCallback(async (q: string) => {
    if (q.length < 2) { setStations([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/rail/locations?q=${encodeURIComponent(q)}`);
      if (res.ok) setStations(await res.json());
    } finally {
      setSearching(false);
    }
  }, []);

  const handleOriginChange = (text: string) => {
    setOriginText(text);
    setOrigin(null);
    setActiveField('origin');
    searchStations(text);
  };

  const handleDestinationChange = (text: string) => {
    setDestinationText(text);
    setDestination(null);
    setActiveField('destination');
    searchStations(text);
  };

  const pickStation = (s: Station) => {
    if (activeField === 'origin') {
      setOrigin(s);
      setOriginText(s.name);
    } else {
      setDestination(s);
      setDestinationText(s.name);
    }
    setActiveField(null);
    setStations([]);
  };

  const canSearch = origin && destination && date;

  const handleSearch = () => {
    if (!canSearch) return;
    navigation.navigate('RailResults', {
      originUid: origin.uid,
      originName: origin.name,
      destinationUid: destination.uid,
      destinationName: destination.name,
      date,
      passengers,
    });
  };

  const showSuggestions = activeField !== null && stations.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.label}>From</Text>
        <TextInput
          style={[styles.input, activeField === 'origin' && styles.inputFocused]}
          placeholder="Departure station"
          placeholderTextColor={colors.textSecondary}
          value={originText}
          onChangeText={handleOriginChange}
          onFocus={() => setActiveField('origin')}
          autoCorrect={false}
        />

        <Text style={styles.label}>To</Text>
        <TextInput
          style={[styles.input, activeField === 'destination' && styles.inputFocused]}
          placeholder="Arrival station"
          placeholderTextColor={colors.textSecondary}
          value={destinationText}
          onChangeText={handleDestinationChange}
          onFocus={() => setActiveField('destination')}
          autoCorrect={false}
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.label}>Passengers</Text>
        <View style={styles.passengerRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setPassengers(p => Math.max(1, p - 1))}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.passengerCount}>{passengers}</Text>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setPassengers(p => Math.min(9, p + 1))}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={!canSearch}
        >
          <Text style={styles.searchBtnText}>Search trains</Text>
        </TouchableOpacity>
      </View>

      {searching && <ActivityIndicator style={styles.spinner} color={colors.brand} />}

      {showSuggestions && (
        <FlatList
          style={styles.suggestions}
          data={stations}
          keyExtractor={s => s.uid}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.suggestionItem} onPress={() => pickStation(item)}>
              <Text style={styles.suggestionName}>{item.name}</Text>
              <Text style={styles.suggestionCountry}>{item.countryCode}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { padding: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputFocused: { borderColor: colors.brand },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#FFF', fontSize: 20, lineHeight: 22 },
  passengerCount: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, minWidth: 24, textAlign: 'center' },
  searchBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  spinner: { marginTop: spacing.md },
  suggestions: {
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    maxHeight: 240,
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionName: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  suggestionCountry: { fontSize: 13, color: colors.textSecondary, marginLeft: spacing.sm },
});
