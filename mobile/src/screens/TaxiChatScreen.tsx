import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import ChatItemView from '../components/chat/ChatItemView';
import LoadingStream from '../components/chat/LoadingStream';
import MessageBubble from '../components/chat/MessageBubble';
import RecommendationCard from '../components/chat/RecommendationCard';
import PickupLocationRow from '../components/taxi/PickupLocationRow';
import LocationPickerModal from '../components/taxi/LocationPickerModal';
import DestinationSuggestions from '../components/taxi/DestinationSuggestions';
import ErrorPanel from '../components/taxi/ErrorPanel';
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete';
import { api } from '../lib/api';
import { loadToken } from '../lib/authToken';
import { nextId } from '../lib/chatThread';
import { getCachedReverseGeocode } from '../lib/geocodeCache';
import { calculateDistance } from '../lib/distanceCalculator';
import type { RecommendationCardPayload, RootStackParamList, ChatItem } from '../types';
import { colors, spacing, typography } from '../theme';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'TaxiChat'>;

type ScreenPhase = 'input' | 'loading' | 'card' | 'error';

type PickupLocation = { label: string; latitude: number | null; longitude: number | null };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function TaxiChatScreen({ navigation }: Props) {
  const { customer } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<ScreenPhase>('input');
  const [items, setItems] = useState<ChatItem[]>(() => [
    {
      id: nextId(),
      createdAt: Date.now(),
      kind: 'text',
      role: 'agent',
      text: "Where would you like to go? I'll book you a ride from your current location.",
    },
  ]);
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pickupLocation, setPickupLocation] = useState<PickupLocation | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerPermissionError, setPickerPermissionError] = useState<string>('');
  const [pickupSearchInput, setPickupSearchInput] = useState<string>('');
  const [pendingDestination, setPendingDestination] = useState<string>('');

  const { predictions, loading: autocompleteLoading, search } = usePlacesAutocomplete();
  const { predictions: pickupPredictions, loading: pickupLoading, search: searchPickup } = usePlacesAutocomplete();
  const firstName = customer?.full_name?.split(' ')[0] ?? 'User';

  const handleDestinationSearch = (text: string) => {
    setDraft(text);
  };

  const handlePickupLocationSearch = (text: string) => {
    setPickupSearchInput(text);
    if (pickupLocation?.latitude != null && pickupLocation?.longitude != null) {
      searchPickup(text, pickupLocation.latitude, pickupLocation.longitude);
    } else {
      searchPickup(text);
    }
  };

  const proceedToDestinationSuggestions = async (destination: string, pickup: PickupLocation | null) => {
    if (pickup?.latitude != null && pickup?.longitude != null) {
      const coordResult = await api.getPlaceCoordinates(destination, pickup.latitude, pickup.longitude);
      if (coordResult.latitude != null && coordResult.longitude != null) {
        const distance = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          coordResult.latitude,
          coordResult.longitude,
        );

        const THRESHOLD_KM = 50.0;
        if (distance > THRESHOLD_KM) {
          setErrorMessage(`${destination} is more than ${THRESHOLD_KM}km from your pickup location. Try a closer destination or change your pickup location.`);
          setPhase('error');
          return;
        }
      }
    }

    search(destination, pickup?.latitude ?? undefined, pickup?.longitude ?? undefined);
  };

  const handleSendMessage = async () => {
    if (!draft.trim()) return;

    const messageToExtract = draft;
    try {
      setPhase('loading');
      setDraft('');

      setItems((prev) => [
        ...prev,
        { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text: messageToExtract },
      ]);

      const result = await api.extractDestination(messageToExtract);

      if (!result.is_relevant) {
        setErrorMessage(result.redirect_message || 'I can only help with taxi bookings. Please tell me where you\'d like to go.');
        setPhase('error');
        return;
      }

      if (!result.destination) {
        setErrorMessage('Please mention a destination city to book your ride.');
        setPhase('error');
        return;
      }

      if (__DEV__) console.log('[TaxiChat] Extracted destination:', result.destination, 'pickup:', result.pickup_location);

      const parsedPickup = result.pickup_location?.trim();
      if (parsedPickup) {
        setPendingDestination(result.destination);
        setPickupSearchInput(parsedPickup);
        setPickerPermissionError('');
        if (pickupLocation?.latitude != null && pickupLocation?.longitude != null) {
          searchPickup(parsedPickup, pickupLocation.latitude, pickupLocation.longitude);
        } else {
          searchPickup(parsedPickup);
        }
        setPickerVisible(true);
        return;
      }

      await proceedToDestinationSuggestions(result.destination, pickupLocation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract destination';
      setErrorMessage(msg);
      setPhase('error');
      if (__DEV__) console.error('[TaxiChat] Extraction error:', err);
    }
  };

  const handleSelectPrediction = async (description: string) => {
    setDraft('');
    setDisplayPredictions([]);
    search('');
    setSelectedDestination(description);
    setPhase('loading');
    setErrorMessage('');

    setItems((prev) => [
      ...prev,
      { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text: description },
      { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: `Drop location set to ${description}.` },
    ]);

    const startTime = Date.now();

    try {
      const token = await loadToken();
      if (!token) throw new Error('Not authenticated');

      let destLat: number | null = null;
      let destLng: number | null = null;

      if (pickupLocation?.latitude != null && pickupLocation?.longitude != null) {
        const coordResult = await api.getPlaceCoordinates(description, pickupLocation.latitude, pickupLocation.longitude);
        if (coordResult.error || coordResult.latitude == null || coordResult.longitude == null) {
          setErrorMessage(coordResult.message || 'Could not find location coordinates.');
          setPhase('error');
          return;
        }

        destLat = coordResult.latitude;
        destLng = coordResult.longitude;

        const distance = calculateDistance(
          pickupLocation.latitude,
          pickupLocation.longitude,
          destLat,
          destLng,
        );

        const THRESHOLD_KM = 50.0;
        if (distance > THRESHOLD_KM) {
          setErrorMessage(`${description} is more than ${THRESHOLD_KM}km from your pickup location. Try a closer destination or change your pickup location.`);
          setPhase('error');
          return;
        }
      }

      const params = new URLSearchParams({ destination: description });
      if (pickupLocation?.latitude != null && pickupLocation?.longitude != null) {
        params.set('pickup_latitude', String(pickupLocation.latitude));
        params.set('pickup_longitude', String(pickupLocation.longitude));
      } else if (pickupLocation?.label) {
        params.set('pickup_description', pickupLocation.label);
      }

      const res = await fetch(`${API_BASE_URL}/dev/uber/deeplink?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);

      const raw = (await res.json()) as {
        destination?: string;
        dropoff_latlng?: { lat: number; lng: number };
        uber_app_url?: string;
        deep_link_url?: string;
        error?: string;
        message?: string;
      };

      if (raw.error) {
        setErrorMessage(raw.message || 'This destination is too far away.');
        setPhase('error');
        return;
      }

      if (!raw.destination || !raw.dropoff_latlng || !raw.uber_app_url || !raw.deep_link_url) {
        throw new Error('Invalid response from server');
      }

      const elapsedMs = Date.now() - startTime;
      const minDurationMs = 2000;
      if (elapsedMs < minDurationMs) {
        await new Promise(resolve => setTimeout(resolve, minDurationMs - elapsedMs));
      }

      const card: RecommendationCardPayload = {
        kind: 'uber_ride',
        origin_type: 'current_location',
        reasoning: '',
        suggested_message: '',
        pickup_label: pickupLocation?.label ?? 'Current location',
        dropoff_label: raw.destination,
        uber_app_url: raw.uber_app_url,
        deep_link_url: raw.deep_link_url,
        airport_options: [],
        alternative_options: [],
        drive_mins_to_airport: null,
      };

      setItems((prev) => [
        ...prev,
        { id: nextId(), createdAt: Date.now(), kind: 'card', card },
        { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: 'Changed your mind? Start again.' },
      ]);
      setPhase('card');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to book taxi';
      setErrorMessage(msg);
      setPhase('error');
      if (__DEV__) console.error('[TaxiChat] Deeplink error:', err);
    }
  };

  const handleRetry = () => {
    setPhase('input');
    setSelectedDestination('');
    setDraft('');
    setErrorMessage('');
  };

  const getReadableLocation = async (latitude: number, longitude: number): Promise<string> => {
    return getCachedReverseGeocode(latitude, longitude);
  };

  const handleUseCurrentLocation = async () => {
    setPickerPermissionError('');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setPickerPermissionError('Location permission denied — enable it in Settings to use your current location.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      const label = await getReadableLocation(latitude, longitude);
      setPickupLocation({ label, latitude, longitude });
      setPickerVisible(false);
      setItems((prev) => [
        ...prev,
        { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: `Pickup set to ${label}.` },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get location';
      setPickerPermissionError(msg);
    }
  };

  const handleSelectPickupPrediction = async (description: string) => {
    let newPickupLocation: PickupLocation = { label: description, latitude: null, longitude: null };
    try {
      const coordResult = await api.getPlaceCoordinates(description);
      if (coordResult.latitude != null && coordResult.longitude != null) {
        newPickupLocation = { label: description, latitude: coordResult.latitude, longitude: coordResult.longitude };
      }
    } catch (err) {
      if (__DEV__) console.error('[TaxiChat] Failed to geocode pickup:', err);
    }

    setPickupLocation(newPickupLocation);
    setPickupSearchInput('');
    setPickerVisible(false);
    setItems((prev) => [
      ...prev,
      { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: `Pickup set to ${newPickupLocation.label}.` },
    ]);

    if (pendingDestination) {
      const destination = pendingDestination;
      setPendingDestination('');
      await proceedToDestinationSuggestions(destination, newPickupLocation);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [items, phase]);

  useEffect(() => {
    const initializeLocation = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === Location.PermissionStatus.GRANTED) {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = position.coords;
          const label = await getReadableLocation(latitude, longitude);
          setPickupLocation({ label, latitude, longitude });
        }
      } catch (err) {
        if (__DEV__) console.error('[TaxiChat] Failed to initialize location:', err);
      }
    };

    initializeLocation();
  }, []);

  const [displayPredictions, setDisplayPredictions] = useState<typeof predictions>([]);
  useEffect(() => {
    if (__DEV__) console.log('[TaxiChat] Predictions updated:', predictions);
    setDisplayPredictions(predictions);
  }, [predictions]);

  return (
    <View style={styles.container}>
      <DashboardHeader
        avatarInitial={firstName.charAt(0).toUpperCase()}
        onPressHistory={() => navigation.goBack()}
        onPressClose={() => navigation.goBack()}
        menuItems={[]}
      />
      {(phase === 'input' || phase === 'error' || phase === 'loading') && (
        <PickupLocationRow
          label={pickupLocation?.label ?? 'Current location (default)'}
          onChangePress={() => setPickerVisible(true)}
        />
      )}
      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item) =>
          item.kind === 'card' ? (
            <View key={item.id} style={styles.cardContainer}>
              <RecommendationCard card={item.card} />
            </View>
          ) : (
            <ChatItemView key={item.id} item={item} />
          ),
        )}

        {(phase === 'input' || (phase === 'loading' && displayPredictions.length > 0)) && displayPredictions.length > 0 && (
          <MessageBubble text="Here are some destinations you can pick from:" tone="agent" />
        )}

        {(phase === 'input' || (phase === 'loading' && displayPredictions.length > 0)) && (
          <DestinationSuggestions
            predictions={displayPredictions}
            onSelect={handleSelectPrediction}
          />
        )}

        {phase === 'loading' && displayPredictions.length === 0 && (
          <LoadingStream
            items={[
              { text: 'Extracting destination…', delayMs: 500 },
              { text: 'Searching available rides…', delayMs: 600 },
              { text: 'Booking your taxi…', delayMs: 700 },
            ]}
          />
        )}

        {phase === 'error' && (
          <ErrorPanel message={errorMessage} onRetry={handleRetry} />
        )}
      </ScrollView>

      <LocationPickerModal
        visible={pickerVisible}
        onClose={() => {
          setPickerVisible(false);
          setPickupSearchInput('');
          if (pendingDestination) {
            setPendingDestination('');
            setPhase('input');
          }
        }}
        onUseCurrentLocation={handleUseCurrentLocation}
        permissionError={pickerPermissionError}
        searchInput={pickupSearchInput}
        onSearchChange={handlePickupLocationSearch}
        predictions={pickupPredictions}
        loading={pickupLoading}
        onPredictionSelect={handleSelectPickupPrediction}
      />

      {(phase === 'input' || phase === 'card' || (phase === 'loading' && displayPredictions.length > 0)) && (
        <View style={styles.inputSection}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Search destination…"
              value={draft}
              onChangeText={handleDestinationSearch}
              placeholderTextColor="#999"
              editable={!autocompleteLoading}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!draft.trim() || autocompleteLoading) && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!draft.trim() || autocompleteLoading}
            >
              {autocompleteLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons name="send" size={20} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingBottom: spacing.lg },
  thread: { flex: 1 },
  threadContent: { padding: spacing.lg, paddingBottom: spacing.md },
  cardContainer: {
    marginVertical: spacing.md,
  },
  inputSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
