import * as Location from 'expo-location';
import { getCachedReverseGeocode } from '../../lib/geocodeCache';

async function getReadableLocation(latitude: number, longitude: number): Promise<string> {
  return getCachedReverseGeocode(latitude, longitude);
}

export async function getWeatherSample(): Promise<{ summary: string }> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission denied — enable it in Settings to test this integration.');
  }

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = position.coords;
  const location = await getReadableLocation(latitude, longitude);

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`,
  );
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const temperature = data.current?.temperature_2m;
  if (typeof temperature !== 'number' || Number.isNaN(temperature)) {
    throw new Error('Open-Meteo response missing current.temperature_2m');
  }

  return {
    summary: `${Math.round(temperature)}°C in ${location} (Open-Meteo weather code ${data.current?.weather_code ?? 'n/a'})`,
  };
}
