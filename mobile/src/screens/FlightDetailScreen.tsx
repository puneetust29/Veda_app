import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '../lib/api';
import type { RecommendResponse, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'FlightDetail'>;

export default function FlightDetailScreen({ route, navigation }: Props) {
  const { event } = route.params;
  const [recommendation, setRecommendation] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [bookingRide, setBookingRide] = useState(false);

  const handleBookRide = async () => {
    setBookingRide(true);
    try {
      const { deep_link_url } = await api.getUberDeeplink(event.id);
      await Linking.openURL(deep_link_url);
    } catch (err) {
      Alert.alert('Could not open Uber', err instanceof Error ? err.message : String(err));
    } finally {
      setBookingRide(false);
    }
  };

  const handleRecommend = async () => {
    setLoading(true);
    setRecommendation(null);
    try {
      const result = await api.recommendRoaming(event.id);
      setRecommendation(result);
    } catch (err) {
      Alert.alert('Could not get a recommendation', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!recommendation?.candidate_plan) return;
    setSubscribing(true);
    try {
      await api.subscribeRoaming({
        calendarEventId: event.id,
        roamingPlanId: recommendation.candidate_plan.id,
        reasoning: recommendation.reasoning,
        judgeFeedback: recommendation.judge_feedback,
      });
      Alert.alert('You’re all set', `${recommendation.candidate_plan.plan_name} is now active for your trip.`, [
        { text: 'View my plans', onPress: () => navigation.replace('Subscriptions') },
      ]);
    } catch (err) {
      Alert.alert('Subscription failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.subtitle}>
        {event.origin} → {event.destination}
      </Text>
      <Text style={styles.date}>
        {new Date(event.start_datetime).toLocaleDateString()} –{' '}
        {new Date(event.end_datetime).toLocaleDateString()}
      </Text>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>You don't have a roaming plan enabled for this trip.</Text>
      </View>

      <View style={styles.rideCard}>
        <Text style={styles.sectionLabel}>Need a ride when you land?</Text>
        <Text style={styles.reasoning}>
          Book with Uber, using your current location as pickup{event.destination ? ` — set ${event.destination} as your destination once you're in the app` : ''}.
        </Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={handleBookRide} disabled={bookingRide}>
          {bookingRide ? (
            <ActivityIndicator color="#111" />
          ) : (
            <Text style={styles.buttonSecondaryText}>Book with Uber</Text>
          )}
        </TouchableOpacity>
      </View>

      {!recommendation && (
        <TouchableOpacity style={styles.button} onPress={handleRecommend} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Find me a roaming plan</Text>
          )}
        </TouchableOpacity>
      )}

      {recommendation?.candidate_plan && (
        <View style={styles.planCard}>
          <Text style={styles.planName}>{recommendation.candidate_plan.plan_name}</Text>
          <Text style={styles.planMeta}>
            {recommendation.candidate_plan.data_gb}GB · {recommendation.candidate_plan.duration_days} days ·{' '}
            {recommendation.candidate_plan.price} {recommendation.candidate_plan.currency}
          </Text>
          <Text style={styles.planDescription}>{recommendation.candidate_plan.description}</Text>

          <Text style={styles.sectionLabel}>Why the AI picked this</Text>
          <Text style={styles.reasoning}>{recommendation.reasoning}</Text>

          <Text style={styles.sectionLabel}>
            AI reviewer: {recommendation.judge_approved ? 'Approved ✅' : 'Flagged ⚠️'}
          </Text>
          <Text style={styles.reasoning}>{recommendation.judge_feedback}</Text>

          {recommendation.judge_approved ? (
            <TouchableOpacity style={styles.button} onPress={handleSubscribe} disabled={subscribing}>
              {subscribing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Subscribe with one tap</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.buttonSecondary} onPress={handleRecommend} disabled={loading}>
              <Text style={styles.buttonSecondaryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {recommendation && !recommendation.candidate_plan && (
        <Text style={styles.empty}>No suitable roaming plan could be found for this trip.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#444', marginTop: 4, fontSize: 16 },
  date: { color: '#888', marginTop: 4, fontSize: 13 },
  banner: {
    backgroundColor: '#fdecea',
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
    marginBottom: 20,
  },
  bannerText: { color: '#c0392b', fontWeight: '600' },
  rideCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#111',
  },
  buttonSecondaryText: { color: '#111', fontSize: 16, fontWeight: '600' },
  planCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
  },
  planName: { fontSize: 18, fontWeight: '700' },
  planMeta: { color: '#444', marginTop: 4 },
  planDescription: { color: '#666', marginTop: 8 },
  sectionLabel: { fontWeight: '600', marginTop: 16, marginBottom: 4 },
  reasoning: { color: '#444', lineHeight: 20 },
  empty: { color: '#666', textAlign: 'center', marginTop: 20 },
});
