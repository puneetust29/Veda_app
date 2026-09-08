import * as Linking from 'expo-linking';

// Dev-only duplicate of lib/whatsapp.ts's shareToWhatsApp, kept intentionally
// separate so the integrations catalog never depends on production code paths.
// If a real feature needs this later, promote it to lib/ deliberately rather
// than importing this copy.
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
