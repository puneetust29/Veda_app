import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { shareToWhatsApp } from '../../lib/whatsapp';
import { VEDA_CONTACT } from '../../config/vedaContact';
import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  text: string;
};

export default function WhatsAppShareCard({ text }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    setLoading(true);
    setError(null);
    try {
      await shareToWhatsApp(VEDA_CONTACT.phoneNumberE164, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Share with {VEDA_CONTACT.name}</Text>
        <Text style={styles.draftText}>{text}</Text>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>Send via WhatsApp</Text>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: '#f0f8ff',
    borderRadius: radii.md,
    borderLeftWidth: 4,
    borderLeftColor: '#25d366',
    padding: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  draftText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: '#25d366',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    marginTop: spacing.md,
    fontSize: 12,
    color: '#d32f2f',
  },
});
