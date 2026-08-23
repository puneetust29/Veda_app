"""Tests for the Uber agent LangGraph and UberAgent.execute().

Reflects the always-suggest architecture introduced when should_suggest was removed:
  - RideSuggestion uses origin_type (airport/train_station/ferry/unknown), not should_suggest.
  - Graph always routes: extract_trip_context → suggest_ride → build_deeplink → END.
  - Agent always emits recommendation_ready — there is no "no suggestion" error path.
  - Card includes origin_type and alternative_options; no live_quote or connect_uber_url.
"""
import uuid
from typing import Optional

import pytest

from app.agents.uber import graph as uber_graph_module
from app.agents.uber.agent import UberAgent
from app.agents.uber.graph import uber_graph
from app.agents.uber.schemas import RideSuggestion
from app.agents.base.contracts import AgentContext, UnsupportedActionError

# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

CALENDAR_EVENT_LHR_NRT = {
    "id": "evt-1",
    "customer_id": "cust-1",
    "event_type": "flight",
    "start_datetime": "2026-09-01T10:00:00+00:00",
    "end_datetime": "2026-09-08T10:00:00+00:00",
    "raw_details": {"destination_country": "Japan"},
    "origin": "London Heathrow (LHR)",
    "destination": "Tokyo Narita (NRT)",
}

CALENDAR_EVENT_SEA_JFK = {
    "id": "evt-5",
    "customer_id": "cust-1",
    "event_type": "flight",
    "start_datetime": "2026-09-10T08:00:00+00:00",
    "end_datetime": "2026-09-14T08:00:00+00:00",
    "raw_details": {"destination_country": "USA"},
    "origin": "Seattle-Tacoma International Airport (SEA)",
    "destination": "John F. Kennedy International Airport (JFK)",
}

CALENDAR_EVENT_UNKNOWN = {
    "id": "evt-2",
    "customer_id": "cust-1",
    "event_type": "flight",
    "start_datetime": "2026-10-01T08:00:00+00:00",
    "end_datetime": "2026-10-05T08:00:00+00:00",
    "raw_details": {"destination_country": "Brazil"},
    "origin": "Some Unknown Airport (XYZ)",
    "destination": "Sao Paulo (GRU)",
}

CALENDAR_EVENT_LONDON_CITY = {
    "id": "evt-3",
    "customer_id": "cust-1",
    "event_type": "flight",
    "start_datetime": "2026-11-01T08:00:00+00:00",
    "end_datetime": "2026-11-07T08:00:00+00:00",
    "raw_details": {"destination_country": "Japan"},
    "origin": "London",
    "destination": "Tokyo Narita (NRT)",
}

CALENDAR_EVENT_ST_PANCRAS = {
    "id": "evt-4",
    "customer_id": "cust-1",
    "event_type": "flight",
    "start_datetime": "2026-12-01T08:00:00+00:00",
    "end_datetime": "2026-12-03T08:00:00+00:00",
    "raw_details": {"destination_country": "France"},
    "origin": "London St Pancras",
    "destination": "Paris Gare du Nord",
}

CUSTOMER = {"id": "cust-1", "phone_number": "+15550001111"}
DEVICE_LOCATION_LONDON  = {"latitude": 51.5007, "longitude": -0.1246, "label": "Central London"}
DEVICE_LOCATION_SEATTLE = {"latitude": 47.6062, "longitude": -122.3321, "label": "Seattle"}


class _FakeStructuredLLM:
    def __init__(self, response: RideSuggestion):
        self._response = response

    def invoke(self, _prompt):
        return self._response


class _FakeLLM:
    def __init__(self, response: RideSuggestion):
        self._response = response

    def with_structured_output(self, _model_cls):
        return _FakeStructuredLLM(self._response)


def _patch_llm(monkeypatch, response: RideSuggestion):
    monkeypatch.setattr(uber_graph_module, "_llm", lambda: _FakeLLM(response))


def _make_ctx(calendar_event: dict, emit=None, device_location: Optional[dict] = None) -> AgentContext:
    context = {"customer": CUSTOMER, "calendar_event": calendar_event}
    if device_location is not None:
        context["device_location"] = device_location
    return AgentContext(
        run_id=str(uuid.uuid4()),
        principal=CUSTOMER,
        context=context,
        emit=emit or (lambda _: None),
    )


# ---------------------------------------------------------------------------
# 1. Airport origin with known coordinates → deeplink built
# ---------------------------------------------------------------------------

