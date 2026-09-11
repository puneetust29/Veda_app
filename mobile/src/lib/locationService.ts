import * as Location from 'expo-location';

export type LocationPermissionState = {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
};

export async function getLocationPermissions(): Promise<LocationPermissionState> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return { foreground: fg.status, background: bg.status };
}

export async function requestForegroundPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

// iOS requires foreground permission to already be granted before this prompt fires.
export async function requestBackgroundPermission(): Promise<Location.PermissionStatus> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status;
}

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}
