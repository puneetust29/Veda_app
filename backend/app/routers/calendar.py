import html
import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.db.client import get_supabase
from app.deps import get_current_customer
from app.integrations import flight_classifier, google_calendar, google_oauth
from app.utils.airport_mapper import get_destination_country
from app.services.trip_service import get_round_trips

router = APIRouter(prefix="/calendar", tags=["calendar"])
logger = logging.getLogger(__name__)


class GoogleEventCreate(BaseModel):
    """Body for POST /calendar/google/events.

    Timezone-aware datetimes only: Google needs an unambiguous instant, and a
    naive one silently lands in whatever the server's zone happens to be.
    """

    summary: str = Field(min_length=1, max_length=1024)
    start: datetime
    end: datetime
    description: str = ""


class DeviceEvent(BaseModel):
    """One event read off the device via expo-calendar's getEventsAsync.

    device_event_id is expo-calendar's event id, stable per-device but not
    globally unique the way a Google event id is (two devices could reuse
    ids), so the upsert key is scoped to (customer_id, device_event_id).
    """

    device_event_id: str = Field(min_length=1)
    title: str = ""
    location: str = ""
    notes: str = ""
    start: datetime
    end: datetime


class DeviceEventsSync(BaseModel):
    events: list[DeviceEvent]
    flights_only: bool = False


@router.get("/events")
def list_events(customer: dict = Depends(get_current_customer)) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("calendar_events")
        .select("*")
        .eq("customer_id", customer["id"])
        .order("start_datetime")
        .execute()
    )
    return result.data


