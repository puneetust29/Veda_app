import * as Location from 'expo-location';

async function getReadableLocation(latitude: number, longitude: number): Promise<string> {
  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!places.length) return 'Unknown location';
  const place = places[0];
  const locality = place.city ?? place.subregion ?? place.region;
  const country = place.country;
  if (locality && country) return `${locality}, ${country}`;
  return locality ?? country ?? 'Unknown location';
}

// Unlike weather.ts's silent-fallback read, this is an explicit user-triggered
// test action, so it requests permission (prompting the OS dialog) rather
// than giving up when permission hasn't been granted yet.
export async function getDeviceLocationSample(): Promise<{ summary: string }> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission denied — enable it in Settings to test this integration.');
  }

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = position.coords;
  const readableLocation = await getReadableLocation(latitude, longitude);

  return {
    summary: `${readableLocation}\nlat: ${latitude.toFixed(5)}, lng: ${longitude.toFixed(5)}`,
  };
}