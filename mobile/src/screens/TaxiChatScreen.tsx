import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import ChatItemView from '../components/chat/ChatItemView';
import RecommendationCard from '../components/chat/RecommendationCard';
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete';
import { api } from '../lib/api';
import { loadToken } from '../lib/authToken';
import { nextId } from '../lib/chatThread';
import type { RecommendationCardPayload, RootStackParamList, ChatItem } from '../types';
import { colors, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TaxiChat'>;

type ScreenPhase = 'input' | 'loading' | 'card' | 'error';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function TaxiChatScreen({ navigation }: Props) {
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
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { predictions, loading: autocompleteLoading, search } = usePlacesAutocomplete();

  const handleDestinationSearch = (text: string) => {
    setDraft(text);
  };

  const handleSendMessage = async () => {
    if (!draft.trim()) return;

    const messageToExtract = draft;
    try {
      setPhase('loading');
      setDraft('');

      const result = await api.extractDestination(messageToExtract);

      if (!result.destination) {
        setErrorMessage('Could not extract destination from message. Try mentioning a city name.');
        setPhase('error');
        return;
      }

      if (__DEV__) console.log('[TaxiChat] Extracted destination:', result.destination);
      search(result.destination);
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
    setSelectedDestination(description);
    setPhase('loading');
    setErrorMessage('');

    setItems((prev) => [
      ...prev,
      { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text: description },
    ]);

    try {
      const token = await loadToken();
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams({ destination: description });
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
        pickup_label: 'Current location',
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
      if (__DEV__) console.error('[TaxiChat] Deeplink error:', err);
    }
  };

  const handleRetry = async () => {
    if (!selectedDestination) return;
    await handleSelectPrediction(selectedDestination);
  };

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [items, phase]);

  const [displayPredictions, setDisplayPredictions] = useState<typeof predictions>([]);
  useEffect(() => {
    if (__DEV__) console.log('[TaxiChat] Predictions updated:', predictions);
    setDisplayPredictions(predictions);
    if (predictions.length > 0 && phase === 'loading') {
      setPhase('input');
    }
  }, [predictions, phase]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item) => (
          <ChatItemView key={item.id} item={item} />
        ))}

        {phase === 'loading' && (
          <View style={styles.loadingItem}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.loadingText}>Booking your taxi…</Text>
          </View>
        )}

        {phase === 'card' && uberCard && (
          <View style={styles.cardContainer}>
            <RecommendationCard card={uberCard} />
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {phase === 'input' && (
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

          {displayPredictions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {displayPredictions.map((pred) => (
                <TouchableOpacity
                  key={pred.place_id}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectPrediction(pred.description)}
                >
                  <Text style={styles.suggestionText}>{pred.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  suggestionsContainer: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  suggestionRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suggestionText: { fontSize: 14, color: '#1f1f1f', fontWeight: '500' },
});
