# Mobile App UI Unification for Google Auth

## Summary

Unified the mobile app UI to use a single Google authentication flow for both Calendar and Gmail. Users now authenticate once instead of twice.

## Mobile App Changes

### 1. **AccountSelectionScreen.tsx** (Onboarding)
   - ✅ Updated to use unified `api.startGoogleAuth()` instead of separate calendar and gmail auth
   - ✅ Updated status check to use `api.googleAuthStatus()`
   - ✅ Updated disconnect to use `api.disconnectGoogleAuth()`
   - ✅ Updated return path from `'google-calendar'` to `'google-auth-complete'`
   - ✅ Updated UI to show both Calendar and Gmail services in a single card
   - ✅ Shows checkmarks for each service (Calendar/Gmail) indicating which are granted
   - ✅ Shows warning if either Calendar or Gmail scopes are missing
   - ✅ Button text changed from "Connect Gmail" to "Connect Google"

### 2. **GmailScreen.tsx** (Gmail Inbox View)
   - ✅ Updated `checkStatus()` to use `api.googleAuthStatus()` 
   - ✅ Checks both `status.connected` AND `status.gmail_connected` for Gmail access
   - ✅ Updated `handleConnect()` to use `api.startGoogleAuth()`
   - ✅ Updated return path to `'google-auth-complete'`
   - ✅ Updated `handleDisconnect()` to use `api.disconnectGoogleAuth()`
   - ✅ Updated disconnect alert message to mention both Calendar and Gmail

### 3. **DashboardScreen.tsx** (Main Dashboard)
   - ✅ Updated `silentlySyncCalendars()` to use `api.googleAuthStatus()`
   - ✅ Updated check from `status.connected` to `status.calendar_connected`

### 4. **api.ts** (API Helpers)
   - ✅ Added unified auth methods (already done in previous step):
     - `googleAuthStatus()`
     - `startGoogleAuth()`
     - `disconnectGoogleAuth()`
   - ✅ Kept old methods for backward compatibility:
     - `startGoogleCalendarAuth()`
     - `startGmailAuth()`
     - `googleCalendarStatus()`
     - `gmailStatus()`

### 5. **types.ts** (TypeScript Types)
   - ✅ Updated `GoogleCalendarStatus` type to include:
     - `calendar_connected?: boolean` — True if Calendar scope is granted
     - `gmail_connected?: boolean` — True if Gmail scope is granted

## UI/UX Changes

### Before
- AccountSelectionScreen showed only "Gmail" (which actually synced Calendar too)
- Separate auth buttons for Calendar and Gmail required users to click twice
- Two separate OAuth consent screens
- Users had to authenticate through `/calendar/google/callback` and `/gmail/callback`

### After
- AccountSelectionScreen shows "Google Account (Calendar + Gmail)"
- Single button "Connect Google" instead of separate Calendar/Gmail buttons
- Single OAuth consent screen requesting both scopes at once
- Both services use `/auth/google/callback` unified endpoint
- Status page shows individual checkmarks for Calendar and Gmail
- Clear indication of which services are connected
- Warning shows if either service scope is missing

## Visual Changes

### AccountSelectionScreen
```
┌─────────────────────────────────┐
│ Google Account (Calendar + Gmail) │
├─────────────────────────────────┤
│ user@gmail.com          ✓ (icon) │
├─────────────────────────────────┤
│ Services:                         │
│  📅 Calendar       ✓              │
│  ✉️  Gmail        ✓              │
├─────────────────────────────────┤
│  [   Connect Google   ]          │
└─────────────────────────────────┘
```

### GmailScreen
- Still shows Gmail-specific UI
- "Connect Gmail" button now triggers unified Google auth
- Works seamlessly with Calendar (both synced in one auth)

## Testing Checklist

- [ ] Go through AccountSelectionScreen onboarding
  - [ ] Click "Connect Google"
  - [ ] Verify unified OAuth consent screen requests both scopes
  - [ ] Verify both Calendar and Gmail show ✓ after auth
  - [ ] Verify user name is populated from Google profile
- [ ] Navigate to Gmail screen
  - [ ] Verify Gmail sync works
  - [ ] Verify "Disconnect" mentions both Calendar and Gmail
  - [ ] Verify disconnect removes both Calendar and Gmail credentials
- [ ] Navigate to Dashboard
  - [ ] Verify calendar events sync silently
  - [ ] Verify refresh pulls latest events
- [ ] Navigate back to AccountSelectionScreen
  - [ ] Verify "Disconnect" button appears when already connected

## Backend Compatibility

All changes are fully backward compatible:
- Old API endpoints (`/calendar/google/connect`, `/gmail/connect`) still work
- Old mobile methods (`startGoogleCalendarAuth()`, `startGmailAuth()`) still function
- Apps can mix old and new endpoints (both store to same credential tables)

## Notes

- Deep link scheme changed from `veda://google-calendar` and `veda://gmail` to `veda://google-auth-complete`
- Update `app.json` if you have custom deep link schemes defined
- Same Google OAuth credentials and scopes are used — no backend config changes needed (only Google Cloud Console update)

## Related Files

- Backend: `backend/app/routers/google_auth.py`
- Backend: `backend/app/integrations/google_auth.py`
- Config: `backend/app/config.py`
- Migration Guide: `GOOGLE_AUTH_MIGRATION.md`
