"""Google Calendar integration: OAuth handshake, token freshness, 401 retry, sync mapping.

Everything here is offline -- Google is stubbed at the httpx boundary and Supabase
at the client boundary, matching the hand-rolled fake style in test_deps.py.
"""
import base64
import hashlib
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import get_settings
from app.integrations import flight_classifier, google_calendar, google_oauth
from app.routers import calendar as calendar_router

CUSTOMER_ID = "11111111-1111-1111-1111-111111111111"


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #

class FakeTable:
    """Minimal supabase-py table double: enough of the chain to exercise our calls."""

    def __init__(self, name: str, db: dict, log: list):
        self._name = name
        self._db = db
        self._log = log
        self._filters: dict = {}
        self._pending_delete = False
        self._pending_write = None  # ("insert"|"upsert", rows, on_conflict)

    # -- chainable no-ops / filters
    def select(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def eq(self, column: str, value):
        self._filters[column] = value
        return self

    def lt(self, column: str, value):
        self._filters[f"{column}__lt"] = value
        return self

    # -- writes: staged here, applied in execute(), because supabase-py only
    # performs the round trip when .execute() is called.
    def insert(self, payload):
        rows = payload if isinstance(payload, list) else [payload]
        self._pending_write = ("insert", rows, "")
        return self

    def upsert(self, payload, on_conflict: str = ""):
        rows = payload if isinstance(payload, list) else [payload]
        self._pending_write = ("upsert", rows, on_conflict)
        return self

    def delete(self):
        self._pending_delete = True
        return self

    def execute(self):
        table = self._db.setdefault(self._name, [])

        if self._pending_write:
            kind, rows, on_conflict = self._pending_write
            self._log.append((kind, self._name, rows, on_conflict))
            if kind == "upsert" and on_conflict:
                keys = [k.strip() for k in on_conflict.split(",")]
                for row in rows:
                    identity = tuple(row.get(k) for k in keys)
                    existing = next(
                        (r for r in table if tuple(r.get(k) for k in keys) == identity), None
                    )
                    if existing is not None:
                        existing.update(row)
                    else:
                        table.append(dict(row))
            else:
                table.extend(dict(r) for r in rows)
            return _Result([dict(r) for r in rows])

        if self._pending_delete:
            self._log.append(("delete", self._name, dict(self._filters)))
            self._db[self._name] = [r for r in table if not self._matches(r)]
            return _Result([])

        return _Result([r for r in table if self._matches(r)])

    def _matches(self, row: dict) -> bool:
        for key, value in self._filters.items():
            if key.endswith("__lt"):
                column = key[: -len("__lt")]
                if not (row.get(column) is not None and row[column] < value):
                    return False
            elif row.get(key) != value:
                return False
        return True


class _Result:
    def __init__(self, data):
        self.data = data


class FakeSupabase:
    def __init__(self, db=None):
        self.db = db if db is not None else {}
        self.log: list = []

    def table(self, name: str) -> FakeTable:
        return FakeTable(name, self.db, self.log)


class FakeResponse:
    def __init__(self, status_code: int, payload=None, text: str = ""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or str(self._payload)

    def json(self):
        return self._payload


class FakeClient:
    """Stands in for httpx.Client, handing back queued responses in order."""

    def __init__(self, responses: list[FakeResponse], calls: list):
        self._responses = responses
        self._calls = calls

    def __call__(self, *_args, **_kwargs):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def request(self, method, url, **kwargs):
        self._calls.append((method, url, kwargs))
        return self._responses.pop(0)

    def post(self, url, **kwargs):
        self._calls.append(("POST", url, kwargs))
        return self._responses.pop(0)

    def get(self, url, **kwargs):
        self._calls.append(("GET", url, kwargs))
        return self._responses.pop(0)


@pytest.fixture
def google_configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "123-test.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/calendar/google/callback")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def fake_db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(google_calendar, "get_supabase", lambda: fake)
    return fake


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


# --------------------------------------------------------------------------- #
# Configuration gating
# --------------------------------------------------------------------------- #

def test_not_configured_by_default():
    """No GOOGLE_* env in the base test environment, so the feature stays off."""
    assert get_settings().google_calendar_configured is False


def test_status_reports_unconfigured_without_touching_google():
    result = calendar_router.google_status(customer={"id": CUSTOMER_ID})
    assert result == {"configured": False, "connected": False}


def test_connect_returns_503_when_unconfigured():
    with pytest.raises(HTTPException) as exc_info:
        calendar_router.google_connect(customer={"id": CUSTOMER_ID})
    assert exc_info.value.status_code == 503


def test_configured_flag_requires_both_id_and_secret(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id-only.apps.googleusercontent.com")
    get_settings.cache_clear()
    assert get_settings().google_calendar_configured is False


# --------------------------------------------------------------------------- #
# PKCE + authorization URL
# --------------------------------------------------------------------------- #

def test_pkce_challenge_is_base64url_sha256_of_verifier():
    pair = google_oauth.make_pkce_pair()
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(pair.verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    assert pair.challenge == expected
    assert "=" not in pair.challenge


def test_authorization_url_requests_offline_access(google_configured):
    url = google_oauth.build_authorization_url(state="st", code_challenge="ch")
    # access_type=offline + prompt=consent is what earns a refresh_token; without
    # it the connection dies after an hour with no way to recover.
    assert "access_type=offline" in url
    assert "prompt=consent" in url
    assert "code_challenge_method=S256" in url
    assert "state=st" in url
    assert "calendar.events" in url


def test_start_authorization_persists_single_use_state(google_configured, fake_db):
    url = google_calendar.start_authorization(CUSTOMER_ID)
    states = fake_db.db["google_oauth_states"]
    assert len(states) == 1
    assert states[0]["customer_id"] == CUSTOMER_ID
    assert states[0]["code_verifier"]
    assert states[0]["state"] in url


# --------------------------------------------------------------------------- #
# Callback redemption
# --------------------------------------------------------------------------- #

def test_complete_authorization_rejects_unknown_state(google_configured, fake_db):
    with pytest.raises(google_calendar.GoogleCalendarError, match="Unknown or already-used"):
        google_calendar.complete_authorization(state="never-issued", code="c")


def test_complete_authorization_rejects_expired_handshake(google_configured, fake_db, monkeypatch):
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "expires_at": _iso(timedelta(minutes=-1)),
        }
    ]
    monkeypatch.setattr(google_oauth, "exchange_code", lambda **_: pytest.fail("must not call Google"))
    with pytest.raises(google_calendar.GoogleCalendarError, match="expired"):
        google_calendar.complete_authorization(state="st", code="c")


def test_state_is_burned_even_when_exchange_fails(google_configured, fake_db, monkeypatch):
    """A replayed callback must not be able to reuse the verifier."""
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "expires_at": _iso(timedelta(minutes=5)),
        }
    ]

    def boom(**_kwargs):
        raise google_oauth.GoogleOAuthError("invalid_grant")

    monkeypatch.setattr(google_oauth, "exchange_code", boom)
    with pytest.raises(google_oauth.GoogleOAuthError):
        google_calendar.complete_authorization(state="st", code="c")
    assert fake_db.db["google_oauth_states"] == []


