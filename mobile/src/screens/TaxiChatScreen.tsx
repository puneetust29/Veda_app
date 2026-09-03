import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import ChatItemView from '../components/chat/ChatItemView';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import LoadingStream from '../components/chat/LoadingStream';
import RecommendationCard from '../components/chat/RecommendationCard';
import { useAuth } from '../context/AuthContext';
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete';
import { api } from '../lib/api';
import { loadToken } from '../lib/authToken';
import { nextId } from '../lib/chatThread';
import type { RecommendationCardPayload, RootStackParamList, ChatItem } from '../types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TaxiChat'>;

type ScreenPhase = 'input' | 'loading' | 'select_pickup' | 'select_destination' | 'card' | 'error';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function TaxiChatScreen({ navigation }: Props) {
  const { customer } = useAuth();
  const insets = useSafeAreaInsets();
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
  const [uberCard, setUberCard] = useState<RecommendationCardPayload | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [selectedPickup, setSelectedPickup] = useState<string | null>(null);
  const [selectedPickupCoords, setSelectedPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedDestinationCoords, setSelectedDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [extractedDestination, setExtractedDestination] = useState<string>('');
  const [searchingFor, setSearchingFor] = useState<'pickup' | 'destination'>('pickup');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const firstName = customer?.full_name?.split(' ')[0] ?? 'User';
  const { predictions, loading: autocompleteLoading, search } = usePlacesAutocomplete();


  const handleSendMessage = async () => {
    if (!draft.trim()) return;

    const messageToExtract = draft;
    try {
      setPhase('loading');
      setDraft('');

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

      setExtractedDestination(result.destination);
      setItems((prev) => [
        ...prev,
        { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text: messageToExtract },
      ]);

      // If pickup location was extracted, search pickup suggestions first; otherwise go
      // straight to destination. Stay in 'loading' — the predictions effect flips the
      // phase once results actually arrive.
      if (result.pickup_location) {
        setSearchingFor('pickup');
        search(result.pickup_location);
      } else {
        setSearchingFor('destination');
        search(result.destination);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract destination';
      setErrorMessage(msg);
      setPhase('error');
    }
  };

  const bookTaxi = async (
    destination: string,
    pickup?: string | null,
    destinationCoords?: { lat: number; lng: number } | null,
    pickupCoords?: { lat: number; lng: number } | null,
  ) => {
    setSelectedDestination(destination);
    setErrorMessage('');

    try {
      const token = await loadToken();
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams({ destination });
      if (pickupCoords) {
        params.append('pickup_lat', String(pickupCoords.lat));
        params.append('pickup_lng', String(pickupCoords.lng));
        if (pickup) params.append('pickup_label', pickup);
      }
      if (destinationCoords) {
        params.append('destination_lat', String(destinationCoords.lat));
        params.append('destination_lng', String(destinationCoords.lng));
      }

      const res = await fetch(`${API_BASE_URL}/dev/uber/deeplink?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);

      const raw = (await res.json()) as {
        destination: string;
        dropoff_latlng: { lat: number; lng: number };
        uber_app_url: string;
        deep_link_url: string;
      };

      const card: RecommendationCardPayload = {
        kind: 'uber_ride',
        origin_type: 'current_location',
        reasoning: '',
        suggested_message: '',
        pickup_label: pickup || 'Current location',
        dropoff_label: raw.destination,
        uber_app_url: raw.uber_app_url,
        deep_link_url: raw.deep_link_url,
        airport_options: [],
        alternative_options: [],
        drive_mins_to_airport: null,
      };

      setUberCard(card);
      setPhase('card');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to book taxi';
      setErrorMessage(msg);
      setPhase('error');
    }
  };


  const handleSelectPrediction = async (description: string, placeId: string) => {
    setDraft('');

    try {
      // Geocode the selected place to get coordinates
      if (__DEV__) console.log('[TaxiChat] Geocoding place:', placeId, description);
      const coords = await api.geocodePlace(placeId);
      if (__DEV__) console.log('[TaxiChat] Geocode response:', coords);

      if (!coords.latitude || !coords.longitude) {
        setErrorMessage(coords.error || 'Could not get location coordinates');
        setPhase('error');
        return;
      }

      if (searchingFor === 'pickup') {
        setSelectedPickup(description);
        setSelectedPickupCoords({ lat: coords.latitude, lng: coords.longitude });
        setSearchingFor('destination');
        // Back to loading until the destination predictions arrive — avoids showing
        // the stale pickup suggestions under a "Select Destination" header.
        setPhase('loading');
        search(extractedDestination);
      } else {
        setSelectedDestination(description);
        setSelectedDestinationCoords({ lat: coords.latitude, lng: coords.longitude });
        setPhase('loading');
        await bookTaxi(description, selectedPickup, { lat: coords.latitude, lng: coords.longitude }, selectedPickupCoords);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to geocode location';
      setErrorMessage(msg);
      setPhase('error');
    }
  };

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [items, phase]);

  useEffect(() => {
    if (predictions.length > 0 && phase === 'loading') {
      if (searchingFor === 'pickup') {
        setPhase('select_pickup');
      } else {
        setPhase('select_destination');
      }
    }
  }, [predictions, phase, searchingFor]);


  return (
    <View style={styles.container}>
      <DashboardHeader
        avatarInitial={firstName.charAt(0).toUpperCase()}
        onPressHistory={() => navigation.goBack()}
        onPressClose={() => navigation.goBack()}
        menuItems={[]}
      />
      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item) => (
          <ChatItemView key={item.id} item={item} />
        ))}

        {predictions.length > 0 && (phase === 'select_pickup' || phase === 'select_destination') && (
          <View style={styles.suggestionsWrapper}>
            <Text style={styles.suggestionsTitle}>
              {searchingFor === 'pickup' ? 'Select Pickup Location' : 'Select Destination'}
            </Text>
            <View style={styles.suggestionsGrid}>
              {predictions.map((pred) => (
                <TouchableOpacity
                  key={pred.place_id}
                  style={styles.suggestionCard}
                  onPress={() => handleSelectPrediction(pred.description, pred.place_id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.suggestionIcon}>
                    <Ionicons name="location" size={20} color={colors.white} />
                  </View>
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionText}>{pred.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.brand} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {phase === 'loading' && (
          <LoadingStream
            items={[
              { text: 'Extracting destination…', delayMs: 500 },
              { text: 'Searching available rides…', delayMs: 600 },
              { text: 'Booking your taxi…', delayMs: 700 },
            ]}
          />
        )}

        {phase === 'card' && uberCard && (
          <View style={styles.cardContainer}>
            <RecommendationCard card={uberCard} />
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            {selectedDestination && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() =>
                  bookTaxi(selectedDestination, selectedPickup, selectedDestinationCoords, selectedPickupCoords)
                }
              >
                <Text style={styles.retryButtonText}>Try again</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {(phase === 'input' || phase === 'error') && (
        <View style={[styles.inputSection, { paddingBottom: insets.bottom }]}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Search destination…"
              value={draft}
              onChangeText={setDraft}
              placeholderTextColor="#999"
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  thread: { flex: 1 },
  threadContent: { padding: spacing.lg, paddingBottom: spacing.md },
  loadingItem: {
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  loadingText: { color: colors.textSecondary, fontSize: 14 },
  cardContainer: {
    marginVertical: spacing.md,
  },
  errorContainer: {
    marginVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: '#fff3f3',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcccc',
    gap: spacing.md,
  },
  errorText: { color: colors.brand, fontSize: 14, lineHeight: 20 },
  retryButton: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  retryButtonText: { color: colors.white, fontSize: 14, fontWeight: '600' },
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
  inputSpinner: {
    marginRight: spacing.sm,
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
  suggestionsWrapper: {
    marginVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  suggestionsGrid: {
    gap: spacing.md,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandTint,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#ffccc7',
    gap: spacing.lg,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 20,
  },
});