def test_uber_graph_airport_origin_builds_deeplink(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="airport",
        reasoning="LHR departure — airport transfer makes sense.",
        suggested_message="Need a ride to Heathrow before your Tokyo flight?",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LHR_NRT,
    })

    assert state["origin_type"] == "airport"
    assert state["origin_label"] == "London Heathrow (LHR)"
    assert state["destination_label"] == "Tokyo Narita (NRT)"
    assert state["pickup_label"] == "Current location"
    assert state["dropoff_label"] == "London Heathrow (LHR)"
    assert state["suggested_message"] == "Need a ride to Heathrow before your Tokyo flight?"
    assert state["uber_app_url"].startswith("uber://?")
    assert state["deep_link_url"].startswith("https://m.uber.com/ul/?")
    # LHR coordinates appear in the dropoff params
    assert "51.47" in state["uber_app_url"]
    assert "0.4543" in state["uber_app_url"]


# ---------------------------------------------------------------------------
# 2. US airport (SEA) — deeplink with SEA coordinates
# ---------------------------------------------------------------------------

def test_uber_graph_us_airport_builds_deeplink(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="airport",
        reasoning="SEA departure.",
        suggested_message="Need a ride to Sea-Tac before your flight?",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_SEA_JFK,
        "device_location": DEVICE_LOCATION_SEATTLE,
    })

    assert state["origin_type"] == "airport"
    assert state["uber_app_url"].startswith("uber://?")
    # SEA coordinates in dropoff
    assert "47.4502" in state["uber_app_url"] or "122.3088" in state["uber_app_url"]


# ---------------------------------------------------------------------------
# 3. Unknown airport → still produces a deeplink (pickup=my_location fallback)
# ---------------------------------------------------------------------------

def test_uber_graph_unknown_airport_falls_back_gracefully(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="unknown",
        reasoning="Origin airport not recognised.",
        suggested_message="Need an Uber before your trip? We can open the app with your current location.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_UNKNOWN,
    })

    assert state["origin_type"] == "unknown"
    # Must still have some deeplink — either a direct URL or airport options
    has_url = bool(state.get("uber_app_url") or state.get("deep_link_url"))
    has_options = bool(state.get("airport_options"))
    assert has_url or has_options


# ---------------------------------------------------------------------------
# 4. City origin ("London") → curated airport options, no single deeplink
# ---------------------------------------------------------------------------

def test_uber_graph_city_origin_returns_airport_options(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="airport",
        reasoning="London departure detected.",
        suggested_message="Choose your London airport.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LONDON_CITY,
    })

    assert state["pickup_label"] == "Current location"
    assert state["dropoff_label"] == "London"
    assert state["uber_app_url"] is None
    assert state["deep_link_url"] is None
    assert [opt["label"] for opt in state["airport_options"]] == [
        "London Heathrow (LHR)",
        "London Gatwick (LGW)",
    ]
    for opt in state["airport_options"]:
        assert opt["uber_app_url"].startswith("uber://?")
        assert opt["deep_link_url"].startswith("https://m.uber.com/ul/?")
        assert "pickup=my_location" in opt["uber_app_url"]


# ---------------------------------------------------------------------------
# 5. City origin + device location → pickup coordinates in airport option URLs
# ---------------------------------------------------------------------------

def test_uber_graph_city_origin_with_device_location_pre_fills_pickup(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="airport",
        reasoning="London departure.",
        suggested_message="Choose your London airport.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LONDON_CITY,
        "device_location": DEVICE_LOCATION_LONDON,
    })

    for opt in state["airport_options"]:
        assert "pickup[latitude]=51.5007" in opt["uber_app_url"]
        assert "pickup[longitude]=-0.1246" in opt["uber_app_url"]
        assert "pickup[nickname]=Central%20London" in opt["uber_app_url"]
        assert "pickup=my_location" not in opt["uber_app_url"]


# ---------------------------------------------------------------------------
# 6. Known airport + device location → pickup coords replace my_location
# ---------------------------------------------------------------------------

def test_uber_graph_device_location_overrides_my_location(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="airport",
        reasoning="Known airports.",
        suggested_message="Your Heathrow ride awaits.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LHR_NRT,
        "device_location": DEVICE_LOCATION_LONDON,
    })

    for url in (state["uber_app_url"], state["deep_link_url"]):
        assert "pickup[latitude]=51.5007" in url
        assert "pickup[longitude]=-0.1246" in url
        assert "pickup[nickname]=Central%20London" in url
        assert "pickup=my_location" not in url
        assert "51.47" in url       # LHR latitude in dropoff
        assert "0.4543" in url      # LHR longitude in dropoff