def test_complete_authorization_requires_refresh_token(google_configured, fake_db, monkeypatch):
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "expires_at": _iso(timedelta(minutes=5)),
        }
    ]
    monkeypatch.setattr(
        google_oauth,
        "exchange_code",
        lambda **_: {"access_token": "at", "expires_in": 3600},  # no refresh_token
    )
    with pytest.raises(google_calendar.GoogleCalendarError, match="no refresh_token"):
        google_calendar.complete_authorization(state="st", code="c")


def test_complete_authorization_stores_credentials(google_configured, fake_db, monkeypatch):
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "expires_at": _iso(timedelta(minutes=5)),
        }
    ]
    monkeypatch.setattr(
        google_oauth,
        "exchange_code",
        lambda **_: {
            "access_token": "at",
            "refresh_token": "rt",
            "expires_in": 3600,
            "scope": "https://www.googleapis.com/auth/calendar.events",
        },
    )
    monkeypatch.setattr(google_oauth, "token_info", lambda _t: {"email": "user@example.com"})

    stored = google_calendar.complete_authorization(state="st", code="c")
    assert stored["refresh_token"] == "rt"
    assert stored["google_account_email"] == "user@example.com"
    assert fake_db.db["google_oauth_states"] == []  # single-use


def test_connection_survives_tokeninfo_failure(google_configured, fake_db, monkeypatch):
    """The account email is cosmetic; failing to fetch it must not break the connect."""
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "expires_at": _iso(timedelta(minutes=5)),
        }
    ]
    monkeypatch.setattr(
        google_oauth,
        "exchange_code",
        lambda **_: {"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
    )

    def boom(_t):
        raise google_oauth.GoogleOAuthError("tokeninfo down")

    monkeypatch.setattr(google_oauth, "token_info", boom)
    stored = google_calendar.complete_authorization(state="st", code="c")
    assert stored["refresh_token"] == "rt"
    assert stored["google_account_email"] is None


# --------------------------------------------------------------------------- #
# Token freshness
# --------------------------------------------------------------------------- #

def test_access_token_reused_while_fresh(google_configured, fake_db, monkeypatch):
    fake_db.db["google_calendar_credentials"] = [
        {
            "customer_id": CUSTOMER_ID,
            "refresh_token": "rt",
            "access_token": "still-good",
            "access_token_expires_at": _iso(timedelta(minutes=30)),
            "scope": "",
        }
    ]
    monkeypatch.setattr(
        google_oauth, "refresh_access_token", lambda _rt: pytest.fail("should not refresh")
    )
    assert google_calendar.get_valid_access_token(CUSTOMER_ID) == "still-good"


def test_access_token_refreshed_inside_expiry_slack(google_configured, fake_db, monkeypatch):
    """30s of remaining life is inside the 60s slack, so it must refresh."""
    fake_db.db["google_calendar_credentials"] = [
        {
            "customer_id": CUSTOMER_ID,
            "refresh_token": "rt",
            "access_token": "about-to-die",
            "access_token_expires_at": _iso(timedelta(seconds=30)),
            "scope": "",
        }
    ]
    monkeypatch.setattr(
        google_oauth, "refresh_access_token", lambda _rt: {"access_token": "fresh", "expires_in": 3600}
    )
    assert google_calendar.get_valid_access_token(CUSTOMER_ID) == "fresh"


def test_refresh_preserves_refresh_token(google_configured, fake_db, monkeypatch):
    """Google does not reissue refresh_token on refresh; dropping it would orphan the connection."""
    fake_db.db["google_calendar_credentials"] = [
        {
            "customer_id": CUSTOMER_ID,
            "refresh_token": "original-rt",
            "access_token": "dead",
            "access_token_expires_at": _iso(timedelta(seconds=-10)),
            "scope": "",
        }
    ]
    monkeypatch.setattr(
        google_oauth, "refresh_access_token", lambda _rt: {"access_token": "fresh", "expires_in": 3600}
    )
    google_calendar.get_valid_access_token(CUSTOMER_ID)
    upserts = [e for e in fake_db.log if e[0] == "upsert"]
    assert upserts[-1][2][0]["refresh_token"] == "original-rt"


def test_unconnected_customer_raises(google_configured, fake_db):
    with pytest.raises(google_calendar.GoogleCalendarNotConnected):
        google_calendar.get_valid_access_token(CUSTOMER_ID)


# --------------------------------------------------------------------------- #
# 401 retry
# --------------------------------------------------------------------------- #

def test_request_retries_once_on_401(google_configured, monkeypatch):
    """A locally-fresh token Google rejects anyway must trigger exactly one forced refresh."""
    forced: list[bool] = []

    def fake_token(_customer_id, force_refresh=False):
        forced.append(force_refresh)
        return "token"

    monkeypatch.setattr(google_calendar, "get_valid_access_token", fake_token)
    calls: list = []
    responses = [FakeResponse(401, text="expired"), FakeResponse(200, {"items": []})]
    monkeypatch.setattr(google_calendar.httpx, "Client", FakeClient(responses, calls))

    result = google_calendar.list_events(CUSTOMER_ID)
    assert result == []
    assert forced == [False, True]  # second attempt forced a refresh
    assert len(calls) == 2


def test_request_does_not_retry_twice_on_401(google_configured, monkeypatch):
    monkeypatch.setattr(google_calendar, "get_valid_access_token", lambda *_a, **_k: "token")
    calls: list = []
    responses = [FakeResponse(401, text="nope"), FakeResponse(401, text="nope")]
    monkeypatch.setattr(google_calendar.httpx, "Client", FakeClient(responses, calls))

    with pytest.raises(google_calendar.GoogleCalendarError):
        google_calendar.list_events(CUSTOMER_ID)
    assert len(calls) == 2  # original + one retry, then surfaced


# --------------------------------------------------------------------------- #
# Sync into calendar_events
# --------------------------------------------------------------------------- #

def test_sync_skips_all_day_events(google_configured, fake_db, monkeypatch):
    """calendar_events requires timestamptz on both ends; all-day events only have `date`."""
    monkeypatch.setattr(
        google_calendar,
        "list_events",
        lambda *_a, **_k: [
            {
                "id": "timed-1",
                "summary": "Flight to Tokyo",
                "start": {"dateTime": "2026-09-01T10:00:00+00:00"},
                "end": {"dateTime": "2026-09-01T22:00:00+00:00"},
                "htmlLink": "https://cal/1",
            },
            {
                "id": "allday-1",
                "summary": "Public holiday",
                "start": {"date": "2026-09-02"},
                "end": {"date": "2026-09-03"},
            },
        ],
    )
    monkeypatch.setattr(
        flight_classifier,
        "classify_event",
        lambda **_k: flight_classifier.FlightClassification(
            is_flight=True, origin="NYC", destination="Tokyo", confidence=0.95
        ),
    )

    result = google_calendar.sync_to_calendar_events(CUSTOMER_ID)
    assert result == {
        "fetched": 2,
        "synced": 1,
        "skipped_all_day": 1,
        "skipped_non_flight": 0,
    }

    rows = fake_db.db["calendar_events"]
    assert len(rows) == 1
    assert rows[0]["google_event_id"] == "timed-1"
    assert rows[0]["source"] == "google"
    assert rows[0]["event_type"] == "flight"
    assert rows[0]["destination"] == "Tokyo"


def test_sync_upserts_on_customer_and_google_event_id(google_configured, fake_db, monkeypatch):
    """Re-running sync must update, not duplicate, and must not touch seeded mock rows."""
    monkeypatch.setattr(
        google_calendar,
        "list_events",
        lambda *_a, **_k: [
            {
                "id": "e1",
                "summary": "Trip",
                "start": {"dateTime": "2026-09-01T10:00:00+00:00"},
                "end": {"dateTime": "2026-09-01T12:00:00+00:00"},
            }
        ],
    )
    monkeypatch.setattr(
        flight_classifier,
        "classify_event",
        lambda **_k: flight_classifier.FlightClassification(is_flight=False, confidence=0.95),
    )
    google_calendar.sync_to_calendar_events(CUSTOMER_ID)
    upsert = [e for e in fake_db.log if e[0] == "upsert" and e[1] == "calendar_events"][-1]
    assert upsert[3] == "customer_id,google_event_id"


def test_sync_titles_untitled_events(google_configured, fake_db, monkeypatch):
    monkeypatch.setattr(
        google_calendar,
        "list_events",
        lambda *_a, **_k: [
            {
                "id": "e1",
                "start": {"dateTime": "2026-09-01T10:00:00+00:00"},
                "end": {"dateTime": "2026-09-01T12:00:00+00:00"},
            }
        ],
    )
    monkeypatch.setattr(
        flight_classifier,
        "classify_event",
        lambda **_k: flight_classifier.FlightClassification(is_flight=False, confidence=0.95),
    )
    google_calendar.sync_to_calendar_events(CUSTOMER_ID)
    assert fake_db.db["calendar_events"][0]["title"] == "(no title)"


def test_sync_flights_only_skips_non_flight_events(google_configured, fake_db, monkeypatch):
    monkeypatch.setattr(
        google_calendar,
        "list_events",
        lambda *_a, **_k: [
            {
                "id": "e1",
                "summary": "Flight AA123",
                "start": {"dateTime": "2026-09-01T10:00:00+00:00"},
                "end": {"dateTime": "2026-09-01T12:00:00+00:00"},
            },
            {
                "id": "e2",
                "summary": "Team standup",
                "start": {"dateTime": "2026-09-01T10:00:00+00:00"},
                "end": {"dateTime": "2026-09-01T12:00:00+00:00"},
            },
        ],
    )

    def fake_classify(*, title, location="", notes=""):
        is_flight = "Flight" in title
        return flight_classifier.FlightClassification(is_flight=is_flight, confidence=0.95)

    monkeypatch.setattr(flight_classifier, "classify_event", fake_classify)

    result = google_calendar.sync_to_calendar_events(CUSTOMER_ID, flights_only=True)
    assert result["synced"] == 1
    assert result["skipped_non_flight"] == 1
    rows = fake_db.db["calendar_events"]
    assert len(rows) == 1
    assert rows[0]["google_event_id"] == "e1"


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

def test_callback_reports_google_error_without_raising(google_configured):
    response = calendar_router.google_callback(error="access_denied")
    assert response.status_code == 400
    assert b"access_denied" in response.body


def test_callback_requires_code_and_state(google_configured):
    response = calendar_router.google_callback(state="st", code=None)
    assert response.status_code == 400


def test_create_event_rejects_end_before_start(google_configured):
    payload = calendar_router.GoogleEventCreate(
        summary="Backwards",
        start=datetime(2026, 9, 1, 12, tzinfo=timezone.utc),
        end=datetime(2026, 9, 1, 10, tzinfo=timezone.utc),
    )
    with pytest.raises(HTTPException) as exc_info:
        calendar_router.create_google_event(payload, customer={"id": CUSTOMER_ID})
    assert exc_info.value.status_code == 422


def test_list_google_events_409s_when_not_connected(google_configured, fake_db):
    with pytest.raises(HTTPException) as exc_info:
        calendar_router.list_google_events(customer={"id": CUSTOMER_ID})
    assert exc_info.value.status_code == 409


# --------------------------------------------------------------------------- #
# Return-to-app deep link
#
# The client supplies its own return URL because it differs per runtime: Expo Go
# serves exp://, a dev or standalone build serves veda://. That value is rendered
# into the callback page on our own origin, so it is scheme-allowlisted.
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "candidate",
    [
        "veda://google-calendar",
        "exp://127.0.0.1:8081/--/google-calendar",
        "exp+veda://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081",
        "VEDA://google-calendar",
    ],
)
def test_sanitize_app_redirect_allows_app_schemes(candidate):
    assert google_calendar.sanitize_app_redirect(candidate) == candidate


