import { Linking } from 'react-native';

export type OpenUberParams = {
  uber_app_url?: string | null;
  deep_link_url?: string | null;
};

export async function openUber(params: OpenUberParams): Promise<void> {
  if (__DEV__) {
    console.log('[openUber] Attempting to open Uber with params:', params);
  }

  if (params.uber_app_url) {
    if (__DEV__) console.log('[openUber] Trying app URL:', params.uber_app_url);
    try {
      await Linking.openURL(params.uber_app_url);
      if (__DEV__) console.log('[openUber] ✅ Successfully opened Uber app');
      return;
    } catch (err) {
      if (__DEV__) console.log('[openUber] App URL failed, falling back to web:', err);
      // fall through to web fallback
    }
  }

  if (params.deep_link_url) {
    if (__DEV__) console.log('[openUber] Using web URL:', params.deep_link_url);
    await Linking.openURL(params.deep_link_url);
    if (__DEV__) console.log('[openUber] ✅ Successfully opened web URL');
  } else {
    throw new Error('No Uber deep link available');
  }
}
