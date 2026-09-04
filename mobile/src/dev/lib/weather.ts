import * as Location from 'expo-location';

// Dev-only duplicate of lib/weather.ts's device weather read, kept
// intentionally separate so the integrations catalog never depends on
// production code paths. Unlike lib/weather.ts's silent fallback (used for
// the Dashboard's background read), this is an explicit user-triggered test
// action, so it requests permission and surfaces failures instead of
// falling back to a canned reading.
async function getReadableLocation(latitude: number, longitude: number): Promise<string> {
  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!places.length) return 'Unknown location';
  const place = places[0];
  const locality = place.city ?? place.subregion ?? place.region;
  const country = place.country;
  if (locality && country) return `${locality}, ${country}`;
  return locality ?? country ?? 'Unknown location';
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