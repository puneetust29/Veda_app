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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { CalendarEvent, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

// Known city names by IATA code — used to show a human city label under the code.
const CITY_BY_CODE: Record<string, string> = {
  SEA: 'Seattle', JFK: 'New York', LAX: 'Los Angeles', ORD: 'Chicago',
  DFW: 'Dallas', MIA: 'Miami', BOS: 'Boston', SFO: 'San Francisco',
  ATL: 'Atlanta', DEN: 'Denver', LHR: 'London', LGW: 'London',
  CDG: 'Paris', NRT: 'Tokyo', RAK: 'Marrakesh', FRA: 'Frankfurt',
};

function extractCode(label: string | null): string {
  if (!label) return '---';
  const match = label.match(/\(([A-Z]{3})\)/);
  if (match) return match[1];
  // bare three-letter code
  if (/^[A-Z]{3}$/.test(label.trim())) return label.trim();
  return label.slice(0, 3).toUpperCase();
}

function cityName(label: string | null): string {
  const code = extractCode(label);
  return CITY_BY_CODE[code] ?? code;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type CardProps = { event: CalendarEvent; onPress: () => void };

function FlightCard({ event, onPress }: CardProps) {
  const originCode = extractCode(event.origin);
  const destCode   = extractCode(event.destination);
  const originCity = cityName(event.origin);
  const destCity   = cityName(event.destination);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.72}>
      {/* Route */}
      <View style={styles.routeRow}>
        <View style={styles.endpoint}>
          <Text style={styles.iata}>{originCode}</Text>
          <Text style={styles.city}>{originCity}</Text>
        </View>

        <View style={styles.connector}>
          <View style={styles.connectorLine} />
          <Text style={styles.plane}>✈</Text>
          <View style={styles.connectorLine} />
        </View>

        <View style={[styles.endpoint, styles.endpointRight]}>
          <Text style={styles.iata}>{destCode}</Text>
          <Text style={styles.city}>{destCity}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.tripDate}>{fmtDate(event.start_datetime)}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const [events, setEvents]       = useState<CalendarEvent[]>([]);
  const [loading, setLoading]     = useState(true);
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

  const flights = events.filter((e) => e.event_type === 'flight');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>VEDA</Text>
          <Text style={styles.pageTitle}>Upcoming trips</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.pill}
            onPress={() => navigation.navigate('Subscriptions')}
          >
            <Text style={styles.pillText}>My plans</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill} onPress={signOut}>
            <Text style={styles.pillText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#0F0F0F" />
      ) : (
        <FlatList
          data={flights}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0F0F0F"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No upcoming flights</Text>
              <Text style={styles.emptyBody}>Check back when you have a trip planned.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <FlightCard
              event={item}
              onPress={() => navigation.navigate('Chat', { event: item })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  brand: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.5,
    color: '#ABABAB',
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0F0F0F',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#EBEBEB',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F0F0F',
  },

  loader: { marginTop: 64 },

  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },

  // Flight card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  endpoint: {
    alignItems: 'flex-start',
  },
  endpointRight: {
    alignItems: 'flex-end',
  },
  iata: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F0F0F',
    letterSpacing: 1.5,
  },
  city: {
    fontSize: 11,
    color: '#ABABAB',
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.2,
  },

  connector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  connectorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DEDEDE',
  },
  plane: {
    fontSize: 13,
    color: '#C8C8C8',
    paddingHorizontal: 7,
    marginTop: -1,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
    paddingVertical: 14,
  },
  tripDate: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8C8C8C',
  },
  chevron: {
    fontSize: 22,
    color: '#D0D0D0',
  },

  // Empty state
  empty: {
    marginTop: 100,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F0F0F',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#ABABAB',
    textAlign: 'center',
    lineHeight: 21,
  },
});
