import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  roamingTotal: number;
};

const INSURANCE_PRICE = 59;

export default function PaymentSummaryCard({ roamingTotal }: Props) {
  const total = roamingTotal + INSURANCE_PRICE;

  return (
    <View style={styles.card}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Summary</Text>

        <SummaryItem
          label="8-day Around the World Extra"
          sublabel="Vodafone | Emily + Sophia + Oliver"
          price={roamingTotal}
        />

        <SummaryItem
          label="Family Travel Insurance"
          sublabel="Allianz Assistance | All travellers"
          price={INSURANCE_PRICE}
        />
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalPrice}>£{total.toFixed(2)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paying with</Text>
        <View style={styles.paymentMethod}>
          <Ionicons name="card" size={20} color={colors.brand} />
          <Text style={styles.paymentText}>Visa •••• 4471</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What happens next?</Text>

        <InfoItem
          title="Roaming"
          details="Charged on 12th August | Activates automatically"
        />
        <InfoItem
          title="Travel insurance"
          details="Charged immediately | Cover starts as soon as you buy"
        />

        <Text style={styles.noticeText}>
          Your policy documents will be available on Veda and sent via email after payment
        </Text>
      </View>

    </View>
  );
}

function SummaryItem({
  label,
  sublabel,
  price,
}: {
  label: string;
  sublabel: string;
  price: number;
}) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summarySublabel}>{sublabel}</Text>
      </View>
      <Text style={styles.summaryPrice}>£{price.toFixed(2)}</Text>
    </View>
  );
}

function InfoItem({ title, details }: { title: string; details: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoDetails}>{details}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary,
    borderBottomOpacity: 0.1,
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  summarySublabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  summaryPrice: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopWidth: 2,
    borderTopColor: colors.textSecondary,
    borderTopOpacity: 0.2,
    borderBottomWidth: 2,
    borderBottomColor: colors.textSecondary,
    borderBottomOpacity: 0.2,
  },
  totalLabel: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
  },
  totalPrice: {
    ...typography.sectionTitle,
    color: colors.brand,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: '#F5DEDE',
    borderRadius: 12,
  },
  paymentText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  infoItem: {
    marginBottom: spacing.md,
  },
  infoTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  infoDetails: {
    ...typography.small,
    color: colors.textSecondary,
  },
  noticeText: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  viewOptionsButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  viewOptionsText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.brand,
  },
});
