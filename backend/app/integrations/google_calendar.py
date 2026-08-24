"""Google Calendar: credential storage, token freshness, and the REST calls.

Token rule for the whole backend: nothing outside this module reads
`google_calendar_credentials.access_token`. Callers ask for
`get_valid_access_token(customer_id)`, which refreshes and persists as needed.
The mobile app never receives a Google token at all.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx

from app.config import get_settings
from app.db.client import get_supabase
from app.integrations import flight_classifier, google_oauth
from app.utils.airport_mapper import get_destination_country

CALENDAR_API = "https://www.googleapis.com/calendar/v3"
DEFAULT_CALENDAR_ID = "primary"

# Refresh this far before actual expiry so a request can't expire in flight.
_EXPIRY_SLACK = timedelta(seconds=60)
_STATE_TTL = timedelta(minutes=10)
_TIMEOUT = httpx.Timeout(15.0)


class GoogleCalendarNotConnected(RuntimeError):
    """This customer has no stored Google credentials."""


class GoogleCalendarError(RuntimeError):
    """The Calendar API rejected a request."""


# --------------------------------------------------------------------------- #
# OAuth handshake state
# --------------------------------------------------------------------------- #

# Schemes the callback page is allowed to bounce back to. The client supplies its
# own return URL (Expo Go is exp://, a dev/standalone build is veda://), and that
# value is rendered into an <a href> and a location.replace() on our own origin --
# so an unvalidated one would be a javascript:/data: XSS vector, and an https: one
# would turn the callback into an open redirect.
_ALLOWED_REDIRECT_SCHEMES = re.compile(r"^(veda|exp|exp\+[a-z0-9._-]+)$", re.IGNORECASE)


def sanitize_app_redirect(app_redirect: Optional[str]) -> Optional[str]:
    """Return the redirect if its scheme is allowlisted, else None (caller defaults)."""
    if not app_redirect:
        return None
    scheme = urlsplit(app_redirect).scheme
    return app_redirect if _ALLOWED_REDIRECT_SCHEMES.match(scheme) else None


def start_authorization(customer_id: str, app_redirect: Optional[str] = None) -> str:
    """Create a single-use PKCE handshake and return the URL to send the user to.

    `app_redirect` is where the callback page should send the browser once consent
    finishes. It is stored alongside the handshake because the callback arrives as
    a fresh browser request that knows nothing about the client that started it.
    """
    pkce = google_oauth.make_pkce_pair()
    state = google_oauth.make_state()
    supabase = get_supabase()

    # Opportunistic sweep -- no scheduler in this POC, and the table would
    # otherwise grow one abandoned row per cancelled consent.
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

    return google_oauth.build_authorization_url(state=state, code_challenge=pkce.challenge)


def complete_authorization(state: str, code: str) -> dict:
    """Redeem the callback. Returns the stored credential row."""
    supabase = get_supabase()
    found = (
        supabase.table("google_oauth_states").select("*").eq("state", state).limit(1).execute()
    )
    if not found.data:
        # Unknown state means CSRF, a replayed callback, or an expired handshake.
        raise GoogleCalendarError("Unknown or already-used OAuth state.")

    handshake = found.data[0]
    # Single-use: burn it before the network call, so a retried callback cannot
    # replay the same verifier.
    supabase.table("google_oauth_states").delete().eq("state", state).execute()

    if _parse_ts(handshake["expires_at"]) < datetime.now(timezone.utc):
        raise GoogleCalendarError("OAuth handshake expired — start again.")

    tokens = google_oauth.exchange_code(code=code, code_verifier=handshake["code_verifier"])

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        # Without this the connection dies in an hour with no way to recover.
        raise GoogleCalendarError(
            "Google returned no refresh_token. Revoke the app's access at "
            "https://myaccount.google.com/permissions and connect again."
        )

    email: Optional[str] = None
    given_name: Optional[str] = None
    full_name: Optional[str] = None
    try:
        profile = google_oauth.userinfo(tokens["access_token"])
        email = profile.get("email")
        given_name = profile.get("given_name")
        full_name = profile.get("name")
    except google_oauth.GoogleOAuthError:
        # Purely informational; never fail a working connection over it.
        pass

    credentials = _store_credentials(
        customer_id=handshake["customer_id"],
        refresh_token=refresh_token,
        access_token=tokens["access_token"],
        expires_in=tokens.get("expires_in", 3600),
        scope=tokens.get("scope", ""),
        email=email,
    )
    if given_name or full_name:
        _adopt_google_name(
            customer_id=handshake["customer_id"],
            given_name=given_name,
            full_name=full_name,
        )
    # A copy, not the stored row: app_redirect belongs to the handshake (now
    # deleted), not to the credentials, and must not be written back to the table.
    return {**credentials, "app_redirect": handshake.get("app_redirect")}


# Placeholder written by the dev-login stand-in (see app/deps.py
# get_or_create_customer) for any customer who hasn't told us their real name
# yet. Only ever overwritten with a real name below -- never the reverse.
_PLACEHOLDER_CUSTOMER_NAME = "New Customer"


def _adopt_google_name(*, customer_id: str, given_name: Optional[str], full_name: Optional[str]) -> None:
    """Fill in the customer's name from their Google profile, once.

    Only replaces the dev-login placeholder name -- a customer who already
    has a real name (set some other way) keeps it, so this never clobbers a
    name the person actually chose.
    """
    supabase = get_supabase()
    existing = (
        supabase.table("customers").select("full_name").eq("id", customer_id).limit(1).execute()
    )
    if not existing.data or existing.data[0].get("full_name") != _PLACEHOLDER_CUSTOMER_NAME:
        return
    supabase.table("customers").update({"full_name": full_name or given_name}).eq(
        "id", customer_id
    ).execute()


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
        supabase.table("google_calendar_credentials")
        .upsert(row, on_conflict="customer_id")
        .execute()
    )
    return result.data[0]


def get_connection(customer_id: str) -> Optional[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("google_calendar_credentials")
        .select("*")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def disconnect(customer_id: str) -> bool:
    """Revoke at Google, then drop the row. Returns False if nothing was connected."""
    connection = get_connection(customer_id)
    if not connection:
        return False

    google_oauth.revoke(connection["refresh_token"])
    get_supabase().table("google_calendar_credentials").delete().eq(
        "customer_id", customer_id
    ).execute()
    return True


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #

def get_valid_access_token(customer_id: str, *, force_refresh: bool = False) -> str:
    """The only way the rest of the backend obtains a Google access token."""
    connection = get_connection(customer_id)
    if not connection:
        raise GoogleCalendarNotConnected(
            f"customer {customer_id} has not connected Google Calendar"
        )

    if not force_refresh and _token_is_fresh(connection):
        return connection["access_token"]

    tokens = google_oauth.refresh_access_token(connection["refresh_token"])
    _store_credentials(
        customer_id=customer_id,
        # Google does not reissue a refresh_token on refresh; keep the one we have.
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
    # Postgres hands back +00:00; older rows may use the Z form.
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# Calendar API
# --------------------------------------------------------------------------- #

def _request(
    customer_id: str,
    method: str,
    path: str,
    *,
    params: Optional[dict] = None,
    json: Optional[dict] = None,
    _is_retry: bool = False,
) -> Any:
    access_token = get_valid_access_token(customer_id, force_refresh=_is_retry)

    with httpx.Client(timeout=_TIMEOUT) as client:
        response = client.request(
            method,
            f"{CALENDAR_API}{path}",
            params=params,
            json=json,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if response.status_code == 401 and not _is_retry:
        # Locally-fresh token that Google rejected anyway (revoked, password
        # change, scope removed). Force one refresh and retry exactly once.
        return _request(customer_id, method, path, params=params, json=json, _is_retry=True)

    if response.status_code == 204:
        return None
    if response.status_code >= 400:
        raise GoogleCalendarError(f"{method} {path} returned {response.status_code}: {response.text}")
    return response.json()


def list_events(
    customer_id: str,
    *,
    max_results: int = 20,
    calendar_id: str = DEFAULT_CALENDAR_ID,
) -> list[dict]:
    """Upcoming events, soonest first, recurring series expanded."""
    payload = _request(
        customer_id,
        "GET",
        f"/calendars/{calendar_id}/events",
        params={
            "timeMin": datetime.now(timezone.utc).isoformat(),
            "maxResults": max_results,
            "singleEvents": "true",
            "orderBy": "startTime",
        },
    )
    return payload.get("items", [])


def create_event(
    customer_id: str,
    *,
    summary: str,
    start: datetime,
    end: datetime,
    description: str = "",
    calendar_id: str = DEFAULT_CALENDAR_ID,
) -> dict:
    return _request(
        customer_id,
        "POST",
        f"/calendars/{calendar_id}/events",
        json={
            "summary": summary,
            "description": description,
            "start": {"dateTime": start.isoformat()},
            "end": {"dateTime": end.isoformat()},
        },
    )


def delete_event(
    customer_id: str, event_id: str, *, calendar_id: str = DEFAULT_CALENDAR_ID
) -> None:
    _request(customer_id, "DELETE", f"/calendars/{calendar_id}/events/{event_id}")


# --------------------------------------------------------------------------- #
# Bridge into calendar_events, which is what the agents actually read
# --------------------------------------------------------------------------- #

def sync_to_calendar_events(
    customer_id: str, *, max_results: int = 20, flights_only: bool = False
) -> dict:
    """Mirror Google events into `calendar_events` so agents see real trips.

    Upserts on (customer_id, google_event_id), so running this repeatedly is
    safe and edits made in Google propagate rather than duplicating. Seeded mock
    rows have a null google_event_id and are left untouched.

    Each event is run through flight_classifier so event_type/origin/destination
    reflect an actual flight when one is detected, instead of the previous
    hardcoded "other" for every event.
    """
    events = list_events(customer_id, max_results=max_results)

    rows = []
    skipped = 0
    skipped_non_flight = 0
    for event in events:
        start = _event_datetime(event.get("start"))
        end = _event_datetime(event.get("end"))
        if not start or not end:
            # All-day events carry `date` not `dateTime`; calendar_events requires
            # timestamptz for both ends, so they are out of scope here.
            skipped += 1
            continue

        title = event.get("summary") or "(no title)"
        location = event.get("location") or ""
        notes = event.get("description") or ""
        classification = flight_classifier.classify_event(title=title, location=location, notes=notes)

        if flights_only and not classification.is_flight:
            skipped_non_flight += 1
            continue

        row = {
            "customer_id": customer_id,
            "google_event_id": event["id"],
            "source": "google",
            "title": title,
            "event_type": "flight" if classification.is_flight else "other",
            "origin": classification.origin or location or None,
            "destination": classification.destination,
            "start_datetime": start,
            "end_datetime": end,
            "raw_details": {
                "google_html_link": event.get("htmlLink"),
                "google_status": event.get("status"),
                "description": event.get("description"),
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
            duplicates += 1
            continue

        deduped_rows.append(row)

    if deduped_rows:
        get_supabase().table("calendar_events").upsert(
            deduped_rows, on_conflict="customer_id,google_event_id"
        ).execute()

    return {
        "fetched": len(events),
        "synced": len(deduped_rows),
        "duplicates": duplicates,
        "skipped_all_day": skipped,
        "skipped_non_flight": skipped_non_flight,
    }


def _event_datetime(node: Optional[dict]) -> Optional[str]:
    if not node:
        return None
    return node.get("dateTime")
