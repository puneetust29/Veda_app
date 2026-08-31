import { Linking } from 'react-native';
import { loadToken } from '../../lib/authToken';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function getUberDeeplinkSample(): Promise<{ summary: string }> {
  const token = await loadToken();
  if (!token) throw new Error('Not authenticated — log in first.');

  const params = new URLSearchParams({ destination: 'London Heathrow Airport' });
  const response = await fetch(`${API_BASE_URL}/dev/uber/deeplink?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Uber deeplink request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    destination: string;
    dropoff_latlng: { lat: number; lng: number };
    uber_app_url: string;
    deep_link_url: string;
  };

  const canOpen = await Linking.canOpenURL(data.uber_app_url);
  if (canOpen) {
    await Linking.openURL(data.uber_app_url);
    return {
      summary: `Opened Uber app for ride to ${data.destination}\n(${data.dropoff_latlng.lat.toFixed(4)}, ${data.dropoff_latlng.lng.toFixed(4)})`,
    };
  }

  await Linking.openURL(data.deep_link_url);
  return {
    summary: `Opened Uber web for ride to ${data.destination}\n(${data.dropoff_latlng.lat.toFixed(4)}, ${data.dropoff_latlng.lng.toFixed(4)})`,
  };
}
