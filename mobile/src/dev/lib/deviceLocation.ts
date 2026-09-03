import * as Location from 'expo-location';
import { getCachedReverseGeocode } from '../../lib/geocodeCache';

async function getReadableLocation(latitude: number, longitude: number): Promise<string> {
  return getCachedReverseGeocode(latitude, longitude);
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
