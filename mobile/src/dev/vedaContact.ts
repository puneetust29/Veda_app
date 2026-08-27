// Dev-only duplicate of config/vedaContact.ts, kept separate so the
// integrations catalog never depends on production config. Promote
// deliberately to config/ if a real feature needs this later.
export const VEDA_CONTACT = {
  name: process.env.EXPO_PUBLIC_VEDA_CONTACT_NAME || 'Friend',
  phoneNumberE164: process.env.EXPO_PUBLIC_VEDA_CONTACT_PHONE || '+919876543210',
  email: process.env.EXPO_PUBLIC_VEDA_CONTACT_EMAIL || '',
};
