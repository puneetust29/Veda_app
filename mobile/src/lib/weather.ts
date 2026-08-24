import * as Location from 'expo-location';

import type { WeatherSummary } from '../types';

const FALLBACK_WEATHER: WeatherSummary = { temperatureC: 13, location: 'England, UK', weatherCode: null };

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

function formatLocation(place: Location.LocationGeocodedAddress): string {
  const locality = place.city ?? place.subregion ?? place.region;
  const country = place.country;
  if (locality && country) return `${locality}, ${country}`;
  if (locality) return locality;
  if (country) return country;
  return FALLBACK_WEATHER.location;
}

async function getReadableLocation(latitude: number, longitude: number): Promise<string> {
  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!places.length) return FALLBACK_WEATHER.location;
  return formatLocation(places[0]);
}

export async function getDeviceWeatherSummary(): Promise<WeatherSummary> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status !== Location.PermissionStatus.GRANTED) return FALLBACK_WEATHER;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;
  const location = await getReadableLocation(latitude, longitude);

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`,
  );
  if (!weatherResponse.ok) {
    throw new Error(`Open-Meteo request failed: ${weatherResponse.status}`);
  }

  const weather = (await weatherResponse.json()) as OpenMeteoCurrentResponse;
  const temperature = weather.current?.temperature_2m;
  const weatherCode = weather.current?.weather_code;
  if (typeof temperature !== 'number' || Number.isNaN(temperature)) {
    throw new Error('Open-Meteo response missing current.temperature_2m');
  }

  return {
    temperatureC: Math.round(temperature),
    location,
    weatherCode: typeof weatherCode === 'number' && !Number.isNaN(weatherCode) ? weatherCode : null,
  };
}

export { FALLBACK_WEATHER };