@pytest.mark.parametrize(
    "candidate",
    [
        "javascript:alert(document.domain)",
        "data:text/html,<script>alert(1)</script>",
        "https://evil.example.com/phish",
        "http://evil.example.com/phish",
        "vedax://google-calendar",
        "expo://google-calendar",
        "",
        None,
    ],
)
def test_sanitize_app_redirect_rejects_everything_else(candidate):
    """Anything not an app scheme would be XSS or an open redirect on our origin."""
    assert google_calendar.sanitize_app_redirect(candidate) is None


def test_start_authorization_persists_app_redirect(google_configured, fake_db):
    google_calendar.start_authorization(CUSTOMER_ID, app_redirect="veda://google-calendar")
    assert fake_db.db["google_oauth_states"][0]["app_redirect"] == "veda://google-calendar"


def test_start_authorization_drops_disallowed_redirect(google_configured, fake_db):
    google_calendar.start_authorization(CUSTOMER_ID, app_redirect="https://evil.example.com")
    assert fake_db.db["google_oauth_states"][0]["app_redirect"] is None


def test_connect_forwards_app_redirect(google_configured, fake_db):
    calendar_router.google_connect(
        payload=calendar_router.GoogleConnectRequest(app_redirect="veda://google-calendar"),
        customer={"id": CUSTOMER_ID},
    )
    assert fake_db.db["google_oauth_states"][0]["app_redirect"] == "veda://google-calendar"