@router.get("/events/{event_id}")
def get_event(event_id: str, customer: dict = Depends(get_current_customer)) -> dict:
    supabase = get_supabase()
    result = (
        supabase.table("calendar_events")
        .select("*")
        .eq("id", event_id)
        .eq("customer_id", customer["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return result.data[0]


@router.get("/trips")
def list_trips(customer: dict = Depends(get_current_customer)) -> dict:
    """Get grouped round-trip flights for dashboard.

    Groups flights where:
    - Outbound: A → B on date D1
    - Return: B → A on date D2 (D2 > D1, within 60 days)

    Returns both round-trip and one-way flights.
    """
    trips = get_round_trips(customer["id"])
    return {
        "trips": [trip.to_calendar_display() for trip in trips],
        "total_trips": len(trips),
        "total_round_trips": sum(1 for t in trips if t.is_round_trip),
    }


# --------------------------------------------------------------------------- #
# Real Google Calendar
#
# The OAuth token lives server-side only: the mobile app calls these routes and
# never handles a Google token. Every route 503s until GOOGLE_CLIENT_ID and
# GOOGLE_CLIENT_SECRET are configured, so an unconfigured deployment degrades
# instead of failing at boot.
# --------------------------------------------------------------------------- #


def _require_google_configured() -> None:
    if not get_settings().google_calendar_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Google Calendar is not configured. Set GOOGLE_CLIENT_ID and "
                "GOOGLE_CLIENT_SECRET in the backend environment."
            ),
        )


@router.get("/google/status")
def google_status(customer: dict = Depends(get_current_customer)) -> dict:
    """Whether this customer has a live Google connection. Never returns a token."""
    settings = get_settings()
    if not settings.google_calendar_configured:
        return {"configured": False, "connected": False}

    try:
        connection = google_calendar.get_connection(customer["id"])
    except Exception:
        # Database unavailable (e.g., Zscaler SSL interception) - report unconfigured for testing
        connection = None

    return {
        "configured": True,
        "connected": connection is not None,
        "google_account_email": (connection or {}).get("google_account_email"),
        "scope": (connection or {}).get("scope"),
    }


class GoogleConnectRequest(BaseModel):
    """Body for POST /calendar/google/connect.

    `app_redirect` lets the caller say where the callback page should return the
    browser to. The mobile app sends its own deep link, which differs per runtime
    (Expo Go serves `exp://`, a dev or standalone build serves `veda://`), so it
    cannot be hardcoded server-side. Rejected unless the scheme is allowlisted;
    omitted or rejected values fall back to GOOGLE_POST_AUTH_REDIRECT.
    """

    app_redirect: str | None = None


@router.post("/google/connect")
def google_connect(
    payload: GoogleConnectRequest | None = None,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Begin the consent flow. The client opens `authorization_url` in a browser."""
    _require_google_configured()
    return {
        "authorization_url": google_calendar.start_authorization(
            customer["id"], app_redirect=(payload.app_redirect if payload else None)
        )
    }


@router.get("/google/callback", response_class=HTMLResponse)
def google_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """Where Google redirects the browser after consent.

    Deliberately unauthenticated: this is a fresh browser navigation with no
    Authorization header. The `state` parameter is what ties the callback back to
    the customer who started it, and it is single-use.
    """
    _require_google_configured()

    if error:
        return _callback_page("Authorization failed", f"Google returned: {error}", ok=False)
    if not state or not code:
        return _callback_page("Authorization failed", "Missing code or state.", ok=False)

    try:
        connection = google_calendar.complete_authorization(state=state, code=code)
    except (google_calendar.GoogleCalendarError, google_oauth.GoogleOAuthError) as exc:
        return _callback_page("Authorization failed", str(exc), ok=False)

    account = connection.get("google_account_email") or "your Google account"
    app_redirect = connection.get("app_redirect")

    # If we have a return URL, redirect to it immediately (for Expo Web/openAuthSessionAsync)
    if app_redirect:
        # Ensure status parameter is added
        separator = "&" if "?" in app_redirect else "?"
        return HTMLResponse(
            f"""<!doctype html><script>location.replace('{html.escape(app_redirect)}{separator}status=connected');</script>
Redirecting...""",
            status_code=302,
        )

    # Fallback: show a success page
    return _callback_page(
        "Calendar connected",
        f"Connected {account}. You can close this tab.",
        app_redirect=app_redirect,
    )


def _callback_page(
    heading: str, message: str, *, ok: bool = True, app_redirect: str | None = None
) -> HTMLResponse:
    """Render the end of the consent flow, then bounce back into the mobile app.

    The page appends `?status=connected|failed` to the app's deep link. That
    redirect is what lets `WebBrowser.openAuthSessionAsync` close itself, so the
    user lands back in Veda rather than on a stranded browser tab. The manual
    link is the fallback: iOS Safari can refuse a scripted navigation to a custom
    scheme without a user gesture, and a desktop browser has no app to open.

    Everything interpolated here is escaped -- `message` carries Google's `error`
    query parameter and upstream exception text, both attacker-influenceable.
    """
    colour = "#137333" if ok else "#b00020"
    # Error paths have no handshake to read a redirect from -- the state may be
    # unknown, expired, or already burned -- so they fall back to the configured
    # default. Worst case the user taps "Return to Veda" or closes the tab.
    target = google_calendar.sanitize_app_redirect(app_redirect) or (
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


@router.delete("/google/connection")
def google_disconnect(customer: dict = Depends(get_current_customer)) -> dict:
    """Revoke at Google and forget the credentials."""
    _require_google_configured()
    return {"disconnected": google_calendar.disconnect(customer["id"])}


@router.get("/google/events")
def list_google_events(
    max_results: int = 20,
    flights_only: bool = False,
    customer: dict = Depends(get_current_customer),
) -> list[dict]:
    """Live read straight from Google, bypassing the calendar_events mirror.

    flights_only runs each event through flight_classifier before returning it,
    same detector used by /google/sync, so the preview list matches what a
    flights-only sync would actually persist.
    """
    _require_google_configured()
    try:
        events = google_calendar.list_events(customer["id"], max_results=max_results)
    except google_calendar.GoogleCalendarNotConnected as exc:
        raise _not_connected() from exc
    except (google_calendar.GoogleCalendarError, google_oauth.GoogleOAuthError) as exc:
        raise _upstream_failed(exc) from exc

    if not flights_only:
        return events

    return [
        event
        for event in events
        if flight_classifier.classify_event(
            title=event.get("summary") or "",
            location=event.get("location") or "",
            notes=event.get("description") or "",
        ).is_flight
    ]


@router.post("/google/events", status_code=status.HTTP_201_CREATED)
def create_google_event(
    payload: GoogleEventCreate,
    customer: dict = Depends(get_current_customer),
) -> dict:
    _require_google_configured()
    if payload.end <= payload.start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="`end` must be after `start`.",
        )
    try:
        return google_calendar.create_event(
            customer["id"],
            summary=payload.summary,
            description=payload.description,
            start=payload.start,
            end=payload.end,
        )
    except google_calendar.GoogleCalendarNotConnected as exc:
        raise _not_connected() from exc
    except (google_calendar.GoogleCalendarError, google_oauth.GoogleOAuthError) as exc:
        raise _upstream_failed(exc) from exc


@router.post("/google/sync")
def sync_google_events(
    max_results: int = 20,
    flights_only: bool = False,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Mirror Google events into `calendar_events`, which is what the agents read.

    Idempotent: upserts on (customer_id, google_event_id), so re-running updates
    rather than duplicating, and the seeded mock rows are untouched. Each event
    is run through flight_classifier; pass flights_only=true to skip persisting
    non-flight events entirely instead of storing them as event_type="other".
    """
    _require_google_configured()
    try:
        return google_calendar.sync_to_calendar_events(
            customer["id"], max_results=max_results, flights_only=flights_only
        )
    except google_calendar.GoogleCalendarNotConnected as exc:
        raise _not_connected() from exc
    except (google_calendar.GoogleCalendarError, google_oauth.GoogleOAuthError) as exc:
        raise _upstream_failed(exc) from exc


def _not_connected() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Google Calendar is not connected for this customer. POST /calendar/google/connect first.",
    )


def _upstream_failed(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


# --------------------------------------------------------------------------- #
# Device calendar sync (Apple Calendar via expo-calendar, or any other
# calendar account the OS surfaces locally)
# --------------------------------------------------------------------------- #


@router.post("/device-events")
def sync_device_events(
    payload: DeviceEventsSync, customer: dict = Depends(get_current_customer)
) -> dict:
    """Classify and upsert events the mobile app read directly off the device.

    Unlike Google sync, the backend never talks to the calendar provider here:
    expo-calendar already resolved Apple Calendar (and any other calendar the
    OS surfaces) into plain events, and the app just forwards them. Idempotent
    on (customer_id, device_event_id), same shape as the Google sync result.
    """
    rows = []
    skipped_non_flight = 0
    logger.info(f"[device_sync] Processing {len(payload.events)} device events")
    for event in payload.events:
        classification = flight_classifier.classify_event(
            title=event.title or "(no title)", location=event.location, notes=event.notes
        )
        logger.debug(f"[device_sync] Classified event: {event.title} -> is_flight={classification.is_flight}, confidence={classification.confidence}")

        if payload.flights_only and not classification.is_flight:
            logger.debug(f"[device_sync] Skipping non-flight event: {event.title} (flights_only=True)")
            skipped_non_flight += 1
            continue

        row = {
            "customer_id": customer["id"],
            "device_event_id": event.device_event_id,
            "source": "device",
            "title": event.title or "(no title)",
            "event_type": "flight" if classification.is_flight else "other",
            "origin": classification.origin or event.location or None,
            "destination": classification.destination,
            "start_datetime": event.start.isoformat(),
            "end_datetime": event.end.isoformat(),
            "raw_details": {
                "notes": event.notes or None,
                "flight_confidence": classification.confidence,
            },
        }

        # Add destination_country for flights
        if row["event_type"] == "flight" and row["destination"]:
            row["raw_details"]["destination_country"] = get_destination_country(
                row["destination"], row
            )

        rows.append(row)

    # Filter out rows that already exist from any source (cross-source dedup)
    supabase = get_supabase()
    deduped_rows = []
    duplicates = 0

    for row in rows:
        # Check if flight already exists from any source
        # Use time-window matching (±30 min) instead of date-only to handle:
        # - Same-day flights at different times (8am vs 2pm)
        # - Timezone parsing variance
        # - Connecting flights same day
        flight_time = datetime.fromisoformat(row['start_datetime'].replace('Z', '+00:00'))
        window_start = (flight_time - timedelta(minutes=30)).isoformat()
        window_end = (flight_time + timedelta(minutes=30)).isoformat()

        existing = (
            supabase.table("calendar_events")
            .select("id")
            .eq("customer_id", row["customer_id"])
            .eq("event_type", "flight")
            .eq("origin", row.get("origin"))
            .eq("destination", row.get("destination"))
            .gte("start_datetime", window_start)
            .lte("start_datetime", window_end)
            .limit(1)
            .execute()
        )

        if existing.data:
            logger.debug(f"[device_sync] Duplicate flight detected: {row.get('origin')}->{row.get('destination')} at {row.get('start_datetime')}")
            duplicates += 1
            continue

        deduped_rows.append(row)

    logger.info(f"[device_sync] Ready to upsert: {len(deduped_rows)} new events, {duplicates} duplicates")
    if deduped_rows:
        try:
            get_supabase().table("calendar_events").upsert(
                deduped_rows, on_conflict="customer_id,device_event_id"
            ).execute()
            logger.info(f"[device_sync] Successfully upserted {len(deduped_rows)} device events")
        except Exception as e:
            logger.error(f"[device_sync] Failed to upsert device events: {e}", exc_info=True)
            raise
    else:
        logger.info(f"[device_sync] No new events to upsert (all duplicates or empty)")

    return {
        "fetched": len(payload.events),
        "synced": len(deduped_rows),
        "duplicates": duplicates,
        "skipped_non_flight": skipped_non_flight,
    }
