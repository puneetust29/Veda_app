import html
import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.config import get_settings
from app.db.client import get_supabase
from app.deps import get_current_customer
from app.integrations import google_gmail, google_oauth, gmail_email_agent

router = APIRouter(prefix="/gmail", tags=["gmail"])


def _require_gmail_configured() -> None:
    if not get_settings().google_gmail_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Gmail is not configured. Set GOOGLE_CLIENT_ID and "
                "GOOGLE_CLIENT_SECRET in the backend environment."
            ),
        )


@router.get("/status")
def gmail_status(customer: dict = Depends(get_current_customer)) -> dict:
    """Whether this customer has a live Gmail connection."""
    settings = get_settings()
    if not settings.google_gmail_configured:
        return {"configured": False, "connected": False}

    try:
        connection = google_gmail.get_connection(customer["id"])
    except Exception:
        connection = None

    return {
        "configured": True,
        "connected": connection is not None,
        "google_account_email": (connection or {}).get("google_account_email"),
        "scope": (connection or {}).get("scope"),
    }


class GmailConnectRequest(BaseModel):
    """Body for POST /gmail/connect."""

    app_redirect: str | None = None


@router.post("/connect")
def gmail_connect(
    payload: GmailConnectRequest | None = None,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Begin the Gmail consent flow. The client opens `authorization_url` in a browser."""
    _require_gmail_configured()
    return {
        "authorization_url": google_gmail.start_authorization(
            customer["id"], app_redirect=(payload.app_redirect if payload else None)
        )
    }


@router.get("/callback", response_class=HTMLResponse)
def gmail_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """Where Google redirects the browser after Gmail consent.

    Deliberately unauthenticated: this is a fresh browser navigation.
    """
    _require_gmail_configured()

    if error:
        return _callback_page("Authorization failed", f"Google returned: {error}", ok=False)
    if not state or not code:
        return _callback_page("Authorization failed", "Missing code or state.", ok=False)

    try:
        connection = google_gmail.complete_authorization(state=state, code=code)
    except (google_gmail.GmailError, google_oauth.GoogleOAuthError) as exc:
        return _callback_page("Authorization failed", str(exc), ok=False)

    account = connection.get("google_account_email") or "your Google account"
    app_redirect = connection.get("app_redirect")

    if app_redirect:
        separator = "&" if "?" in app_redirect else "?"
        return HTMLResponse(
            f"""<!doctype html><script>location.replace('{html.escape(app_redirect)}{separator}status=connected');</script>
Redirecting...""",
            status_code=302,
        )

    return _callback_page(
        "Gmail connected",
        f"Connected {account}. You can close this tab.",
        app_redirect=app_redirect,
    )


def _callback_page(
    heading: str, message: str, *, ok: bool = True, app_redirect: str | None = None
) -> HTMLResponse:
    """Render the end of the Gmail consent flow, then bounce back into the mobile app."""
    colour = "#137333" if ok else "#b00020"
    target = google_gmail.sanitize_app_redirect(app_redirect) or (
        get_settings().google_gmail_post_auth_redirect
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
def gmail_disconnect(customer: dict = Depends(get_current_customer)) -> dict:
    """Revoke at Google and forget the credentials."""
    _require_gmail_configured()
    return {"disconnected": google_gmail.disconnect(customer["id"])}


@router.get("/messages")
def list_gmail_messages(
    max_results: int = 10,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """List Gmail messages from database."""
    supabase = get_supabase()
    try:
        result = (
            supabase.table("gmail_messages")
            .select("*")
            .eq("customer_id", customer["id"])
            .order("received_at", desc=True)
            .limit(max_results)
            .execute()
        )
        return {
            "messages": result.data,
            "count": len(result.data),
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/sync")
def sync_gmail_messages(
    max_results: int = 10,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Fetch messages from Gmail API, store in database, and extract flight confirmations.

    Returns:
        {fetched, synced, flights_extracted, duplicates, result_size_estimate}
    """
    _require_gmail_configured()
    try:
        result = google_gmail.list_messages(customer["id"], max_results=max_results)
        messages = result.get("messages", [])

        # Store messages in database
        email_rows = []
        for msg in messages:
            row = {
                "customer_id": customer["id"],
                "gmail_message_id": msg["gmail_message_id"],
                "sender": msg.get("sender", ""),
                "subject": msg.get("subject", ""),
                "body": msg.get("body", ""),
                "received_at": msg.get("received_at"),
                "labels": msg.get("labels", []),
                "is_read": msg.get("is_read", False),
            }
            email_rows.append(row)

        if email_rows:
            get_supabase().table("gmail_messages").upsert(
                email_rows, on_conflict="customer_id,gmail_message_id"
            ).execute()

        # Extract flights from emails
        flights_extracted = 0
        duplicates = 0
        for msg in messages:
            try:
                flight = gmail_email_agent.parse_flight_email(msg, customer["id"])
                if not flight:
                    continue

                # Check for duplicate
                if gmail_email_agent.check_duplicate_flight(
                    customer["id"],
                    flight.origin,
                    flight.destination,
                    flight.start_datetime,
                ):
                    duplicates += 1
                    continue

                # Insert flight to calendar_events (duplicates already checked)
                flight_row = flight.to_calendar_event()
                get_supabase().table("calendar_events").insert(
                    [flight_row]
                ).execute()
                flights_extracted += 1
            except Exception as e:
                # Log error but don't fail entire sync
                import sys

                print(
                    f"[WARN] Error extracting flight from email {msg.get('gmail_message_id')}: {e}",
                    file=sys.stderr,
                )
                continue

        return {
            "fetched": len(messages),
            "synced": len(email_rows),
            "flights_extracted": flights_extracted,
            "duplicates": duplicates,
            "result_size_estimate": result.get("result_size_estimate", 0),
        }
    except google_gmail.GmailNotConnected as exc:
        raise _not_connected() from exc
    except (google_gmail.GmailError, google_oauth.GoogleOAuthError) as exc:
        raise _upstream_failed(exc) from exc


def _not_connected() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Gmail is not connected for this customer. POST /gmail/connect first.",
    )


def _upstream_failed(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
