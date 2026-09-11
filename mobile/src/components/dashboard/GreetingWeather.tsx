import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../../theme';
import type { WeatherSummary } from '../../types';

const weatherSunny = require('../../../assets/weather/sunny.png');
const weatherNight = require('../../../assets/weather/night.png');
const weatherCloudy = require('../../../assets/weather/cloudy.png');
const weatherCloudyNight = require('../../../assets/weather/cloudy-night.png');
const weatherPartlySunny = require('../../../assets/weather/partly-sunny.png');
const weatherPartlyRainy = require('../../../assets/weather/partly-rainy.png');
const weatherRainy = require('../../../assets/weather/rainy.png');
const weatherThunderstorm = require('../../../assets/weather/thunderstorm.png');

type Props = {
  name: string;
  weather: WeatherSummary;
};

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
  const formatted = parts
    .map((part) => COUNTRY_TO_ISO[part] || part)
    .filter(Boolean);

  // Remove duplicates while preserving order
  const seen = new Set<string>();
  return formatted.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  }).join(', ');
}

function isNightNow(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 19;
}

// Figma "Weather icon" set — clear and cloudy conditions each have a
// day/night pair, swapped by local hour since Open-Meteo's weather_code
// doesn't carry day/night itself. There's no dedicated snow asset, so snow
// codes fall back to the plain rain art (closest available precipitation icon).
function weatherIconSource(weatherCode: number | null) {
  const night = isNightNow();

  if (weatherCode === null) return night ? weatherCloudyNight : weatherCloudy;
  if (weatherCode === 0) return night ? weatherNight : weatherSunny;
  if (weatherCode === 1) return night ? weatherCloudyNight : weatherPartlySunny;
  if (weatherCode === 2 || weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
    return night ? weatherCloudyNight : weatherCloudy;
  }
  if (weatherCode === 51 || weatherCode === 53 || weatherCode === 55 || weatherCode === 80 || weatherCode === 81 || weatherCode === 82) {
    return weatherPartlyRainy;
  }
  if (weatherCode === 56 || weatherCode === 57 || weatherCode === 61 || weatherCode === 63 || weatherCode === 65 || weatherCode === 66 || weatherCode === 67) {
    return weatherRainy;
  }
  if (
    weatherCode === 71 ||
    weatherCode === 73 ||
    weatherCode === 75 ||
    weatherCode === 77 ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return weatherRainy;
  }
  if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) return weatherThunderstorm;
  return night ? weatherCloudyNight : weatherCloudy;
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
        <Image source={weatherIconSource(weather.weatherCode)} style={styles.weatherIcon} resizeMode="contain" />
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
    alignItems: 'flex-end',
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
  weatherIcon: { width: 80, height: 80 },
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
