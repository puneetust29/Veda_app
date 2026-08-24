import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

const STATUS_MESSAGES = [
  'Thinking…',
  'Looking into it…',
  'Pulling the details…',
  'Assembling the answer…',
  'Putting it together…',
];

type Props = {
  initialMessage?: string;
};

export default function LoadingIndicator({ initialMessage }: Props) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const statusInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 1200);

    return () => clearInterval(statusInterval);
  }, []);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => {
        if (prev.length < 0) return '•';
        return '';
      });
    }, 400);

    return () => clearInterval(dotsInterval);
  }, []);

  const statusMessage = initialMessage || STATUS_MESSAGES[messageIndex];

  return (
    <View style={styles.container}>
      <View style={styles.agentIcon}>
        <Text style={styles.agentIconText}>V</Text>
      </View>
      <View style={styles.messageBubble}>
        <Text style={styles.loadingText}>{statusMessage}{dots}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  agentIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentIconText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  messageBubble: {
    flex: 1,
    backgroundColor: '#F5DEDE',
    borderRadius: 16,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
