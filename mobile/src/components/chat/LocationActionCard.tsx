import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LocationAction } from '../../types';

type Props = {
  action: LocationAction;
  result?: string;
};

const ACTION_LABELS: Record<string, string> = {
  disable_tracking: 'Location tracking disabled',
  pause_geofencing: 'Geofencing paused',
  resume_geofencing: 'Geofencing resumed',
  list_locations: 'Your saved locations',
  delete_location: 'Location deleted',
  create_temporary_geofence: 'Reminder set for this location',
  set_location_context: 'Location context updated',
  search_nearby_places: 'Searching nearby…',
  show_place_details: 'Place details',
  save_favorite_place: 'Saved to favorites',
  remove_favorite_place: 'Removed from favorites',
  request_navigation: 'Opening navigation…',
  show_shopping_list_prompt: 'Shopping list',
};

export function LocationActionCard({ action, result }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{ACTION_LABELS[action.kind] ?? action.kind}</Text>
      {result ? <Text style={styles.result}>{result}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EAF4FB',
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#2980B9',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A5276',
  },
  result: {
    fontSize: 13,
    color: '#2C3E50',
    marginTop: 4,
  },
});
