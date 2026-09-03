import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme';

type Props = {
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
  transactionId?: string;
  amount: number;
  currency: string;
};

export default function PaymentCompleteCard({
  paymentMethodBrand,
  paymentMethodLast4,
  transactionId,
  amount,
  currency,
}: Props) {
  return (
    <View style={styles.card}>
      {/* Header with checkmark */}
      <View style={styles.headerSection}>
        <View style={styles.checkmarkCircle}>
          <Ionicons name="checkmark" size={32} color="white" />
        </View>
        <Text style={styles.title}>Payment Complete</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Payment Method */}
      {paymentMethodBrand && paymentMethodLast4 && (
        <View style={styles.detailRow}>
          <Text style={styles.label}>Payment method</Text>
          <View style={styles.valueRow}>
            <Ionicons name="card" size={16} color={colors.textPrimary} />
            <Text style={styles.value}>
              {paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1)} •••• {paymentMethodLast4}
            </Text>
          </View>
        </View>
      )}

      {/* Transaction ID */}
      {transactionId && (
        <>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.label}>Transaction ID</Text>
            <Text style={styles.value}>{transactionId}</Text>
          </View>
        </>
      )}

      {/* Total */}
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>
          {currency}{amount.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.lg,
    marginVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerSection: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  checkmarkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E60000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  label: {
    fontFamily: fonts.bodyLight,
    fontSize: 14,
    color: colors.textSecondary,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  totalLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  totalAmount: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
});
