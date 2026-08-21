import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api } from '../lib/api';
import { colors } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Gmail'>;

interface GmailMessage {
  id: string;
  gmail_message_id: string;
  sender: string;
  subject: string;
  received_at: string;
  is_read: boolean;
}

export default function GmailScreen(_: Props) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const status = await api.gmailStatus();
      setConnected(status.connected);
      if (status.connected) {
        await loadMessages();
      }
    } catch (err) {
      console.warn('[Gmail] Status check failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.listGmailMessages();
      setMessages(data.messages || []);
    } catch (err) {
      console.warn('[Gmail] Failed to load messages:', err);
      Alert.alert('Error', 'Failed to load Gmail messages');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      checkStatus();
    }, [checkStatus]),
  );

  const handleConnect = async () => {
    try {
      setSyncing(true);
      const deepLink = Linking.createURL('gmail');
      const response = await api.startGmailAuth(deepLink);
      const { authorization_url } = response;

      const result = await WebBrowser.openAuthSessionAsync(
        authorization_url,
        deepLink,
        { dismissButtonStyle: 'cancel' },
      );

      if (result.type === 'success') {
        await checkStatus();
      }
    } catch (err) {
      console.error('[Gmail] Auth failed:', err);
      Alert.alert('Connection Failed', 'Could not connect to Gmail. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const result = await api.syncGmail();
      Alert.alert('Sync Complete', `Synced ${result.synced} emails`);
      await loadMessages();
    } catch (err) {
      console.error('[Gmail] Sync failed:', err);
      Alert.alert('Sync Failed', 'Could not sync Gmail messages. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect Gmail?', 'This will remove your Gmail connection from Veda.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.disconnectGmail();
            setConnected(false);
            setMessages([]);
          } catch (err) {
            console.error('[Gmail] Disconnect failed:', err);
            Alert.alert('Error', 'Failed to disconnect Gmail');
          }
        },
      },
    ]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (connected) {
      await loadMessages();
    } else {
      await checkStatus();
    }
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.brand} style={styles.loading} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gmail Inbox</Text>
      {!connected ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Gmail not connected</Text>
          <Text style={styles.emptyText}>
            Connect your Gmail account to view and sync your inbox.
          </Text>
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={handleConnect}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Connect Gmail</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.messageList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.controls}>
            <Pressable
              style={[styles.button, styles.syncButton]}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Text style={styles.syncButtonText}>Sync Now</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.button, styles.disconnectButton]}
              onPress={handleDisconnect}
              disabled={syncing}
            >
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </Pressable>
          </View>

          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages synced yet. Tap "Sync Now" to fetch emails.</Text>
          ) : (
            <FlatList
              data={messages}
              keyExtractor={(item) => item.gmail_message_id}
              scrollEnabled={false}
              contentContainerStyle={styles.messageFlatList}
              renderItem={({ item }) => (
                <View style={[styles.messageCard, !item.is_read && styles.unreadCard]}>
                  <View style={styles.messageHeader}>
                    <Text style={[styles.sender, !item.is_read && styles.unreadText]}>
                      {item.sender || 'Unknown sender'}
                    </Text>
                    <Text style={styles.date}>{formatDate(item.received_at)}</Text>
                  </View>
                  <Text
                    style={[styles.subject, !item.is_read && styles.unreadText]}
                    numberOfLines={2}
                  >
                    {item.subject || '(no subject)'}
                  </Text>
                </View>
              )}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 20,
    color: '#000',
  },
  loading: {
    marginTop: 40,
  },
  emptyState: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
    fontSize: 14,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  controls: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    gap: 10,
    marginBottom: 20,
    marginTop: 20,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.brand,
    marginHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  syncButton: {
    flex: 1,
    backgroundColor: colors.brand,
  },
  syncButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  disconnectButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  disconnectButtonText: {
    color: '#d32f2f',
    fontWeight: '600',
    fontSize: 14,
  },
  messageFlatList: {
    paddingBottom: 20,
  },
  messageCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  unreadCard: {
    backgroundColor: '#f0f7ff',
    borderColor: colors.brand,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sender: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  unreadText: {
    fontWeight: '700',
    color: colors.brand,
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  subject: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
});
