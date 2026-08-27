import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../../theme';
import type { WeatherSummary } from '../../types';

type Props = {
  name: string;
  weather: WeatherSummary;
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Convert country names to ISO 2-letter codes for compact display.
const COUNTRY_TO_ISO: Record<string, string> = {
  'United States': 'US',
  'United Kingdom': 'UK',
  'England': 'UK',
  'Scotland': 'UK',
  'Wales': 'UK',
  'Northern Ireland': 'UK',
  'Canada': 'CA',
  'Mexico': 'MX',
  'Brazil': 'BR',
  'France': 'FR',
  'Germany': 'DE',
  'Italy': 'IT',
  'Spain': 'ES',
  'Portugal': 'PT',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Ireland': 'IE',
  'Greece': 'GR',
  'Japan': 'JP',
  'China': 'CN',
  'India': 'IN',
  'Australia': 'AU',
  'New Zealand': 'NZ',
  'South Africa': 'ZA',
  'Russia': 'RU',
  'Singapore': 'SG',
  'Thailand': 'TH',
  'United Arab Emirates': 'AE',
};

function formatLocation(location: string): string {
  const parts = location.split(',').map((part) => part.trim());
  return parts
    .map((part) => COUNTRY_TO_ISO[part] || part)
    .filter(Boolean)
    .join(', ');
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
// the red header — mirrors the Figma "Good morning, {name}" section
// (node 1:35463): Urbanist greeting/name column on the left, weather icon
// (dynamic, per the live weather code) with temperature and location on the
// right.
export default function GreetingWeather({ name, weather }: Props) {
  const location = formatLocation(weather.location);

  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <Text style={styles.greeting}>{timeOfDayGreeting()},</Text>
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
          {name}
        </Text>
        <Text style={styles.subtitle}>Your day is looking good.</Text>
      </View>

      <View style={styles.weather}>
        <Ionicons
          name={weatherIconName(weather.weatherCode)}
          size={80}
          color={colors.headerGradientStart}
        />
        <View style={styles.weatherRow}>
          <View style={styles.temperatureRow}>
            <Text style={styles.temperature}>{weather.temperatureC}</Text>
            <Text style={styles.temperatureUnit}>° C</Text>
          </View>
          <Text style={styles.location} numberOfLines={1}>
            {location}
          </Text>
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
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
    gap: spacing.lg,
  },
  textColumn: { flexShrink: 1 },
  greeting: {
    fontFamily: fonts.regular,
    fontSize: 20,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  name: {
    fontFamily: fonts.semiBold,
    fontSize: 38,
    lineHeight: 38,
    letterSpacing: -0.76,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.bodyLight,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  weather: { alignItems: 'flex-end', flexShrink: 1, gap: spacing.sm },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  temperatureRow: { flexDirection: 'row', alignItems: 'flex-start' },
  temperature: {
    fontFamily: fonts.regular,
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -1.2,
    color: colors.textPrimary,
  },
  temperatureUnit: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  location: {
    fontFamily: fonts.bodyLight,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});
