import { Linking } from 'react-native';

export type OpenUberParams = {
  uber_app_url?: string | null;
  deep_link_url?: string | null;
};

export async function openUber(params: OpenUberParams): Promise<void> {
  if (params.uber_app_url) {
    try {
      await Linking.openURL(params.uber_app_url);
      return;
    } catch {
      // fall through to web fallback
    }
  }
  if (params.deep_link_url) {
    await Linking.openURL(params.deep_link_url);
  } else {
    throw new Error('No Uber deep link available');
  }
}
