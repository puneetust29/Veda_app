import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, fonts, spacing } from '../../theme';
import CoverageDurationIcon from '../icons/CoverageDurationIcon';
import CheckIcon from '../icons/CheckIcon';

type ChecklistItem = {
  label: string;
  icon?: string;
};

type Props = {
  destination: string;
  items?: ChecklistItem[];
};

export default function TripChecklistCard({
  destination,
  items = [
    { label: 'Roaming', icon: 'stats-chart' },
    { label: 'Travel Insurance', icon: 'flight' },
  ],
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.titleContainer}>
        <View style={styles.titleIconContainer}>
          <MaterialIcons name="flight" size={24} color="#FE0000" />
        </View>
        <Text style={styles.title}>
          You are all set for your {destination} Trip!
        </Text>
      </View>

      <View style={styles.divider} />

      {items.map((item, index) => (
        <View key={index} style={styles.checklistItem}>
          {item.icon && (
            <View style={styles.iconContainer}>
              {item.icon === 'flight' ? (
                <MaterialIcons name="flight" size={20} color="#FE0000" />
              ) : (
                <CoverageDurationIcon size={20} />
              )}
            </View>
          )}
          <Text style={styles.checklistLabel}>{item.label}</Text>
          <View style={styles.checkmark}>
            <CheckIcon size={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5E6E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: '#000000',
  },
  divider: {
    height: 1,
    backgroundColor: '#eeeeee',
    marginBottom: 16,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5E6E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checklistLabel: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
});
