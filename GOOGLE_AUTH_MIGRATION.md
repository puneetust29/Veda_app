# Unified Google OAuth Implementation

## Overview

This implementation consolidates Google Calendar and Gmail authentication into a **single OAuth flow**, eliminating the need for users to authenticate twice.

**Before:** Users had to authenticate separately for Calendar and Gmail with two different consent screens.
**After:** One unified auth flow requests both calendar and gmail scopes in a single consent.

## Backend Changes

### New Files Created

1. **`backend/app/integrations/google_auth.py`** - Unified OAuth module
   - Combines calendar and gmail scopes into one authorization request
   - Stores credentials for both services after a single token exchange
   - Handles profile information and customer name adoption

2. **`backend/app/routers/google_auth.py`** - New API endpoints
   - `POST /auth/google/connect` - Start unified OAuth flow
   - `GET /auth/google/callback` - Handle OAuth callback (stores both calendar + gmail credentials)
   - `GET /auth/google/status` - Check authentication status for both services
   - `DELETE /auth/google/connection` - Disconnect both services at once

### Modified Files

1. **`backend/app/config.py`**
   - Unified `google_redirect_uri` to `http://localhost:8000/auth/google/callback`
   - Removed duplicate redirect URIs
   - Simplified configuration (single redirect for both services)

2. **`backend/app/main.py`**
   - Added import and registration of new `google_auth` router

### Backward Compatibility

The old endpoints remain functional:
- `POST /calendar/google/connect` - Still works
- `GET /calendar/google/callback` - Still works
- `POST /gmail/connect` - Still works
- `GET /gmail/callback` - Still works

This allows existing mobile apps to continue working without changes.

## Mobile App Changes

### Updated Files

**`mobile/src/lib/api.ts`** - Added unified OAuth methods:

```typescript
// NEW: Unified Google Auth (single flow for both Calendar + Gmail)
googleAuthStatus: () => authedFetch<GoogleCalendarStatus>('/auth/google/status'),
startGoogleAuth: (appRedirect: string) =>
  authedFetch<{ authorization_url: string }>('/auth/google/connect', {...}),
disconnectGoogleAuth: () =>
  authedFetch<{ calendar_disconnected: boolean; gmail_disconnected: boolean }>('/auth/google/connection', {...}),
```

**Old methods are still available** for backward compatibility:
- `startGoogleCalendarAuth()` - Still works
- `startGmailAuth()` - Still works
- `googleCalendarStatus()` - Still works
- `gmailStatus()` - Still works

## How to Update the Mobile App UI

### Option 1: Single Button (Recommended)

Replace separate Calendar and Gmail auth buttons with one:

```typescript
const handleUnifiedGoogleAuth = async () => {
  const appRedirect = Linking.createURL('/');
  const { authorization_url } = await api.startGoogleAuth(appRedirect);
  
  const result = await WebBrowser.openAuthSessionAsync(
    authorization_url,
    appRedirect,
  );
  
  if (result.type === 'success') {
    // Both Calendar and Gmail are now connected
    const status = await api.googleAuthStatus();
    console.log('Calendar connected:', status.calendar_connected);
    console.log('Gmail connected:', status.gmail_connected);
  }
};
```

### Option 2: Keep Both Buttons (Use New Unified Endpoint)

If your UI has separate buttons, both can now use the same auth flow:

```typescript
// Both buttons call the same endpoint
<Button onPress={handleUnifiedGoogleAuth}>Sync Calendar & Gmail</Button>

// Or keep them separate but they'll both complete in one auth
<Button onPress={handleUnifiedGoogleAuth}>Sync Calendar</Button>
<Button onPress={handleUnifiedGoogleAuth}>Sync Gmail</Button>
```

## Google Cloud Console Configuration

### IMPORTANT: Update Redirect URI

You must update your Google Cloud OAuth configuration:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services → Credentials**
4. Find your OAuth 2.0 Client ID
5. Click **Edit** (pencil icon)
6. Under **Authorized redirect URIs**, update:
   - **Remove:** `http://localhost:8000/calendar/google/callback`
   - **Remove:** `http://localhost:8000/gmail/callback`
   - **Add:** `http://localhost:8000/auth/google/callback`
   - For production, update accordingly (e.g., `https://yourapi.com/auth/google/callback`)

7. Ensure **both** scopes are still present:
   - `.../auth/calendar.events` - View and edit calendar events
   - `.../auth/gmail.readonly` or `.../auth/gmail.send` - Email access

8. Click **Save**

### Environment Variables

No changes needed — use the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The `google_redirect_uri` is now automatically set to `/auth/google/callback` in the code.

## Deep Link Configuration

Update your mobile app deep link scheme if needed:

**Old:** `veda://google-calendar` and `veda://gmail`  
**New:** `veda://google-auth-complete` (unified)

If you want to keep both working, you can add both to `app.json`:

```json
{
  "expo": {
    "scheme": ["veda", "exp"],
    "plugins": [
      [
        "expo-linking",
        {
          "schemes": ["veda", "exp"]
        }
      ]
    ]
  }
}
```

## Testing

### Test the Unified Flow

```bash
# Backend must be running
curl -X POST http://localhost:8000/auth/google/connect \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"app_redirect": "veda://google-auth-complete"}'
```

The response will include an `authorization_url` that requests both calendar and gmail scopes.

### Verify Credentials Are Stored for Both Services

After completing auth, check both status endpoints:

```bash
curl http://localhost:8000/auth/google/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response will show:
# {
#   "configured": true,
#   "connected": true,
#   "calendar_connected": true,
#   "gmail_connected": true,
#   "google_account_email": "user@gmail.com"
# }
```

## Scope Changes

Both services now get the **same access token**, so scopes are combined:

```
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.readonly
```

Or if you use `gmail.send`:

```
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.send
```

Edit `GOOGLE_CALENDAR_SCOPES` and `GOOGLE_GMAIL_SCOPES` in `.env` to modify.

## Rollback (If Needed)

If you need to keep the old separate flows, they're still fully functional:

- Old endpoints continue to work
- Users can still authenticate Calendar and Gmail separately
- Just don't migrate the mobile app UI to use the new endpoint

## Summary of Benefits

✅ **Users authenticate once** instead of twice  
✅ **Better UX** - single consent screen  
✅ **Same credentials for both services** - shared refresh token  
✅ **Backward compatible** - old endpoints still work  
✅ **Simpler config** - one redirect URI instead of two  
✅ **Unified management** - `/auth/google/status` and `/auth/google/connection` handle both  

## Questions?

- Backend auth logic: `backend/app/integrations/google_auth.py`
- API endpoints: `backend/app/routers/google_auth.py`
- Mobile integration: `mobile/src/lib/api.ts`
- Config: `backend/app/config.py`
