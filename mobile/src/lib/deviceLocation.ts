/**
 * deviceLocation.ts
 *
 * Shared helper for resolving the device's current GPS coordinates using
 * expo-location. Used by useRoamingChat (for the chat stream) and can be
 * reused by any screen that needs to pre-fill an Uber pickup.
 *
 * Errors are caught and return null — callers should always handle the
 * null case gracefully (Uber falls back to `pickup=my_location`).
 */
import * as Location from 'expo-location';

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export async function getCurrentDeviceLocation(): Promise<DeviceLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      label: 'Current location',
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[location] unable to resolve device location for Uber', error);
    }
    return null;
  }
}
