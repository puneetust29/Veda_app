import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { CalendarEvent, RootStackParamList } from '../types';
import { useFocusEffect } from '@react-navigation/native';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    const data = await api.listCalendarEvents();
    setEvents(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadEvents().finally(() => setLoading(false));
    }, [loadEvents]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const upcomingFlights = events.filter((event) => event.event_type === 'flight');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upcoming trips</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('Subscriptions')}>
            <Text style={styles.link}>My plans</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut}>
            <Text style={styles.link}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={upcomingFlights}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No upcoming flights found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('FlightDetail', { event: item })}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>
                {item.origin} → {item.destination}
              </Text>
              <Text style={styles.cardDate}>
                {new Date(item.start_datetime).toLocaleDateString()} –{' '}
                {new Date(item.end_datetime).toLocaleDateString()}
              </Text>
              <Text style={styles.cardCta}>Roaming not enabled for this trip →</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerActions: { flexDirection: 'row', gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  link: { color: '#0a66c2', fontSize: 14, marginLeft: 16 },
  loading: { marginTop: 40 },
  list: { padding: 20, gap: 12 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardSubtitle: { color: '#444', marginTop: 4 },
  cardDate: { color: '#888', marginTop: 4, fontSize: 13 },
  cardCta: { color: '#c0392b', marginTop: 10, fontWeight: '600', fontSize: 13 },
});
