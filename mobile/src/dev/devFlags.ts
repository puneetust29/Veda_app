// Dev-only feature flags, set via build-time env vars (see .env.example).
// These gate entry points that should stay invisible to normal users.
export const DEV_CATALOG_ENABLED = process.env.EXPO_PUBLIC_ENABLE_DEV_CATALOG === '1';
