import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChatItemView from '../components/ChatItemView';
import { useRoamingChat } from '../hooks/useRoamingChat';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
  const { event } = route.params;
  const { items, phase, confirm, decline, retry } = useRoamingChat(event);
  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.tripHeader}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.subtitle}>
          {event.origin} → {event.destination}
        </Text>
        <Text style={styles.date}>
          {new Date(event.start_datetime).toLocaleDateString()} –{' '}
          {new Date(event.end_datetime).toLocaleDateString()}
        </Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item) => (
          <ChatItemView key={item.id} item={item} onConfirm={confirm} onDecline={decline} />
        ))}
      </ScrollView>

      {phase === 'complete' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Subscriptions')}>
            <Text style={styles.primaryButtonText}>View my plans</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'failed' && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={retry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.replace('FlightDetail', { event })}
          >
            <Text style={styles.secondaryButtonText}>Continue without chat</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tripHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#444', marginTop: 4, fontSize: 15 },
  date: { color: '#888', marginTop: 2, fontSize: 13 },
  thread: { flex: 1 },
  threadContent: { padding: 20, paddingBottom: 12 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#111',
  },
  secondaryButtonText: { color: '#111', fontSize: 16, fontWeight: '600' },
});
