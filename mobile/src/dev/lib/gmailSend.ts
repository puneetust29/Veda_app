import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api } from '../../lib/api';
import { VEDA_CONTACT } from '../vedaContact';

const SEND_SCOPE = 'gmail.send';

async function connectGmail(): Promise<void> {
  const deepLink = Linking.createURL('google-auth-complete');
  const { authorization_url } = await api.startGoogleAuth(deepLink);
  const result = await WebBrowser.openAuthSessionAsync(authorization_url, deepLink, {
    dismissButtonStyle: 'cancel',
  });

  if (result.type !== 'success') {
    throw new Error('Gmail connection was cancelled.');
  }
}

export async function sendGmailSample(): Promise<{ summary: string }> {
  if (!VEDA_CONTACT.email) {
    throw new Error(
      'Set EXPO_PUBLIC_VEDA_CONTACT_EMAIL in mobile/.env to the address this should send to.',
    );
  }

  let status = await api.googleAuthStatus();

  // Force a fresh consent whenever the stored grant predates the send scope
  // -- Google's consent screen always re-prompts (prompt=consent server-side),
  // so reconnecting picks up gmail.send without a separate "upgrade" flow.
  const hasSendScope = (status.scope ?? '').includes(SEND_SCOPE);
  if (!status.connected || !status.gmail_connected || !hasSendScope) {
    await connectGmail();
    status = await api.googleAuthStatus();
    if (!status.connected || !status.gmail_connected || !(status.scope ?? '').includes(SEND_SCOPE)) {
      throw new Error('Gmail still missing send permission after reconnecting — try again.');
    }
  }

  const subject = "Hi from Veda's integrations catalog";
  const body = 'Hi,\n\nThis is a test email sent from the Veda app to showcase the Gmail send integration.\n\n— Veda';

  const result = await api.sendGmail({ to: VEDA_CONTACT.email, subject, body });

  return {
    summary: `Sent "${subject}" to ${VEDA_CONTACT.email}${
      result.gmail_message_id ? ` (id: ${result.gmail_message_id})` : ''
    }.`,
  };
}
