import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../../theme';
import CheckmarkIcon from '../icons/CheckmarkIcon';
import { api } from '../../lib/api';
import VisaLogo from '../../../assets/payment/visa.svg';
import MastercardLogo from '../../../assets/payment/mastercard.svg';
import AmexLogo from '../../../assets/payment/amex.svg';


type BrandLogoConfig = {
  Logo: React.ComponentType<any>;
  width: number;
  height: number;
};

const PAYMENT_BRAND_LOGOS: Record<string, BrandLogoConfig> = {
  visa: { Logo: VisaLogo, width: 48, height: 16 },
  mastercard: { Logo: MastercardLogo, width: 52, height: 34 },
  'master card': { Logo: MastercardLogo, width: 52, height: 34 },
  amex: { Logo: AmexLogo, width: 52, height: 34 },
  'american express': { Logo: AmexLogo, width: 52, height: 34 },
};

// Kept in sync with BillPaymentCard's map so a bill's currency renders the
// same symbol on both the payment card and this completion card.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
};


type Props = {
  insuranceId?: string;
  insuranceAmount?: number;
  insuranceCurrency?: string;
  cardLast4?: string;
  cardBrand?: string;
};

export default function PaymentCompleteCard({ insuranceId, insuranceAmount, insuranceCurrency, cardLast4, cardBrand }: Props) {
  const [paymentMethodBrand, setPaymentMethodBrand] = useState(cardBrand);
  const [paymentMethodLast4, setPaymentMethodLast4] = useState(cardLast4);

  useEffect(() => {
    if (!cardBrand || !cardLast4) {
      const fetchPaymentMethod = async () => {
        try {
          const response = await api.getCustomerPaymentMethods();
          if (!cardBrand) setPaymentMethodBrand(response.brand ?? undefined);
          if (!cardLast4) setPaymentMethodLast4(response.last4 ?? undefined);
        } catch (err) {
          if (__DEV__) console.debug('Payment method fetch failed:', err);
        }
      };
      fetchPaymentMethod();
    }
  }, [cardBrand, cardLast4]);

  const totalAmount = insuranceAmount || 0;
  const currency = CURRENCY_SYMBOLS[insuranceCurrency || ''] || insuranceCurrency || '£';
  const transactionId = insuranceId || 'N/A';
  const normalizedBrand = (paymentMethodBrand || '').trim().toLowerCase();
  const brandConfig = PAYMENT_BRAND_LOGOS[normalizedBrand];

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.headerSection}>
          <View style={styles.iconContainer}>
            <CheckmarkIcon size={24} color="#f00405" />
          </View>
          <Text style={styles.headerTitle}>Payment Complete</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsSection}>
          {paymentMethodBrand && paymentMethodLast4 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment method</Text>
              <View style={styles.paymentMethodValue}>
                {brandConfig && (
                  <View style={styles.paymentBrandWrap}>
                    <brandConfig.Logo width={brandConfig.width} height={brandConfig.height} />
                  </View>
                )}
                <Text style={styles.detailValue}>
                  {paymentMethodBrand.charAt(0).toUpperCase() + paymentMethodBrand.slice(1)} •••• {paymentMethodLast4}
                </Text>
              </View>
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
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 20,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
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
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
    color: '#181818',
  },
  detailValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: '#181818',
  },
  paymentMethodValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentBrandWrap: {
    width: 52,
    minHeight: 18,
    alignItems: 'flex-start',
    justifyContent: 'center',
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
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: '#6b7075',
  },
  totalValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
});
