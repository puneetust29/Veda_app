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
import * as Contacts from 'expo-contacts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { colors } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

interface ContactItem {
  id: string;
  name: string;
  phoneNumbers?: Array<{ number: string }>;
  emails?: Array<{ email: string }>;
}

export default function ContactsScreen(_: Props) {
  const [hasPermission, setHasPermission] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const checkPermissionAndLoad = useCallback(async () => {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      const hasAccess = status === Contacts.PermissionStatus.GRANTED;
      setHasPermission(hasAccess);

      if (hasAccess) {
        await loadContacts();
      }
    } catch (err) {
      console.warn('[Contacts] Permission check failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
        ],
      });

      if (data.length > 0) {
        const formattedContacts: ContactItem[] = data
          .filter((contact) => contact.firstName || contact.lastName)
          .map((contact) => ({
            id: contact.id,
            name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            phoneNumbers: contact.phoneNumbers as any,
            emails: contact.emails as any,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setContacts(formattedContacts);
      }
    } catch (err) {
      console.warn('[Contacts] Failed to load contacts:', err);
      Alert.alert('Error', 'Failed to load contacts');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      checkPermissionAndLoad();
    }, [checkPermissionAndLoad]),
  );

  const handleRequestPermission = async () => {
    try {
      setSyncing(true);
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === Contacts.PermissionStatus.GRANTED) {
        setHasPermission(true);
        await loadContacts();
      } else {
        Alert.alert(
          'Permission Denied',
          'Please enable Contacts access in Settings to sync your contacts.',
        );
      }
    } catch (err) {
      console.error('[Contacts] Request permission failed:', err);
      Alert.alert('Error', 'Could not request contacts permission');
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      await loadContacts();
      Alert.alert('Sync Complete', `Synced ${contacts.length} contacts`);
    } catch (err) {
      console.error('[Contacts] Sync failed:', err);
      Alert.alert('Sync Failed', 'Could not sync contacts. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (hasPermission) {
      await loadContacts();
    }
    setRefreshing(false);
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
      <Text style={styles.title}>Contacts Sync</Text>
      {!hasPermission ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Contacts not accessible</Text>
          <Text style={styles.emptyText}>
            Grant Veda access to your contacts to view and sync them for sharing trip details.
          </Text>
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={handleRequestPermission}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Grant Access</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.contactList}
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
          </View>

          {contacts.length === 0 ? (
            <Text style={styles.empty}>
              No contacts found. Check that you have contacts in your device.
            </Text>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.contactFlatList}
              renderItem={({ item }) => (
                <View style={styles.contactCard}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  {item.phoneNumbers && item.phoneNumbers.length > 0 && (
                    <Text style={styles.contactDetail}>
                      📞 {item.phoneNumbers[0].number}
                    </Text>
                  )}
                  {item.emails && item.emails.length > 0 && (
                    <Text style={styles.contactDetail}>
                      ✉️ {item.emails[0].email}
                    </Text>
                  )}
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
  contactList: {
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
  contactFlatList: {
    paddingBottom: 20,
  },
  contactCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  contactDetail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    lineHeight: 18,
  },
});
