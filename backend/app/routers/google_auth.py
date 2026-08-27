"""Unified Google OAuth endpoints for Calendar + Gmail in a single auth flow."""
from __future__ import annotations

import html
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.config import get_settings
from app.deps import get_current_customer
from app.integrations import google_auth, google_calendar, google_gmail

router = APIRouter(prefix="/auth/google", tags=["google-auth"])


def _require_google_configured() -> None:
    if not get_settings().google_calendar_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and "
                "GOOGLE_CLIENT_SECRET in the backend environment."
            ),
        )


@router.get("/status")
def google_auth_status(customer: dict = Depends(get_current_customer)) -> dict:
    """Check if customer is authenticated with Google (for both Calendar and Gmail)."""
    settings = get_settings()
    if not settings.google_calendar_configured:
        return {"configured": False, "connected": False}

    try:
        calendar_connection = google_calendar.get_connection(customer["id"])
    except Exception:
        calendar_connection = None

    try:
        gmail_connection = google_gmail.get_connection(customer["id"])
    except Exception:
        # Gmail table may not exist; fall back to calendar credentials
        gmail_connection = calendar_connection

    # Both services are connected if we have credentials from the unified auth
    is_connected = calendar_connection is not None

    return {
        "configured": True,
        "connected": is_connected,
        "calendar_connected": calendar_connection is not None,
        "gmail_connected": is_connected,  # Same as calendar since they share the token
        "google_account_email": (calendar_connection or {}).get("google_account_email"),
    }


class GoogleAuthConnectRequest(BaseModel):
    """Request to start Google OAuth flow."""

    app_redirect: str | None = None


@router.post("/connect")
def google_auth_connect(
    payload: GoogleAuthConnectRequest | None = None,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Begin unified Google OAuth flow for Calendar + Gmail.

    The client opens `authorization_url` in a browser. After consent, Google
    redirects to /auth/google/callback which stores credentials for both services.
    """
    _require_google_configured()
    return {
        "authorization_url": google_auth.start_authorization(
            customer["id"], app_redirect=(payload.app_redirect if payload else None)
        )
    }


@router.get("/callback", response_class=HTMLResponse)
def google_auth_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """OAuth callback from Google after unified consent.

    Deliberately unauthenticated: this is a fresh browser navigation with no
    Authorization header. The `state` parameter ties this back to the customer.
    Stores credentials for both Calendar and Gmail in one exchange.
    """
    _require_google_configured()

    if error:
        return _callback_page("Authorization failed", f"Google returned: {error}", ok=False)
    if not state or not code:
        return _callback_page("Authorization failed", "Missing code or state.", ok=False)

    try:
        result = google_auth.complete_authorization(state=state, code=code)
    except ValueError as exc:
        return _callback_page("Authorization failed", str(exc), ok=False)

    account = result.get("google_account_email") or "your Google account"
    app_redirect = result.get("app_redirect")

    if app_redirect:
        separator = "&" if "?" in app_redirect else "?"
        return HTMLResponse(
            f"""<!doctype html><script>location.replace('{html.escape(app_redirect)}{separator}status=connected');</script>
Redirecting...""",
            status_code=302,
        )

    return _callback_page(
        "Google authenticated",
        f"Connected {account}. Calendar and Gmail are now synced. You can close this tab.",
        app_redirect=app_redirect,
    )


def _callback_page(
    heading: str, message: str, *, ok: bool = True, app_redirect: str | None = None
) -> HTMLResponse:
    """Render the end of the OAuth flow, then bounce back into the mobile app."""
    colour = "#137333" if ok else "#b00020"
    target = google_auth.sanitize_app_redirect(app_redirect) or (
        get_settings().google_post_auth_redirect
    )
    separator = "&" if "?" in target else "?"
    deep_link = f"{target}{separator}status={'connected' if ok else 'failed'}"
    safe_link = html.escape(deep_link, quote=True)

    return HTMLResponse(
        f"""<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font:16px system-ui;padding:40px;max-width:32rem">
<h2 style="color:{colour}">{html.escape(heading)}</h2>
<p>{html.escape(message)}</p>
<p><a href="{safe_link}" style="color:#0a66c2;font-weight:600">Return to Veda</a></p>
<script>
  // For Expo Web: signal success via postMessage to parent window
  if (window.opener) {{
    window.opener.postMessage({{'success': {str(ok).lower()}}}, '*');
  }}
  // For mobile: attempt deep link redirect
  setTimeout(() => {{ location.replace({json.dumps(deep_link)}); }}, 100);
</script>
</body>""",
        status_code=200 if ok else 400,
    )


@router.delete("/connection")
def google_auth_disconnect(customer: dict = Depends(get_current_customer)) -> dict:
    """Revoke and disconnect both Calendar and Gmail."""
    _require_google_configured()
    calendar_disconnected = google_calendar.disconnect(customer["id"])
    gmail_disconnected = google_gmail.disconnect(customer["id"])
    return {
        "calendar_disconnected": calendar_disconnected,
        "gmail_disconnected": gmail_disconnected,
    }
