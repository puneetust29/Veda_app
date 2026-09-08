import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import type { TransportResultPayload } from '../../types';

const DISRUPTION_THRESHOLD = 9;

// Official TfL line colours
const LINE_COLOURS: Record<string, string> = {
  'bakerloo':        '#894E24',
  'central':         '#DC241F',
  'circle':          '#FFD329',
  'district':        '#007229',
  'elizabeth-line':  '#6950A1',
  'hammersmith-city':'#F4A9BE',
  'jubilee':         '#A0A5A9',
  'metropolitan':    '#9B0058',
  'northern':        '#000000',
  'piccadilly':      '#0019A8',
  'victoria':        '#0098D8',
  'waterloo-city':   '#93CEBA',
  'dlr':             '#00A4A7',
  'overground':      '#EE7C0E',
  'tube':            '#DC241F',
};

function lineColour(name: string): string {
  const key = name.toLowerCase().replace(/\s+/g, '-');
  return LINE_COLOURS[key] ?? colors.textMuted;
}

const MODE_ICONS: Record<string, string> = {
  'tube': '🚇',
  'elizabeth-line': '🟣',
  'dlr': '🚈',
  'overground': '🚆',
  'bus': '🚌',
  'public-bus': '🚌',
  'walking': '🚶',
  'national-rail': '🚆',
  'default': '🚌',
};

function modeIcon(mode: string): string {
  return MODE_ICONS[mode] ?? MODE_ICONS.default;
}

interface Props {
  transport: TransportResultPayload;
}

export default function TransportStatusCard({ transport }: Props) {
  const [linesExpanded, setLinesExpanded] = useState(true);
  const [routeExpanded, setRouteExpanded] = useState(true);

  const disrupted = transport.line_statuses.filter((s) => s.severity < DISRUPTION_THRESHOLD);
  const allGood = disrupted.length === 0;

  const directionLabel =
    transport.direction === 'from_london'
      ? `To ${transport.airport ?? 'the airport'}`
      : transport.direction === 'to_london'
        ? `From ${transport.airport ?? 'the airport'}`
        : 'London Transport';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>🚇</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.provider}>London Transport</Text>
          <Text style={styles.direction}>{directionLabel}</Text>
        </View>
        <View style={[styles.pill, allGood ? styles.pillGood : styles.pillBad]}>
          <Text style={[styles.pillText, allGood ? styles.pillTextGood : styles.pillTextBad]}>
            {allGood ? '✓ All good' : `⚠ ${disrupted.length} disrupted`}
          </Text>
        </View>
      </View>

      {/* Summary */}
      {transport.summary ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.summary}>{transport.summary}</Text>
        </>
      ) : null}

      {/* Line Status */}
      {transport.line_statuses.length > 0 && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setLinesExpanded((v) => !v)} activeOpacity={0.7}>
            <Text style={styles.sectionTitle}>Line Status</Text>
            <Text style={styles.chevron}>{linesExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {linesExpanded && (
            <View style={styles.linesGrid}>
              {transport.line_statuses.map((line) => {
                const isDisrupted = line.severity < DISRUPTION_THRESHOLD;
                const colour = lineColour(line.line_name);
                return (
                  <View key={line.line_name} style={styles.lineRow}>
                    <View style={[styles.lineStripe, { backgroundColor: colour }]} />
                    <View style={styles.lineBody}>
                      <Text style={styles.lineName}>{line.line_name}</Text>
                      <Text style={[styles.lineStatus, { color: isDisrupted ? '#e53935' : colors.success }]}>
                        {line.status}
                      </Text>
                      {line.disruption ? (
                        <Text style={styles.lineDisruption} numberOfLines={2}>{line.disruption}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: isDisrupted ? '#e53935' : colors.success }]} />
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* Journey Options */}
      {transport.journey_options.length > 0 && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setRouteExpanded((v) => !v)} activeOpacity={0.7}>
            <Text style={styles.sectionTitle}>Best Route</Text>
            <Text style={styles.chevron}>{routeExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {routeExpanded && transport.journey_options.map((journey, idx) => (
            <View key={idx} style={[styles.journeyCard, idx > 0 && { marginTop: spacing.sm }]}>
              <View style={styles.journeyHeader}>
                <Text style={styles.journeyDuration}>{journey.duration_mins} min</Text>
                <Text style={styles.journeyLabel}>Option {idx + 1}</Text>
              </View>
              <View style={styles.legList}>
                {journey.legs.map((leg, legIdx) => (
                  <View key={legIdx} style={styles.legRow}>
                    <Text style={styles.legIcon}>{modeIcon(leg.mode)}</Text>
                    <View style={styles.legBody}>
                      <Text style={styles.legText} numberOfLines={2}>{leg.instruction}</Text>
                    </View>
                    <Text style={styles.legDuration}>{leg.duration_mins}m</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#003990',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeIcon: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  provider: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  direction: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillGood: {
    backgroundColor: '#eaf7ee',
  },
  pillBad: {
    backgroundColor: '#fdecea',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextGood: {
    color: colors.success,
  },
  pillTextBad: {
    color: '#e53935',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  summary: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chevron: {
    fontSize: 10,
    color: colors.textMuted,
  },
  linesGrid: {
    gap: spacing.xs,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
  lineStripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  lineBody: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  lineName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  lineStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  lineDisruption: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  journeyCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  journeyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  journeyDuration: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  journeyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  legList: {
    gap: spacing.xs,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  legIcon: {
    fontSize: 14,
    width: 22,
    textAlign: 'center',
    marginTop: 1,
  },
  legBody: {
    flex: 1,
  },
  legText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  legDuration: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
});
