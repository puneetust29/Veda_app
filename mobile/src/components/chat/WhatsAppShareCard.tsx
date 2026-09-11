import { useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { shareToWhatsApp } from '../../lib/whatsapp';
import { brandIcons, colors, spacing, radii, typography } from '../../theme';
import CardShell, { cardShellStyles } from './CardShell';
import type { MessageTone } from '../../config/messageTemplates';

type Props = {
  text: string;
  contactName?: string;
  contactPhone?: string;
  messageType?: 'trip_notification' | 'emergency_alert' | 'request_favor' | 'casual_update' | 'formal_notice';
  tripData?: {
    travelerName: string;
    destination: string;
    startDate: string;
    endDate: string;
    travelers: string;
  };
};

const AVAILABLE_TONES: MessageTone[] = ['informal', 'formal', 'friendly'];

export default function WhatsAppShareCard({
  text: initialText,
  contactName = 'Emergency Contact',
  contactPhone,
  messageType = 'trip_notification',
  tripData,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<MessageTone>('informal');
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const currentText = useMemo(() => {
    if (!tripData) return initialText;

    const { messageAgent } = require('../../services/messageAgent');
    try {
      const message = messageAgent.generateMessage({
        type: messageType,
        tone: selectedTone,
        contactName: contactName,
        tripData,
      });
      return message.text;
    } catch {
      return initialText;
    }
  }, [selectedTone, tripData, messageType, initialText, contactName]);

  if (!contactPhone) {
    return (
      <View style={styles.fallbackShadow}>
        <View style={styles.fallbackCard}>
          <Text style={styles.error}>Emergency contact not available</Text>
        </View>
      </View>
    );
  }

  const messageToSend = editedMessage || currentText;

  const handleToneChange = (tone: MessageTone) => {
    setSelectedTone(tone);
    setEditedMessage(null); // Reset edits when tone changes
  };

  const handleShare = async () => {
    setLoading(true);
    setError(null);
    try {
      await shareToWhatsApp(contactPhone, messageToSend);
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
      {tripData && (
        <>
          <View style={cardShellStyles.section}>
            <Text style={cardShellStyles.sectionLabel}>Tone</Text>
            <View style={styles.toneContainer}>
              {AVAILABLE_TONES.map((tone) => (
                <Pressable
                  key={tone}
                  onPress={() => handleToneChange(tone)}
                  style={[styles.toneButton, selectedTone === tone && styles.toneButtonActive]}
                >
                  <Text
                    style={[
                      styles.toneButtonText,
                      selectedTone === tone && styles.toneButtonTextActive,
                    ]}
                  >
                    {tone.charAt(0).toUpperCase() + tone.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={cardShellStyles.divider} />
        </>
      )}
      <View style={cardShellStyles.section}>
        <Text style={cardShellStyles.sectionLabel}>Message</Text>
        <View style={styles.messageInputContainer}>
          <TextInput
            style={[styles.messageInput, isInputFocused && styles.messageInputFocused]}
            placeholder="Edit your message..."
            placeholderTextColor={colors.textDisabled}
            value={messageToSend}
            onChangeText={setEditedMessage}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            multiline
            editable={!loading}
            textAlignVertical="top"
          />
          <Text style={styles.editHint}>tap to edit</Text>
        </View>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  fallbackShadow: {
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    borderRadius: radii.xl,
  },
  fallbackCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  messageText: {
    ...typography.caption,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  messageInputContainer: {
    position: 'relative',
  },
  messageInput: {
    ...typography.caption,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 100,
    lineHeight: 20,
  },
  messageInputFocused: {
    backgroundColor: colors.white,
    borderColor: colors.brand,
  },
  editHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  error: {
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    ...typography.small,
    color: '#d32f2f',
  },
  toneContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  toneButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.neutralFillLight,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  toneButtonActive: {
    backgroundColor: colors.accentCta,
    borderColor: colors.accentCta,
  },
  toneButtonText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  toneButtonTextActive: {
    color: colors.white,
  },
});
