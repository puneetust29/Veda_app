import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../lib/api';
import type { CalendarEvent, Subscription } from '../types';

type FlightPlan = {
  eventId: string;
  event: CalendarEvent;
  roamingPlan: Subscription | null;
  insurancePlan: any | null;
};

export default function SubscriptionsScreen() {
  const [flightPlans, setFlightPlans] = useState<FlightPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [subscriptions, events, insuranceStatus] = await Promise.all([
        api.listSubscriptions(),
        api.listCalendarEvents(),
        api.getActiveInsurance(),
      ]);

      // Group by calendar event
      const plansMap = new Map<string, FlightPlan>();

      // Add roaming subscriptions
      subscriptions.forEach((sub) => {
        if (sub.status === 'active' && sub.calendar_events) {
          const eventId = sub.calendar_event_id;
          if (!plansMap.has(eventId)) {
            plansMap.set(eventId, {
              eventId,
              event: sub.calendar_events,
              roamingPlan: sub,
              insurancePlan: null,
            });
          } else {
            const existing = plansMap.get(eventId)!;
            existing.roamingPlan = sub;
          }
        }
      });

      // Add insurance purchases
      insuranceStatus.purchases.forEach((insurance) => {
        const eventId = insurance.calendar_event_id;
        const event = events.find((e) => e.id === eventId);
        if (event) {
          if (!plansMap.has(eventId)) {
            plansMap.set(eventId, {
              eventId,
              event,
              roamingPlan: null,
              insurancePlan: insurance,
            });
          } else {
            const existing = plansMap.get(eventId)!;
            existing.insurancePlan = insurance;
          }
        }
      });

      setFlightPlans(Array.from(plansMap.values()));
    } catch (err) {
      console.warn('Failed to load plans', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My plans</Text>
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={flightPlans}
          keyExtractor={(item) => item.eventId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No plans activated yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.event.title}</Text>
              <Text style={styles.cardRoute}>
                {item.event.origin} → {item.event.destination}
              </Text>
              <Text style={styles.cardDate}>
                {new Date(item.event.start_datetime).toLocaleDateString()}
              </Text>

              <View style={styles.servicesContainer}>
                {item.roamingPlan && (
                  <View style={styles.serviceSection}>
                    <Text style={styles.serviceTitle}>✓ Roaming</Text>
                    <Text style={styles.serviceName}>{item.roamingPlan.roaming_plans?.plan_name}</Text>
                    <Text style={styles.serviceDetail}>
                      {item.roamingPlan.roaming_plans?.data_gb === 999
                        ? 'Unlimited data'
                        : `${item.roamingPlan.roaming_plans?.data_gb}GB data`}
                    </Text>
                    {item.roamingPlan.roaming_plans?.price ? (
                      <Text style={styles.servicePrice}>
                        €{item.roamingPlan.roaming_plans.price.toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                )}

                {item.insurancePlan && (
                  <View style={styles.serviceSection}>
                    <Text style={styles.serviceTitle}>✓ Insurance</Text>
                    <Text style={styles.serviceName}>{item.insurancePlan.plan_details?.planName}</Text>
                    <Text style={styles.serviceDetail}>
                      {item.insurancePlan.plan_details?.coverageStart} to{' '}
                      {item.insurancePlan.plan_details?.coverageEnd}
                    </Text>
                    <Text style={styles.servicePrice}>
                      {item.insurancePlan.plan_details?.currency}{' '}
                      {item.insurancePlan.plan_details?.premiumAmount?.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  loading: { marginTop: 40 },
  list: { padding: 20 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  cardRoute: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  cardDate: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  servicesContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  serviceSection: {
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0a7a3f',
    marginBottom: 4,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  serviceDetail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  servicePrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0a7a3f',
    marginTop: 4,
  },
});
