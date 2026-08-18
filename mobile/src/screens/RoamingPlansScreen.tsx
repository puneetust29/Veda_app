import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../lib/api';
import type { RoamingPlan, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RoamingPlans'>;

interface PlanSection {
  title: string;
  data: RoamingPlan[];
}

export default function RoamingPlansScreen({ navigation }: Props) {
  const [plans, setPlans] = useState<RoamingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<PlanSection[]>([]);

  const loadPlans = useCallback(async () => {
    const data = await api.listRoamingPlans();
    setPlans(data);

    // Group by country
    const grouped = data.reduce(
      (acc, plan) => {
        const existing = acc.find((s) => s.title === plan.country_name);
        if (existing) {
          existing.data.push(plan);
        } else {
          acc.push({ title: plan.country_name, data: [plan] });
        }
        return acc;
      },
      [] as PlanSection[],
    );

    // Sort sections by country name
    grouped.sort((a, b) => a.title.localeCompare(b.title));
    setSections(grouped);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadPlans().finally(() => setLoading(false));
    }, [loadPlans]),
  );

  const renderPlan = ({ item }: { item: RoamingPlan }) => (
    <View style={styles.planCard}>
      <View style={styles.planHeader}>
        <Text style={styles.planName}>{item.plan_name}</Text>
        {item.price > 0 ? (
          <Text style={styles.planPrice}>
            €{item.price.toFixed(2)}
          </Text>
        ) : (
          <Text style={styles.planFree}>FREE</Text>
        )}
      </View>
      <Text style={styles.planDescription}>{item.description}</Text>
      <View style={styles.planSpecs}>
        <View style={styles.spec}>
          <Text style={styles.specLabel}>Duration</Text>
          <Text style={styles.specValue}>{item.duration_days} days</Text>
        </View>
        <View style={styles.spec}>
          <Text style={styles.specLabel}>Data</Text>
          <Text style={styles.specValue}>
            {item.data_gb === 999 ? 'Unlimited' : `${item.data_gb}GB`}
          </Text>
        </View>
        <View style={styles.spec}>
          <Text style={styles.specLabel}>Region</Text>
          <Text style={styles.specValue}>{item.region}</Text>
        </View>
      </View>
    </View>
  );

  const renderSectionHeader = ({ section }: { section: PlanSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.data.length} plans</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderPlan}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No roaming plans available.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    marginTop: 40,
  },
  list: {
    padding: 16,
    paddingBottom: 24,
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  sectionCount: {
    fontSize: 13,
    color: '#888',
  },
  planCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#c0392b',
  },
  planFree: {
    fontSize: 14,
    fontWeight: '700',
    color: '#27ae60',
  },
  planDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    lineHeight: 18,
  },
  planSpecs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  spec: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  specLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
    fontWeight: '600',
  },
  specValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
});
