import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api } from '../../lib/api';
import type { GoogleCalendarEvent } from '../../types';

// Reuses lib/api.ts directly, same as gmail.ts -- it's just the network
// client the rest of the app already goes through (token handling, base
// URL), not screen/device logic that needs a dev-only duplicate.
function formatEventTime(event: GoogleCalendarEvent): string {
  const when = event.start?.dateTime ?? event.start?.date;
  if (!when) return 'unknown time';
  return event.start?.dateTime ? new Date(when).toLocaleString() : when;
}

export async function getGoogleCalendarSample(): Promise<{ summary: string }> {
  let status = await api.googleAuthStatus();

  if (!status.connected || !status.calendar_connected) {
    const deepLink = Linking.createURL('google-auth-complete');
    const { authorization_url } = await api.startGoogleAuth(deepLink);
    const result = await WebBrowser.openAuthSessionAsync(authorization_url, deepLink, {
      dismissButtonStyle: 'cancel',
    });

    if (result.type !== 'success') {
      throw new Error('Google Calendar connection was cancelled.');
    }

    status = await api.googleAuthStatus();
    if (!status.connected || !status.calendar_connected) {
      throw new Error('Google Calendar still not connected after authorization — try again.');
    }
  }

  // Live read straight from Google (soonest-first) -- no sync step needed,
  // unlike Gmail's DB-backed /gmail/messages.
  const events = await api.listGoogleCalendarEvents(10, false);

  if (!events.length) {
    return { summary: 'Google Calendar connected, but no upcoming events found.' };
  }

  const preview = events
    .slice(0, 10)
    .map((event) => `${event.summary || '(no title)'} — ${formatEventTime(event)}`)
    .join('\n');

  return { summary: `Top ${events.length} upcoming event(s):\n${preview}` };
}
