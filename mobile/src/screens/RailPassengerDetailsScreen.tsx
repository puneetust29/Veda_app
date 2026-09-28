import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { RootStackParamList } from '../types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RailPassengerDetails'>;

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

function formatTime(dt: string): string {
  return dt.slice(11, 16);
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
}

export default function RailPassengerDetailsScreen({ route, navigation }: Props) {
  const { offerId, price, originName, destinationName, departureAt, arrivalAt, operator, passengers } = route.params;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [loading, setLoading] = useState(false);

  const canBook = firstName.trim() && lastName.trim() && email.trim() && tel.trim();

  const handleBook = async () => {
    if (!canBook) return;
    setLoading(true);
    try {
      // Step 1: createBooking
      const bookingRes = await fetch(`${API_BASE}/rail/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_ids: [offerId], currency: price.currency }),
      });
      if (!bookingRes.ok) throw new Error('Failed to create booking');
      const booking = await bookingRes.json();

      // Step 2: updateBooking with passenger details
      const updateRes = await fetch(`${API_BASE}/rail/bookings/${booking.id}/passengers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          tel: tel.trim(),
        }),
      });
      if (!updateRes.ok) throw new Error('Failed to update passenger details');

      // Step 3: createOrder
      const orderRes = await fetch(`${API_BASE}/rail/bookings/${booking.id}/order`, {
        method: 'POST',
      });
      if (!orderRes.ok) throw new Error('Failed to create order');
      const order = await orderRes.json();

      // Step 4: finalizeOrder (deducts Wallet, issues ticket)
      const finalRes = await fetch(`${API_BASE}/rail/orders/${order.id}/finalize`, {
        method: 'POST',
      });
      if (!finalRes.ok) throw new Error('Failed to finalize order');
      const finalOrder = await finalRes.json();

      navigation.replace('RailBookingConfirmation', {
        reference: finalOrder.reference ?? order.reference,
        price,
        originName,
        destinationName,
        departureAt,
        arrivalAt,
        operator,
        passengerName: `${firstName.trim()} ${lastName.trim()}`,
      });
    } catch (e: any) {
      Alert.alert('Booking failed', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Journey summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryRoute}>{originName} → {destinationName}</Text>
          <Text style={styles.summaryMeta}>{formatTime(departureAt)} – {formatTime(arrivalAt)} · {operator}</Text>
          <Text style={styles.summaryPrice}>{formatPrice(price.amount, price.currency)}</Text>
        </View>

        {/* Passenger fields */}
        <Text style={styles.sectionTitle}>Passenger details</Text>

        <Text style={styles.label}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Phone number</Text>
        <TextInput
          style={styles.input}
          value={tel}
          onChangeText={setTel}
          placeholder="+44 7700 900000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
        />

        <TouchableOpacity
          style={[styles.bookBtn, (!canBook || loading) && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={!canBook || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.bookBtnText}>
              Confirm & pay {formatPrice(price.amount, price.currency)}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Payment is deducted from your Veda wallet. Tickets are non-refundable for GB domestic routes.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  summaryRoute: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  summaryMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  summaryPrice: { fontSize: 18, fontWeight: '700', color: colors.brand, marginTop: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  bookBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  bookBtnDisabled: { opacity: 0.4 },
  bookBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  disclaimer: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
});
