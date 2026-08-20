import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

export type WeatherSummary = {
  temperatureC: number;
  location: string;
};

type Props = {
  name: string;
  weather: WeatherSummary;
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Greeting + weather summary block shown at the top of the Dashboard, under
// the red header — mirrors the Figma "Good morning, {name}" section.
export default function GreetingWeather({ name, weather }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <Text style={styles.greeting}>{timeOfDayGreeting()},</Text>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>Your day is looking good.</Text>
      </View>

      <View style={styles.weather}>
        <Ionicons name="cloud-outline" size={36} color={colors.brand} />
        <Text style={styles.temperature}>{weather.temperatureC}°C</Text>
        <Text style={styles.location}>{weather.location}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  textColumn: { flexShrink: 1 },
  greeting: { ...typography.body, color: colors.textSecondary },
  name: { ...typography.headline, color: colors.textPrimary, marginTop: 2 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  weather: { alignItems: 'center' },
  temperature: { ...typography.bodyBold, color: colors.textPrimary, marginTop: 2 },
  location: { ...typography.caption, color: colors.textMuted },
});
