import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import IconCircle from '../common/IconCircle';
import { colors, radii, spacing, typography } from '../../theme';

export type Suggestion = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  connectApps?: boolean;
  onPress?: () => void;
};

type Props = {
  suggestions: Suggestion[];
  onShuffle?: () => void;
};

// Static 2-column grid of "Things you can ask me" prompt tiles, matching the
// Figma design. Tiles flagged `connectApps` show a small "Connect apps" label
// (these represent integrations not wired up yet).
export default function SuggestionGrid({ suggestions, onShuffle }: Props) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Things you can ask me</Text>
        <TouchableOpacity onPress={onShuffle} disabled={!onShuffle} hitSlop={8}>
          <Ionicons name="shuffle" size={20} color={colors.brand} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {suggestions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.tile}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.tileTop}>
              <IconCircle icon={item.icon} size={32} iconSize={18} />
              {item.connectApps ? <Text style={styles.connectLabel}>Connect apps</Text> : null}
            </View>
            <View style={styles.tileBottom}>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {item.label}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.brand} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
  sectionTitle: { ...typography.sectionTitle, color: colors.textPrimary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  tile: {
    width: '47%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
    justifyContent: 'space-between',
    minHeight: 96,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  connectLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  tileBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  tileLabel: { ...typography.bodyBold, color: colors.textPrimary, flexShrink: 1, marginRight: spacing.sm },
});
