import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CATEGORY_NOTES, INTEGRATIONS_CATALOG } from '../integrationsCatalog';
import { colors } from '../../theme';
import type { DevStackParamList } from '../types';

type Props = NativeStackScreenProps<DevStackParamList, 'Catalog'>;

const STATUS_COLORS: Record<string, string> = {
  Done: colors.success,
  'In Progress': '#b8860b',
  'Not Started': colors.textMuted,
};

function buildSections() {
  const byCategory = new Map<string, typeof INTEGRATIONS_CATALOG>();
  for (const entry of INTEGRATIONS_CATALOG) {
    if (entry.status === 'Not Started') continue;
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }
  return Array.from(byCategory.entries())
    .map(([title, data]) => {
      const note = CATEGORY_NOTES[title];
      return { title, data: note ? [] : data, note };
    })
    .filter((section) => section.data.length > 0 || section.note);
}

export default function IntegrationsCatalogScreen({ navigation }: Props) {
  const sections = buildSections();

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderSectionFooter={({ section }) =>
          section.note ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{section.note}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('Detail', { id: item.id })}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowName}>{item.name}</Text>
              <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[item.status] }]}>
                <Text style={styles.statusPillText}>{item.status}</Text>
              </View>
            </View>
            {item.purpose ? <Text style={styles.rowPurpose}>{item.purpose}</Text> : null}
            {item.action ? <Text style={styles.tryItBadge}>Try it available</Text> : null}
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noteBox: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noteText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', lineHeight: 18 },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  rowPurpose: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusPillText: { fontSize: 11, fontWeight: '700', color: colors.white },
  tryItBadge: { fontSize: 12, color: colors.link, marginTop: 4, fontWeight: '600' },
});
