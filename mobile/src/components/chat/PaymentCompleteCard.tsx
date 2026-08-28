import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme';
import type { Subscription } from '../../types';

type Props = {
  roamingSubscription?: Subscription;
  destination: string;
};

export default function PaymentCompleteCard({ roamingSubscription, destination }: Props) {
  const totalAmount = roamingSubscription?.roaming_plans?.price || 0;
  const currency = roamingSubscription?.roaming_plans?.currency || '£';
  const transactionId = roamingSubscription?.id || 'N/A';
  const cardLast4 = '4471';
  const cardBrand = 'Visa';

  return (
    <View style={styles.card}>
      <View style={styles.headerSection}>
        <View style={styles.checkmarkIcon}>
          <Ionicons name="checkmark" size={32} color={colors.white} />
        </View>
        <Text style={styles.headerTitle}>Payment Complete</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailsSection}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment method</Text>
          <Text style={styles.detailValue}>
            {cardBrand} •••• {cardLast4}
          </Text>
        </View>

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

      <View style={styles.confirmationSection}>
        <Text style={styles.confirmationText}>
          Everything's taken care of — you're all set for {destination}.
        </Text>
      </View>

      <View style={styles.checklistSection}>
        <Text style={styles.checklistTitle}>
          You are all set for your {destination} Trip!
        </Text>

        <View style={styles.checklistItem}>
          <View style={styles.checkmark}>
            <Ionicons name="checkmark" size={16} color={colors.white} />
          </View>
          <Text style={styles.checklistLabel}>Roaming</Text>
        </View>

        <View style={styles.checklistItem}>
          <View style={styles.checkmark}>
            <Ionicons name="checkmark" size={16} color={colors.white} />
          </View>
          <Text style={styles.checklistLabel}>Travel Insurance</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  checkmarkIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    color: '#000000',
  },
  divider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginVertical: 16,
  },
  detailsSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '400',
    color: '#999999',
  },
  detailValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  totalValue: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  confirmationSection: {
    backgroundColor: 'rgba(230, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 20,
  },
  confirmationText: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: '#1a1a1a',
  },
  checklistSection: {
    backgroundColor: 'rgba(230, 0, 0, 0.03)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  checklistTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checklistLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
