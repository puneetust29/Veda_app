"""Unified Google OAuth 2.0 for Calendar and Gmail.

Single auth flow that requests both calendar.events and gmail scopes,
storing credentials for both services in one consent.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode, urlsplit

from app.config import get_settings
from app.db.client import get_supabase
from app.integrations import google_oauth

_ALLOWED_REDIRECT_SCHEMES = re.compile(r"^(veda|exp|exp\+[a-z0-9._-]+)$", re.IGNORECASE)
_STATE_TTL = timedelta(minutes=10)


def sanitize_app_redirect(app_redirect: Optional[str]) -> Optional[str]:
    """Return the redirect if its scheme is allowlisted, else None."""
    if not app_redirect:
        return None
    scheme = urlsplit(app_redirect).scheme
    return app_redirect if _ALLOWED_REDIRECT_SCHEMES.match(scheme) else None


def start_authorization(customer_id: str, app_redirect: Optional[str] = None) -> str:
    """Begin unified Calendar + Gmail OAuth. Returns authorization URL."""
    pkce = google_oauth.make_pkce_pair()
    state = google_oauth.make_state()
    supabase = get_supabase()

    # Sweep expired states
    supabase.table("google_oauth_states").delete().lt(
        "expires_at", datetime.now(timezone.utc).isoformat()
    ).execute()

    supabase.table("google_oauth_states").insert(
        {
            "state": state,
            "customer_id": customer_id,
            "code_verifier": pkce.verifier,
            "app_redirect": sanitize_app_redirect(app_redirect),
            "expires_at": (datetime.now(timezone.utc) + _STATE_TTL).isoformat(),
        }
    ).execute()

    return _build_authorization_url(state=state, code_challenge=pkce.challenge)


def _build_authorization_url(state: str, code_challenge: str) -> str:
    """Build authorization URL with both calendar and gmail scopes."""
    settings = get_settings()
    # Combine both scope lists
    all_scopes = settings.google_scope_list + settings.google_gmail_scope_list

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(all_scopes),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def complete_authorization(state: str, code: str) -> dict:
    """Redeem the OAuth callback and store credentials for both services."""
    supabase = get_supabase()
    found = (
        supabase.table("google_oauth_states").select("*").eq("state", state).limit(1).execute()
    )
    if not found.data:
        raise ValueError("Unknown or already-used OAuth state.")

    handshake = found.data[0]
    supabase.table("google_oauth_states").delete().eq("state", state).execute()

    # Check expiry
    expires_at = datetime.fromisoformat(handshake["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        raise ValueError("OAuth handshake expired — start again.")

    # Exchange code for tokens
    tokens = google_oauth.exchange_code(code=code, code_verifier=handshake["code_verifier"])

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise ValueError(
            "Google returned no refresh_token. Revoke the app's access at "
            "https://myaccount.google.com/permissions and connect again."
        )

    # Get user email from profile
    email: Optional[str] = None
    given_name: Optional[str] = None
    full_name: Optional[str] = None
    try:
        profile = google_oauth.userinfo(tokens["access_token"])
        email = profile.get("email")
        given_name = profile.get("given_name")
        full_name = profile.get("name")
    except Exception:
        pass

    customer_id = handshake["customer_id"]

    # Store credentials for BOTH calendar and gmail in the same table
    # (they share the same OAuth token from a single unified consent)
    _store_calendar_credentials(
        customer_id=customer_id,
        refresh_token=refresh_token,
        access_token=tokens["access_token"],
        expires_in=tokens.get("expires_in", 3600),
        scope=tokens.get("scope", ""),
        email=email,
    )

    # Gmail uses the same credentials, so we just mark it as connected
    # by storing in gmail_credentials table if it exists, otherwise skip
    try:
        _store_gmail_credentials(
            customer_id=customer_id,
            refresh_token=refresh_token,
            access_token=tokens["access_token"],
            expires_in=tokens.get("expires_in", 3600),
            scope=tokens.get("scope", ""),
            email=email,
        )
    except Exception:
        # If gmail_credentials table doesn't exist, that's fine
        # The access token works for both services
        pass

    # Update customer name from profile if present
    if given_name or full_name:
        _adopt_google_name(
            customer_id=customer_id,
            given_name=given_name,
            full_name=full_name,
        )

    return {
        "google_account_email": email,
        "scope": tokens.get("scope", ""),
        "app_redirect": handshake.get("app_redirect"),
    }


_PLACEHOLDER_CUSTOMER_NAME = "New Customer"


def _adopt_google_name(
    *, customer_id: str, given_name: Optional[str], full_name: Optional[str]
) -> None:
    """Fill in customer name from Google profile, once."""
    supabase = get_supabase()
    existing = (
        supabase.table("customers").select("full_name").eq("id", customer_id).limit(1).execute()
    )
    if not existing.data or existing.data[0].get("full_name") != _PLACEHOLDER_CUSTOMER_NAME:
        return
    supabase.table("customers").update({"full_name": full_name or given_name}).eq(
        "id", customer_id
    ).execute()


def _store_calendar_credentials(
    *,
    customer_id: str,
    refresh_token: str,
    access_token: str,
    expires_in: int,
    scope: str,
    email: Optional[str],
) -> dict:
    """Store Google Calendar credentials."""
    supabase = get_supabase()
    row = {
        "customer_id": customer_id,
        "refresh_token": refresh_token,
        "access_token": access_token,
        "access_token_expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        ).isoformat(),
        "scope": scope,
        "google_account_email": email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = (
        supabase.table("google_calendar_credentials")
        .upsert(row, on_conflict="customer_id")
        .execute()
    )
    return result.data[0] if result.data else row


def _store_gmail_credentials(
    *,
    customer_id: str,
    refresh_token: str,
    access_token: str,
    expires_in: int,
    scope: str,
    email: Optional[str],
) -> dict:
    """Store Gmail credentials. Uses same access token as Calendar."""
    supabase = get_supabase()
    row = {
        "customer_id": customer_id,
        "refresh_token": refresh_token,
        "access_token": access_token,
        "access_token_expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        ).isoformat(),
        "scope": scope,
        "google_account_email": email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = (
            supabase.table("gmail_credentials")
            .upsert(row, on_conflict="customer_id")
            .execute()
        )
        return result.data[0] if result.data else row
    except Exception:
        # Table may not exist; Gmail uses the same credentials as Calendar anyway
        return row
