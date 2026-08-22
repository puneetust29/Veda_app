import { Linking } from 'react-native';

export type OpenUberParams = {
  uber_app_url: string | null;
  deep_link_url: string | null;
  destination: string | null;
};

/**
 * Open the Uber app via deep link, falling back to the universal web URL if
 * the native app isn't installed or the uber:// scheme fails.
 *
 * Throws if neither URL is available — callers should catch and show an Alert.
 */
export async function openUber(params: OpenUberParams): Promise<void> {
  if (params.uber_app_url) {
    try {
      await Linking.openURL(params.uber_app_url);
    } catch {
      // uber:// failed (app not installed or scheme blocked) — try web fallback.
      if (params.deep_link_url) {
        await Linking.openURL(params.deep_link_url);
      } else {
        throw new Error('No Uber deep link available');
      }
    }
  } else if (params.deep_link_url) {
    await Linking.openURL(params.deep_link_url);
  } else {
    throw new Error('No Uber deep link available');
  }

  if (__DEV__) {
    console.log('[uber] opened deeplink', { destination: params.destination });
  }
}
