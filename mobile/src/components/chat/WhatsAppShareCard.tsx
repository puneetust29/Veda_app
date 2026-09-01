import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { shareToWhatsApp } from '../../lib/whatsapp';
import { brandIcons } from '../../theme';
import CardShell, { cardShellStyles } from './CardShell';

type Props = {
  text: string;
  contactName?: string;
  contactPhone?: string;
};

export default function WhatsAppShareCard({ text, contactName = 'Emergency Contact', contactPhone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!contactPhone) {
    return (
      <View style={styles.fallbackShadow}>
        <View style={styles.fallbackCard}>
          <Text style={styles.error}>Emergency contact not available</Text>
        </View>
      </View>
    );
  }

  const handleShare = async () => {
    setLoading(true);
    setError(null);
    try {
      await shareToWhatsApp(contactPhone, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CardShell
      badge={<Ionicons name="logo-whatsapp" size={20} color={brandIcons.whatsappGreen} />}
      badgeBackgroundColor="rgba(37, 211, 102, 0.08)"
      title={`Share with ${contactName}`}
      buttonLabel="Send via WhatsApp"
      onButtonPress={handleShare}
      loading={loading}
      footer={error ? <Text style={styles.error}>{error}</Text> : undefined}
    >
      <View style={cardShellStyles.divider} />
      <View style={cardShellStyles.section}>
        <Text style={cardShellStyles.sectionLabel}>Message</Text>
        <Text style={styles.messageText}>{text}</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  fallbackShadow: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    borderRadius: 24,
  },
  fallbackCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Urbanist_400Regular',
    color: '#1a1a1a',
    lineHeight: 20,
  },
  error: {
    marginBottom: 12,
    marginHorizontal: 16,
    fontSize: 12,
    color: '#d32f2f',
    fontWeight: '500',
  },
});