# ---------------------------------------------------------------------------
# 7. Train station far from user → alternative airport options built
# ---------------------------------------------------------------------------

def test_uber_graph_train_station_far_from_user_builds_alternatives(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="train_station",
        reasoning="London St Pancras is a train station, user is in Seattle.",
        suggested_message="Need a ride to St Pancras for your Eurostar?",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_ST_PANCRAS,
        "device_location": DEVICE_LOCATION_SEATTLE,
    })

    assert state["origin_type"] == "train_station"
    assert state["uber_app_url"].startswith("uber://?")
    assert len(state["alternative_options"]) > 0
    for opt in state["alternative_options"]:
        assert opt["label"]
        assert opt["uber_app_url"].startswith("uber://?")
        assert opt["deep_link_url"].startswith("https://m.uber.com/ul/?")


# ---------------------------------------------------------------------------
# 8. Train station close to user → no alternative options
# ---------------------------------------------------------------------------

def test_uber_graph_train_station_nearby_has_no_alternatives(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="train_station",
        reasoning="London St Pancras, user is also in London.",
        suggested_message="Need a ride to St Pancras?",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_ST_PANCRAS,
        "device_location": DEVICE_LOCATION_LONDON,
    })

    assert state["origin_type"] == "train_station"
    # Station is close to the user — no alternatives expected
    assert state["alternative_options"] == []


# ---------------------------------------------------------------------------
# 9. UberAgent.execute() — always emits recommendation_ready, never error
# ---------------------------------------------------------------------------

def test_uber_agent_always_emits_recommendation_ready(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="airport",
        reasoning="Airport transfer makes sense.",
        suggested_message="Need a ride to Heathrow?",
    ))

    emitted = []
    ctx = _make_ctx(CALENDAR_EVENT_LHR_NRT, emit=emitted.append, device_location=DEVICE_LOCATION_LONDON)

    result = UberAgent().execute(ctx)

    event_types = [e["type"] for e in emitted]
    assert "recommendation_ready" in event_types
    assert "done" in event_types
    assert event_types[-1] == "done"
    assert "error" not in event_types

    assert result.status == "ok"
    assert len(result.cards) == 1
    card = result.cards[0]
    assert card["kind"] == "uber_ride"
    assert card["origin_type"] == "airport"
    assert card["suggested_message"] == "Need a ride to Heathrow?"
    assert card["pickup_label"] == "Central London"
    assert card["dropoff_label"] == "London Heathrow (LHR)"
    assert card["uber_app_url"].startswith("uber://?")
    assert card["deep_link_url"].startswith("https://m.uber.com/ul/?")
    assert result.proposed_actions == []


def test_uber_agent_emits_card_even_for_unknown_origin(monkeypatch):
    """Unknown origin still produces a card — no error path any more."""
    _patch_llm(monkeypatch, RideSuggestion(
        origin_type="unknown",
        reasoning="Origin not recognised.",
        suggested_message="Need an Uber before your trip?",
    ))

    emitted = []
    ctx = _make_ctx(CALENDAR_EVENT_UNKNOWN, emit=emitted.append)

    result = UberAgent().execute(ctx)

    event_types = [e["type"] for e in emitted]
    assert "recommendation_ready" in event_types
    assert "error" not in event_types
    assert result.cards[0]["kind"] == "uber_ride"


# ---------------------------------------------------------------------------
# 10. execute_action() → UnsupportedActionError (no commit actions)
# ---------------------------------------------------------------------------

def test_uber_agent_execute_action_raises_unsupported():
    ctx = _make_ctx(CALENDAR_EVENT_LHR_NRT)
    with pytest.raises(UnsupportedActionError):
        UberAgent().execute_action(ctx, "activate_anything")


# ---------------------------------------------------------------------------
# 11. Manifest smoke check
# ---------------------------------------------------------------------------

def test_uber_agent_manifest_fields():
    m = UberAgent().manifest

    assert m.name == "uber_agent"
    assert m.enabled is True
    assert "uber" in m.capabilities
    assert "trip.detected" in m.triggers.events
    assert "uber.get_deeplink" in m.tools
    assert "uber.get_auth_url" not in m.tools        # MCP auth removed
    assert "uber.get_price_estimates" not in m.tools  # MCP quotes removed
    assert "device_location" in m.required_context
    assert m.actions == []
