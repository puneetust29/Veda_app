import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { INTEGRATIONS_CATALOG } from '../config/integrationsCatalog';
import { colors } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'IntegrationDetail'>;

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function IntegrationDetailScreen({ route }: Props) {
  const entry = INTEGRATIONS_CATALOG.find((item) => item.id === route.params.id);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.fieldValue}>Integration not found.</Text>
      </View>
    );
  }

  const handleRun = async () => {
    if (!entry.action) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { summary } = await entry.action.run();
      setResult(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{entry.name}</Text>
      <Text style={styles.category}>{entry.category}</Text>

      <Field label="Purpose" value={entry.purpose} />
      <Field label="Example usage" value={entry.exampleUsage} />
      <Field label="Status" value={entry.status} />
      <Field label="Priority" value={entry.priority ?? ''} />
      <Field label="Why it matters" value={entry.notes} />

      <View style={styles.actionSection}>
        {entry.action ? (
          <>
            <TouchableOpacity
              style={[styles.button, running && styles.buttonDisabled]}
              onPress={handleRun}
              disabled={running}
            >
              {running ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>{entry.action.label}</Text>
              )}
            </TouchableOpacity>
            {result ? <Text style={styles.resultText}>{result}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        ) : (
          <Text style={styles.notWiredText}>Not wired yet — build this one next.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  category: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  fieldValue: { fontSize: 15, color: colors.textPrimary, marginTop: 4, lineHeight: 20 },
  actionSection: { marginTop: 12 },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  resultText: { marginTop: 12, fontSize: 14, color: colors.success, lineHeight: 20 },
  errorText: { marginTop: 12, fontSize: 14, color: colors.brand, lineHeight: 20 },
  notWiredText: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },
});
