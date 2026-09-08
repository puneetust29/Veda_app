import * as Linking from 'expo-linking';

export function buildWaMeUrl(phoneNumberE164: string, text: string): string {
  const digitsOnly = phoneNumberE164.replace(/\D/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(text)}`;
}

export async function shareToWhatsApp(phoneNumberE164: string, text: string): Promise<void> {
  const url = buildWaMeUrl(phoneNumberE164, text);
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error('Cannot open WhatsApp URL');
  }
  await Linking.openURL(url);
}
