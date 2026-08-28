import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import type { TransportResultPayload } from '../../types';

// TfL severity ≥ 9 = "Good Service"; lower = disruption
const DISRUPTION_THRESHOLD = 9;

const MODE_ICONS: Record<string, string> = {
  tube: '🚇',
  'elizabeth-line': '🟣',
  dlr: '🚈',
  overground: '🚆',
  bus: '🚌',
  walking: '🚶',
  'national-rail': '🚆',
  default: '🚌',
};

function modeIcon(mode: string): string {
  return MODE_ICONS[mode] ?? MODE_ICONS.default;
}

interface Props {
  transport: TransportResultPayload;
}

export default function TransportStatusCard({ transport }: Props) {
  const disrupted = transport.line_statuses.filter((s) => s.severity < DISRUPTION_THRESHOLD);
  const allGood = disrupted.length === 0;

  const directionLabel =
    transport.direction === 'from_london'
      ? `To ${transport.airport ?? 'the airport'}`
      : transport.direction === 'to_london'
        ? `From ${transport.airport ?? 'the airport'} to London`
        : 'London Transport';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🚇</Text>
        <Text style={styles.title}>{directionLabel}</Text>
      </View>

      {transport.summary ? (
        <Text style={styles.summary}>{transport.summary}</Text>
      ) : null}

      {/* Line status */}
      {transport.line_statuses.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line Status</Text>
          {transport.line_statuses.map((line) => {
            const isDisrupted = line.severity < DISRUPTION_THRESHOLD;
            return (
              <View key={line.line_name} style={styles.lineRow}>
                <View style={[styles.statusDot, { backgroundColor: isDisrupted ? '#e53935' : '#43a047' }]} />
                <View style={styles.lineInfo}>
                  <Text style={styles.lineName}>{line.line_name}</Text>
                  <Text style={[styles.lineStatus, isDisrupted && styles.lineStatusDisrupted]}>
                    {line.status}
                  </Text>
                  {line.disruption ? (
                    <Text style={styles.lineDisruption} numberOfLines={2}>
                      {line.disruption}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
          {allGood && (
            <Text style={styles.allGoodNote}>All lines running normally</Text>
          )}
        </View>
      )}

      {/* Journey options */}
      {transport.journey_options.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Journey Options</Text>
          {transport.journey_options.map((journey, idx) => (
            <View key={idx} style={styles.journeyCard}>
              <Text style={styles.journeyDuration}>{journey.duration_mins} min</Text>
              {journey.legs.map((leg, legIdx) => (
                <View key={legIdx} style={styles.legRow}>
                  <Text style={styles.legIcon}>{modeIcon(leg.mode)}</Text>
                  <Text style={styles.legText} numberOfLines={2}>{leg.instruction}</Text>
                  <Text style={styles.legDuration}>{leg.duration_mins}m</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.lg,
    marginVertical: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  summary: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  lineInfo: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    ...typography.body,
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  lineStatus: {
    ...typography.caption,
    fontSize: 12,
    color: '#43a047',
  },
  lineStatusDisrupted: {
    color: '#e53935',
  },
  lineDisruption: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  allGoodNote: {
    ...typography.caption,
    fontSize: 12,
    color: '#43a047',
    marginTop: spacing.xs,
  },
  journeyCard: {
    backgroundColor: '#f0f7ff',
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  journeyDuration: {
    ...typography.bodyBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  legIcon: {
    fontSize: 13,
    marginRight: 4,
    width: 20,
  },
  legText: {
    ...typography.body,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  legDuration: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 4,
  },
});
