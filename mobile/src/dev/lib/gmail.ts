import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api } from '../../lib/api';

// Reuses lib/api.ts directly rather than duplicating it dev-side -- unlike
// whatsapp.ts/appleCalendar.ts, which duplicate *screen/device* logic, this
// is just the network client the rest of the app already goes through
// (token handling, base URL), the same one GmailScreen.tsx calls.
export async function getGmailSample(): Promise<{ summary: string }> {
  let status = await api.googleAuthStatus();

  if (!status.connected || !status.gmail_connected) {
    const deepLink = Linking.createURL('google-auth-complete');
    const { authorization_url } = await api.startGoogleAuth(deepLink);
    const result = await WebBrowser.openAuthSessionAsync(authorization_url, deepLink, {
      dismissButtonStyle: 'cancel',
    });

    if (result.type !== 'success') {
      throw new Error('Gmail connection was cancelled.');
    }

    status = await api.googleAuthStatus();
    if (!status.connected || !status.gmail_connected) {
      throw new Error('Gmail still not connected after authorization — try again.');
    }
  }

  await api.syncGmail(10);
  const { messages } = await api.listGmailMessages(10);

  if (!messages.length) {
    return { summary: 'Gmail connected, but no emails found in the inbox.' };
  }

  const preview = messages
    .slice(0, 10)
    .map((m) => `${m.subject || '(no subject)'} — ${m.sender || 'Unknown sender'}`)
    .join('\n');

  return { summary: `Top ${messages.length} email(s):\n${preview}` };
}
