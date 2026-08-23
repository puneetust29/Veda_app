"""Google Gmail: credential storage, token freshness, and API calls.

Mirrors the google_calendar.py pattern: refresh tokens live server-side only,
and token management follows the same PKCE security model.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx

from app.config import get_settings
from app.db.client import get_supabase
from app.integrations import google_oauth

GMAIL_API = "https://www.googleapis.com/gmail/v1"

# Refresh this far before actual expiry so a request can't expire in flight.
_EXPIRY_SLACK = timedelta(seconds=60)
_STATE_TTL = timedelta(minutes=10)
_TIMEOUT = httpx.Timeout(15.0)


class GmailNotConnected(RuntimeError):
    """This customer has no stored Gmail credentials."""


class GmailError(RuntimeError):
    """The Gmail API rejected a request."""


# Schemes the callback page is allowed to bounce back to.
_ALLOWED_REDIRECT_SCHEMES = re.compile(r"^(veda|exp|exp\+[a-z0-9._-]+)$", re.IGNORECASE)


def sanitize_app_redirect(app_redirect: Optional[str]) -> Optional[str]:
    """Return the redirect if its scheme is allowlisted, else None (caller defaults)."""
    if not app_redirect:
        return None
    scheme = urlsplit(app_redirect).scheme
    return app_redirect if _ALLOWED_REDIRECT_SCHEMES.match(scheme) else None


def start_authorization(customer_id: str, app_redirect: Optional[str] = None) -> str:
    """Create a single-use PKCE handshake for Gmail and return the authorization URL."""
    pkce = google_oauth.make_pkce_pair()
    state = google_oauth.make_state()
    supabase = get_supabase()

    # Opportunistic sweep of expired states.
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
    """Build Gmail-specific authorization URL with gmail.readonly scope."""
    settings = get_settings()
    from urllib.parse import urlencode

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_gmail_redirect_uri,
        "response_type": "code",
        "scope": " ".join(settings.google_gmail_scope_list),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def complete_authorization(state: str, code: str) -> dict:
    """Redeem the Gmail OAuth callback. Returns the stored credential row."""
    supabase = get_supabase()
    found = (
        supabase.table("google_oauth_states").select("*").eq("state", state).limit(1).execute()
    )
    if not found.data:
        raise GmailError("Unknown or already-used OAuth state.")

    handshake = found.data[0]
    supabase.table("google_oauth_states").delete().eq("state", state).execute()

    if _parse_ts(handshake["expires_at"]) < datetime.now(timezone.utc):
        raise GmailError("OAuth handshake expired — start again.")

    settings = get_settings()
    tokens = google_oauth.exchange_code(
        code=code,
        code_verifier=handshake["code_verifier"],
        redirect_uri=settings.google_gmail_redirect_uri
    )

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise GmailError(
            "Google returned no refresh_token. Revoke the app's access at "
            "https://myaccount.google.com/permissions and connect again."
        )

    email: Optional[str] = None
    try:
        profile = google_oauth.userinfo(tokens["access_token"])
        email = profile.get("email")
    except google_oauth.GoogleOAuthError:
        pass

    credentials = _store_credentials(
        customer_id=handshake["customer_id"],
        refresh_token=refresh_token,
        access_token=tokens["access_token"],
        expires_in=tokens.get("expires_in", 3600),
        scope=tokens.get("scope", ""),
        email=email,
    )
    return {**credentials, "app_redirect": handshake.get("app_redirect")}


def _store_credentials(
    *,
    customer_id: str,
    refresh_token: str,
    access_token: str,
    expires_in: int,
    scope: str,
    email: Optional[str],
) -> dict:
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
        supabase.table("gmail_credentials")
        .upsert(row, on_conflict="customer_id")
        .execute()
    )
    return result.data[0]


def get_connection(customer_id: str) -> Optional[dict]:
    """Retrieve the Gmail connection for a customer.

    Checks gmail_credentials first, then falls back to google_calendar_credentials
    (since the unified OAuth flow stores in google_calendar_credentials).
    """
    supabase = get_supabase()

    # Try gmail_credentials first
    result = (
        supabase.table("gmail_credentials")
        .select("*")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]

    # Fall back to google_calendar_credentials (unified auth stores there)
    result = (
        supabase.table("google_calendar_credentials")
        .select("*")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def disconnect(customer_id: str) -> bool:
    """Revoke at Google, then drop the credentials. Returns False if nothing was connected."""
    connection = get_connection(customer_id)
    if not connection:
        return False

    google_oauth.revoke(connection["refresh_token"])
    get_supabase().table("gmail_credentials").delete().eq(
        "customer_id", customer_id
    ).execute()
    return True


def get_valid_access_token(customer_id: str, *, force_refresh: bool = False) -> str:
    """Get a fresh Gmail access token, refreshing if needed."""
    connection = get_connection(customer_id)
    if not connection:
        raise GmailNotConnected(f"customer {customer_id} has not connected Gmail")

    if not force_refresh and _token_is_fresh(connection):
        return connection["access_token"]

    tokens = google_oauth.refresh_access_token(connection["refresh_token"])
    _store_credentials(
        customer_id=customer_id,
        refresh_token=connection["refresh_token"],
        access_token=tokens["access_token"],
        expires_in=tokens.get("expires_in", 3600),
        scope=tokens.get("scope", connection.get("scope", "")),
        email=connection.get("google_account_email"),
    )
    return tokens["access_token"]


def _token_is_fresh(connection: dict) -> bool:
    if not connection.get("access_token") or not connection.get("access_token_expires_at"):
        return False
    return _parse_ts(connection["access_token_expires_at"]) - _EXPIRY_SLACK > datetime.now(
        timezone.utc
    )


def _parse_ts(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _request(
    customer_id: str,
    method: str,
    path: str,
    *,
    params: Optional[dict] = None,
    json: Optional[dict] = None,
    _is_retry: bool = False,
) -> Any:
    """Make an authenticated request to the Gmail API."""
    access_token = get_valid_access_token(customer_id, force_refresh=_is_retry)

    with httpx.Client(timeout=_TIMEOUT) as client:
        response = client.request(
            method,
            f"{GMAIL_API}{path}",
            params=params,
            json=json,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if response.status_code == 401 and not _is_retry:
        return _request(customer_id, method, path, params=params, json=json, _is_retry=True)

    if response.status_code == 204:
        return None
    if response.status_code >= 400:
        raise GmailError(f"{method} {path} returned {response.status_code}: {response.text}")
    return response.json()


def list_messages(
    customer_id: str,
    *,
    max_results: int = 10,
    page_token: Optional[str] = None,
) -> dict:
    """List Gmail messages from the inbox with full details."""
    payload = _request(
        customer_id,
        "GET",
        "/users/me/messages",
        params={
            "q": "in:inbox",
            "maxResults": max_results,
            "pageToken": page_token,
        },
    )

    # Fetch full message details for each message
    messages = []
    for msg_summary in payload.get("messages", []):
        try:
            full_msg = get_message(customer_id, msg_summary["id"])
            messages.append(_parse_message(full_msg))
        except Exception:
            # Skip messages that can't be fetched
            continue

    return {
        "messages": messages,
        "result_size_estimate": payload.get("resultSizeEstimate", 0),
        "next_page_token": payload.get("nextPageToken"),
    }


def get_message(customer_id: str, message_id: str) -> dict:
    """Fetch the full content of a Gmail message."""
    return _request(customer_id, "GET", f"/users/me/messages/{message_id}", params={"format": "full"})


def sync_to_database(
    customer_id: str,
    *,
    max_results: int = 10,
) -> dict:
    """Fetch messages from Gmail and sync them to the database.

    Upserts on (customer_id, gmail_message_id) so running this repeatedly
    is safe and updates propagate.
    """
    result = list_messages(customer_id, max_results=max_results)
    messages = result.get("messages", [])

    rows = []
    for msg_summary in messages:
        message_id = msg_summary["id"]
        try:
            full_msg = get_message(customer_id, message_id)
            parsed = _parse_message(full_msg)
            parsed["customer_id"] = customer_id
            rows.append(parsed)
        except GmailError:
            # Skip messages we can't fetch
            continue

    if rows:
        get_supabase().table("gmail_messages").upsert(
            rows, on_conflict="customer_id,gmail_message_id"
        ).execute()

    return {
        "fetched": len(messages),
        "synced": len(rows),
        "result_size_estimate": result.get("result_size_estimate", 0),
    }


def _parse_message(full_msg: dict) -> dict:
    """Extract relevant fields from a Gmail API message."""
    headers = full_msg.get("payload", {}).get("headers", [])
    header_dict = {h["name"]: h["value"] for h in headers}

    # Parse received_at from Gmail's internalDate (milliseconds since epoch).
    internal_date_ms = int(full_msg.get("internalDate", 0))
    received_at = (
        datetime.fromtimestamp(internal_date_ms / 1000.0, tz=timezone.utc).isoformat()
        if internal_date_ms
        else None
    )

    return {
        "gmail_message_id": full_msg["id"],
        "sender": header_dict.get("From", ""),
        "subject": header_dict.get("Subject", ""),
        "body": _get_message_body(full_msg),
        "received_at": received_at,
        "labels": full_msg.get("labelIds", []),
        "is_read": "UNREAD" not in full_msg.get("labelIds", []),
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


def _get_message_body(message: dict) -> str:
    """Extract the body from a Gmail message, handling multipart."""
    payload = message.get("payload", {})

    # Simple text/plain message
    if payload.get("mimeType") == "text/plain":
        body_data = payload.get("body", {}).get("data", "")
        if body_data:
            import base64

            return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="ignore")

    # Multipart message; look for text/plain part
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain":
            body_data = part.get("body", {}).get("data", "")
            if body_data:
                import base64

                return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="ignore")

    return ""
