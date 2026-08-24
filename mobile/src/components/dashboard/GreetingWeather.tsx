import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';
import type { WeatherSummary } from '../../types';

type Props = {
  name: string;
  weather: WeatherSummary;
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function splitLocation(location: string): { city: string; country?: string } {
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { city: location };
  return { city: parts[0], country: parts.slice(1).join(', ') };
}

function weatherIconName(weatherCode: number | null): IoniconName {
  if (weatherCode === null) return 'cloud-outline';
  if (weatherCode === 0) return 'sunny-outline';
  if (weatherCode === 1 || weatherCode === 2) return 'partly-sunny-outline';
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) return 'cloudy-outline';
  if (
    weatherCode === 51 ||
    weatherCode === 53 ||
    weatherCode === 55 ||
    weatherCode === 56 ||
    weatherCode === 57 ||
    weatherCode === 61 ||
    weatherCode === 63 ||
    weatherCode === 65 ||
    weatherCode === 66 ||
    weatherCode === 67 ||
    weatherCode === 80 ||
    weatherCode === 81 ||
    weatherCode === 82
  ) {
    return 'rainy-outline';
  }
  if (
    weatherCode === 71 ||
    weatherCode === 73 ||
    weatherCode === 75 ||
    weatherCode === 77 ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return 'snow-outline';
  }
  if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) return 'thunderstorm-outline';
  return 'cloud-outline';
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Greeting + weather summary block shown at the top of the Dashboard, under
// the red header — mirrors the Figma "Good morning, {name}" section.
export default function GreetingWeather({ name, weather }: Props) {
  const { city, country } = splitLocation(weather.location);
  const iconName = weatherIconName(weather.weatherCode);

  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <Text style={styles.greeting}>{timeOfDayGreeting()},</Text>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>Your day is looking good.</Text>
      </View>

      <View style={styles.weather}>
        <Ionicons name={iconName} size={36} color={colors.brand} />
        <Text style={styles.temperature}>{weather.temperatureC}°C</Text>
        <View style={styles.locationBlock}>
          <Text style={styles.locationLine}>{city}</Text>
          {country ? <Text style={styles.locationLine}>{country}</Text> : null}
        </View>
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
  locationBlock: { marginTop: 2, alignItems: 'center' },
  locationLine: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
