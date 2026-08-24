import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChatItemView from '../components/ChatItemView';
import TypingIndicator from '../components/TypingIndicator';
import { useRoamingChat } from '../hooks/useRoamingChat';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

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

export default function ChatScreen({ route, navigation }: Props) {
  const { event } = route.params;
  const { items, phase, confirm, decline, retry, sendMessage, startUberLogin, pickup } = useRoamingChat(event);
  const scrollViewRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');

  const originCode = extractCode(event.origin);
  const destCode   = extractCode(event.destination);
  const originCity = cityName(event.origin);
  const destCity   = cityName(event.destination);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        <View style={styles.routeBlock}>
          <View style={styles.routeRow}>
            <Text style={styles.iata}>{originCode}</Text>
            <View style={styles.connector}>
              <View style={styles.connectorLine} />
              <Text style={styles.plane}>✈</Text>
              <View style={styles.connectorLine} />
            </View>
            <Text style={styles.iata}>{destCode}</Text>
          </View>
          <View style={styles.cityRow}>
            <Text style={styles.city}>{originCity}</Text>
            <Text style={styles.city}>{destCity}</Text>
          </View>
        </View>

        <View style={styles.dateBadge}>
          <Text style={styles.dateText}>{fmtDate(event.start_datetime)}</Text>
        </View>
      </View>

      {/* Thread */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {items.map((item) => (
          <ChatItemView
            key={item.id}
            item={item}
            onConfirm={confirm}
            onDecline={decline}
            calendarEventId={event.id}
            pickupLatitude={pickup?.latitude}
            pickupLongitude={pickup?.longitude}
            pickupLabel={pickup?.label}
            onStartUberChatLogin={startUberLogin}
          />
        ))}
        {phase === 'streaming' && <TypingIndicator />}
      </ScrollView>

      {/* Footer actions */}
      {phase === 'complete' && (
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Subscriptions')}
          >
            <Text style={styles.primaryBtnText}>View my plans</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'failed' && (
        <View style={styles.footerActions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={retry}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => navigation.replace('FlightDetail', { event })}
          >
            <Text style={styles.outlineBtnText}>Continue without chat</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask a follow-up…"
          placeholderTextColor="#ABABAB"
          value={draft}
          onChangeText={setDraft}
          editable={phase !== 'streaming'}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (phase === 'streaming' || !draft.trim()) && styles.sendBtnDisabled]}
          onPress={() => { sendMessage(draft); setDraft(''); }}
          disabled={phase === 'streaming' || !draft.trim()}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
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
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDEDEB',
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 22,
    color: '#0F0F0F',
    fontWeight: '300',
  },
  routeBlock: {
    flex: 1,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  iata: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F0F0F',
    letterSpacing: 1,
  },
  connector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  connectorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DEDEDE',
  },
  plane: {
    fontSize: 11,
    color: '#C8C8C8',
    paddingHorizontal: 5,
  },
  cityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  city: {
    fontSize: 11,
    color: '#ABABAB',
    fontWeight: '500',
  },
  dateBadge: {
    backgroundColor: '#F2F2F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B6B6B',
  },

  // Thread
  thread: { flex: 1 },
  threadContent: {
    padding: 20,
    paddingBottom: 8,
    gap: 10,
  },

  // Footer actions (complete / failed)
  footerActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDEDEB',
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: '#0F0F0F',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  outlineBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DEDEDE',
  },
  outlineBtnText: {
    color: '#0F0F0F',
    fontSize: 15,
    fontWeight: '500',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDEDEB',
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F0',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F0F0F',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#DEDEDE',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: -2,
  },
});
