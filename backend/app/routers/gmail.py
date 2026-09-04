import html
import json
from typing import Optional

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

    app_redirect: Optional[str] = None


@router.post("/connect")
def gmail_connect(
    payload: Optional[GmailConnectRequest] = None,
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
    state: Optional[str] = None,
    code: Optional[str] = None,
    error: Optional[str] = None,
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
    heading: str, message: str, *, ok: bool = True, app_redirect: Optional[str] = None
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


class GmailSendRequest(BaseModel):
    """Body for POST /gmail/send."""

    to: str
    subject: str
    body: str


@router.post("/send")
def send_gmail_message(
    payload: GmailSendRequest,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Send a plain-text email from the customer's connected Gmail account."""
    _require_gmail_configured()
    try:
        result = google_gmail.send_message(
            customer["id"], to=payload.to, subject=payload.subject, body=payload.body
        )
        return {"sent": True, "gmail_message_id": result.get("id")}
    except google_gmail.GmailNotConnected as exc:
        raise _not_connected() from exc
    except (google_gmail.GmailError, google_oauth.GoogleOAuthError) as exc:
        raise _upstream_failed(exc) from exc


@router.post("/sync")
def sync_gmail_messages(
    max_results: int = 10,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Fetch messages from Gmail API, store in database, and extract flights and hotels.

    Supports incremental sync: reads last_gmail_synced_at from customers table and only
    fetches messages since last sync.

    Returns:
        {fetched, synced, flights_extracted, flight_duplicates, hotels_extracted,
         hotel_duplicates, result_size_estimate, incremental_sync}
    """
    from datetime import datetime, timezone

    _require_gmail_configured()
    try:
        # Get last sync timestamp for incremental sync
        customer_record = (
            get_supabase()
            .table("customers")
            .select("last_gmail_synced_at")
            .eq("id", customer["id"])
            .execute()
        )
        last_synced_at = None
        if customer_record.data:
            last_synced_at = customer_record.data[0].get("last_gmail_synced_at")

        # List messages (incremental if we've synced before)
        result = google_gmail.list_messages(
            customer["id"],
            max_results=max_results,
            after_timestamp=last_synced_at,
        )
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

        # Extract flights and hotels from emails
        flights_extracted = 0
        hotels_extracted = 0
        flight_duplicates = 0
        hotel_duplicates = 0
        for msg in messages:
            # Try to extract flight
            try:
                flight = gmail_email_agent.parse_flight_email(msg, customer["id"])
                if flight:
                    # Check for duplicate
                    if gmail_email_agent.check_duplicate_flight(
                        customer["id"],
                        flight.origin,
                        flight.destination,
                        flight.start_datetime,
                    ):
                        flight_duplicates += 1
                    else:
                        # Upsert flight to calendar_events (dedup at DB level on gmail_message_id)
                        flight_row = flight.to_calendar_event()
                        get_supabase().table("calendar_events").upsert(
                            [flight_row], on_conflict="customer_id,gmail_message_id"
                        ).execute()
                        flights_extracted += 1
            except Exception as e:
                # Log error but don't fail entire sync
                import sys

                print(
                    f"[WARN] Error extracting flight from email {msg.get('gmail_message_id')}: {e}",
                    file=sys.stderr,
                )

            # Try to extract hotel
            try:
                hotel = gmail_email_agent.parse_hotel_email(msg, customer["id"])
                if hotel:
                    # Check for duplicate
                    if gmail_email_agent.check_duplicate_hotel(
                        customer["id"],
                        hotel.hotel_name,
                        hotel.check_in,
                    ):
                        hotel_duplicates += 1
                    else:
                        # Upsert hotel to calendar_events (duplicates already checked)
                        hotel_row = hotel.to_calendar_event()
                        get_supabase().table("calendar_events").upsert(
                            [hotel_row], on_conflict="customer_id,gmail_message_id"
                        ).execute()
                        hotels_extracted += 1
            except Exception as e:
                # Log error but don't fail entire sync
                import sys

                print(
                    f"[WARN] Error extracting hotel from email {msg.get('gmail_message_id')}: {e}",
                    file=sys.stderr,
                )

        # Update both last_gmail_synced_at (for incremental sync) and last_synced_at (general sync time)
        get_supabase().table("customers").update({
            "last_gmail_synced_at": datetime.now(timezone.utc).isoformat(),
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", customer["id"]).execute()

        return {
            "fetched": len(messages),
            "synced": len(email_rows),
            "flights_extracted": flights_extracted,
            "flight_duplicates": flight_duplicates,
            "hotels_extracted": hotels_extracted,
            "hotel_duplicates": hotel_duplicates,
            "result_size_estimate": result.get("result_size_estimate", 0),
            "incremental_sync": last_synced_at is not None,
        }
    except google_gmail.GmailNotConnected as exc:
        raise _not_connected() from exc
    except (google_gmail.GmailError, google_oauth.GoogleOAuthError) as exc:
        raise _upstream_failed(exc) from exc
    except Exception as exc:
        # Catch any other unhandled exception and log it
        import sys
        print(f"[ERROR] Unexpected error in sync_gmail_messages: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error during Gmail sync: {str(exc)}"
        ) from exc


def _not_connected() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Gmail is not connected for this customer. POST /gmail/connect first.",
    )


def _upstream_failed(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
