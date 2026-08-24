import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

type SourceType = 'google' | 'device' | 'gmail' | 'mock';

interface SourceBadgeProps {
  source: SourceType;
}

const SOURCE_CONFIG: Record<SourceType, { label: string; icon: string; color: string }> = {
  google: { label: 'Google Calendar', icon: '📅', color: colors.link },
  device: { label: 'Device Calendar', icon: '📱', color: colors.success },
  gmail: { label: 'Gmail', icon: '✉️', color: '#EA4335' },
  mock: { label: 'Mock Data', icon: '🔧', color: colors.textMuted },
};

export default function SourceBadge({ source }: SourceBadgeProps) {
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.mock;

  return (
    <View style={styles.badge}>
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  icon: {
    fontSize: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
