import * as Location from 'expo-location';

import type { WeatherSummary } from '../types';
import { getCachedReverseGeocode } from './geocodeCache';

const FALLBACK_WEATHER: WeatherSummary = { temperatureC: 13, location: '', weatherCode: null };

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

type WttrResponse = {
  current_condition?: Array<{
    temp_C?: string | number;
    weatherCode?: string | number;
  }>;
};

async function getReadableLocation(latitude: number, longitude: number): Promise<string> {
  return getCachedReverseGeocode(latitude, longitude);
}

async function getWeatherFromOpenMeteo(latitude: number, longitude: number): Promise<WeatherSummary | null> {
  try {
    console.log(`Fetching weather from Open-Meteo for coordinates: ${latitude}, ${longitude}`);
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`,
    );
    if (!weatherResponse.ok) return null;

    const weather = (await weatherResponse.json()) as OpenMeteoCurrentResponse;
    const temperature = weather.current?.temperature_2m;
    const weatherCode = weather.current?.weather_code;
    if (typeof temperature !== 'number' || Number.isNaN(temperature)) return null;

    const location = await getReadableLocation(latitude, longitude);
    return {
      temperatureC: Math.round(temperature),
      location,
      weatherCode: typeof weatherCode === 'number' && !Number.isNaN(weatherCode) ? weatherCode : null,
    };
  } catch (error) {
    return null;
  }
}

async function getWeatherFromWttr(latitude: number, longitude: number): Promise<WeatherSummary | null> {
  try {
    const weatherResponse = await fetch(
      `http://wttr.in/${latitude},${longitude}?format=j1`,
    );
    if (!weatherResponse.ok) return null;

    const weather = (await weatherResponse.json()) as WttrResponse;
    const tempStr = weather.current_condition?.[0]?.temp_C;
    const temperature = typeof tempStr === 'string' ? parseFloat(tempStr) : tempStr;
    if (typeof temperature !== 'number' || Number.isNaN(temperature)) return null;

    const location = await getReadableLocation(latitude, longitude);
    return {
      temperatureC: Math.round(temperature),
      location,
      weatherCode: null,
    };
  } catch {
    return null;
  }
}

export async function getDeviceWeatherSummary(): Promise<WeatherSummary> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status !== Location.PermissionStatus.GRANTED) return FALLBACK_WEATHER;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;

  // Try primary API (Open-Meteo)
  const openMeteoWeather = await getWeatherFromOpenMeteo(latitude, longitude);
  if (openMeteoWeather) return openMeteoWeather;

  // Fallback to secondary API (wttr.in)
  const wttrWeather = await getWeatherFromWttr(latitude, longitude);
  if (wttrWeather) return wttrWeather;

  // Final fallback to default weather
  return FALLBACK_WEATHER;
}

export { FALLBACK_WEATHER };
