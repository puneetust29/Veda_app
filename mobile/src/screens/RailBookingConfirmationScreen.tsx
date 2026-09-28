import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RootStackParamList } from '../types';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RailBookingConfirmation'>;

function formatTime(dt: string): string {
  return dt.slice(11, 16);
}

function formatDate(dt: string): string {
  return dt.slice(0, 10);
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
}

export default function RailBookingConfirmationScreen({ route, navigation }: Props) {
  const { reference, price, originName, destinationName, departureAt, arrivalAt, operator, passengerName } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>🎟</Text>
      </View>

      <Text style={styles.heading}>Booking confirmed!</Text>
      <Text style={styles.subheading}>Your ticket has been issued.</Text>

      <View style={styles.card}>
        <Row label="Reference" value={reference} highlight />
        <Divider />
        <Row label="Route" value={`${originName} → ${destinationName}`} />
        <Row label="Date" value={formatDate(departureAt)} />
        <Row label="Departure" value={formatTime(departureAt)} />
        <Row label="Arrival" value={formatTime(arrivalAt)} />
        <Row label="Operator" value={operator} />
        <Divider />
        <Row label="Passenger" value={passengerName} />
        <Row label="Total paid" value={formatPrice(price.amount, price.currency)} highlight />
      </View>

      <Text style={styles.note}>
        Your ticket details have been sent to your email. Show your booking reference at the station.
      </Text>

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, highlight && rowStyles.highlight]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm }} />;
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 13, color: colors.textSecondary },
  value: { fontSize: 13, color: colors.textPrimary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  highlight: { color: colors.brand, fontSize: 15 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  icon: { fontSize: 32 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subheading: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.lg },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  note: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  doneBtn: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