def test_connect_without_body_still_works(google_configured, fake_db):
    """The body is optional, so an older client that sends none is not a 422."""
    result = calendar_router.google_connect(customer={"id": CUSTOMER_ID})
    assert result["authorization_url"].startswith(google_oauth.AUTH_ENDPOINT)
    assert fake_db.db["google_oauth_states"][0]["app_redirect"] is None


def test_callback_bounces_to_the_handshakes_app_redirect(google_configured, fake_db, monkeypatch):
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "app_redirect": "exp://127.0.0.1:8081/--/google-calendar",
            "expires_at": _iso(timedelta(minutes=5)),
        }
    ]
    monkeypatch.setattr(
        google_oauth,
        "exchange_code",
        lambda **_: {"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
    )
    monkeypatch.setattr(google_oauth, "token_info", lambda _t: {"email": "user@example.com"})

    response = calendar_router.google_callback(state="st", code="c")

    assert response.status_code == 200
    # An exp:// URL already carries a query string, so the status must be appended
    # with & rather than a second ?.
    assert b"exp://127.0.0.1:8081/--/google-calendar?status=connected" in response.body


def test_callback_appends_status_with_ampersand_when_url_has_a_query(
    google_configured, fake_db, monkeypatch
):
    redirect = "exp+veda://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
    fake_db.db["google_oauth_states"] = [
        {
            "state": "st",
            "customer_id": CUSTOMER_ID,
            "code_verifier": "v",
            "app_redirect": redirect,
            "expires_at": _iso(timedelta(minutes=5)),
        }
    ]
    monkeypatch.setattr(
        google_oauth,
        "exchange_code",
        lambda **_: {"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
    )
    monkeypatch.setattr(google_oauth, "token_info", lambda _t: {"email": "u@example.com"})

    response = calendar_router.google_callback(state="st", code="c")
    assert f"{redirect}&status=connected".encode() in response.body


def test_callback_falls_back_to_configured_redirect(google_configured):
    """Error paths have no handshake to read, so they use the configured default."""
    response = calendar_router.google_callback(error="access_denied")
    assert b"veda://google-calendar?status=failed" in response.body


def test_callback_escapes_googles_error_parameter(google_configured):
    """`error` is attacker-controllable and lands in HTML on our own origin."""
    response = calendar_router.google_callback(error="<script>alert(1)</script>")
    assert b"<script>alert(1)</script>" not in response.body
    assert b"&lt;script&gt;" in response.body


# --------------------------------------------------------------------------- #
# Device calendar sync (Apple Calendar / any local calendar via expo-calendar)
# --------------------------------------------------------------------------- #


@pytest.fixture
def router_fake_db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(calendar_router, "get_supabase", lambda: fake)
    return fake


def test_device_sync_classifies_and_upserts(router_fake_db, monkeypatch):
    monkeypatch.setattr(
        flight_classifier,
        "classify_event",
        lambda **_k: flight_classifier.FlightClassification(
            is_flight=True, origin="SFO", destination="JFK", confidence=0.9
        ),
    )
    payload = calendar_router.DeviceEventsSync(
        events=[
            calendar_router.DeviceEvent(
                device_event_id="dev-1",
                title="Flight SFO to JFK",
                start=datetime(2026, 9, 1, 10, tzinfo=timezone.utc),
                end=datetime(2026, 9, 1, 18, tzinfo=timezone.utc),
            )
        ]
    )

    result = calendar_router.sync_device_events(payload, customer={"id": CUSTOMER_ID})
    assert result == {"fetched": 1, "synced": 1, "skipped_non_flight": 0}

    rows = router_fake_db.db["calendar_events"]
    assert len(rows) == 1
    assert rows[0]["device_event_id"] == "dev-1"
    assert rows[0]["source"] == "device"
    assert rows[0]["event_type"] == "flight"
    assert rows[0]["destination"] == "JFK"

    upsert = [e for e in router_fake_db.log if e[0] == "upsert" and e[1] == "calendar_events"][-1]
    assert upsert[3] == "customer_id,device_event_id"


def test_device_sync_flights_only_skips_non_flight_events(router_fake_db, monkeypatch):
    def fake_classify(*, title, location="", notes=""):
        return flight_classifier.FlightClassification(is_flight="Flight" in title, confidence=0.9)

    monkeypatch.setattr(flight_classifier, "classify_event", fake_classify)

    payload = calendar_router.DeviceEventsSync(
        flights_only=True,
        events=[
            calendar_router.DeviceEvent(
                device_event_id="dev-1",
                title="Flight AA123",
                start=datetime(2026, 9, 1, 10, tzinfo=timezone.utc),
                end=datetime(2026, 9, 1, 18, tzinfo=timezone.utc),
            ),
            calendar_router.DeviceEvent(
                device_event_id="dev-2",
                title="Dentist appointment",
                start=datetime(2026, 9, 2, 10, tzinfo=timezone.utc),
                end=datetime(2026, 9, 2, 11, tzinfo=timezone.utc),
            ),
        ],
    )

    result = calendar_router.sync_device_events(payload, customer={"id": CUSTOMER_ID})
    assert result == {"fetched": 2, "synced": 1, "skipped_non_flight": 1}
    assert router_fake_db.db["calendar_events"][0]["device_event_id"] == "dev-1"
