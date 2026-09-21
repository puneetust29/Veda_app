import { Linking } from 'react-native';

export type OpenUberParams = {
  uber_app_url?: string | null;
  deep_link_url?: string | null;
};

export async function openUber(params: OpenUberParams): Promise<void> {
  // The web universal link (m.uber.com/ul) honors pickup location correctly;
  // the uber:// custom scheme silently drops it and falls back to GPS.
  if (params.deep_link_url) {
    try {
      await Linking.openURL(params.deep_link_url);
      return;
    } catch {
      // fall through to app scheme
    }
  }
  if (params.uber_app_url) {
    await Linking.openURL(params.uber_app_url);
  } else {
    throw new Error('No Uber deep link available');
  }
}
