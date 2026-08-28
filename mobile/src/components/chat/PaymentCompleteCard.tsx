import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../../theme';
import CheckmarkIcon from '../icons/CheckmarkIcon';
import HeaderBackground from '../icons/HeaderBackground';



type Props = {
  insuranceId?: string;
  insuranceAmount?: number;
  insuranceCurrency?: string;
  destination: string;
  cardLast4?: string;
  cardBrand?: string;
};

export default function PaymentCompleteCard({ insuranceId, insuranceAmount, insuranceCurrency, destination, cardLast4, cardBrand }: Props) {
  const totalAmount = insuranceAmount || 0;
  const currency = insuranceCurrency || '£';
  const transactionId = insuranceId || 'N/A';

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.pattern} pointerEvents="none">
          <HeaderBackground width={366} height={141} />
        </View>

        <View style={styles.headerSection}>
          <View style={styles.iconContainer}>
            <CheckmarkIcon size={24} color={colors.brand} />
          </View>
          <Text style={styles.headerTitle}>Payment Complete</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsSection}>
          {cardBrand && cardLast4 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment method</Text>
              <Text style={styles.detailValue}>
                {cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1)} •••• {cardLast4}
              </Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Transaction ID</Text>
            <Text style={styles.detailValue}>{transactionId}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {currency}{totalAmount.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 16,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 141,
    opacity: 0.16,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 40,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(230, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: '#000000',
  },
  divider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginTop: 16,
    marginBottom: 0,
  },
  detailsSection: {
    marginBottom: 0,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 24,
    marginTop: 16,
  },
  detailLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400',
    color: '#000000',
  },
  detailValue: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    color: '#000000',
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  applePayIcon: {
    width: 31,
    height: 31,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 0,
    marginTop: 12,
  },
  totalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalValue: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1a1a1a',
  },
});
