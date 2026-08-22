"""Tests for the Uber agent LangGraph and UberAgent.execute().

Mirrors the structure of test_agent_graph.py (roaming agent) exactly:
  - monkeypatches _llm so no real Anthropic call is ever made
  - drives the compiled graph directly with .invoke()
  - verifies state transitions, card output, and stream events

Coverage:
  1. Graph happy path  — Claude says suggest=True → deeplink URLs produced
  2. Graph no-suggest  — Claude says suggest=False → no URLs, should_suggest=False
  3. Graph unknown airport — origin not in known-coords map → my_location fallback
  4. Graph city origin — returns airport choice options instead of a single URL
  5. Graph known airports — current location → LHR coords resolved and present in URLs
  6. UberAgent.execute() suggest=True  → recommendation_ready + done emitted
  7. UberAgent.execute() suggest=False → error + done emitted, no card
  8. UberAgent.execute_action() → raises UnsupportedActionError (no commit actions)
  9. Registry discovers uber_agent  → already covered by test_registry.py,
     included here as a smoke check too
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

CUSTOMER = {"id": "cust-1", "phone_number": "+15550001111"}
DEVICE_LOCATION = {"latitude": 51.5007, "longitude": -0.1246, "label": "Central London"}


class _FakeStructuredLLM:
    """Replays a pre-built RideSuggestion on every .invoke() call."""
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
# 1. Graph happy path — suggest=True, known airports
# ---------------------------------------------------------------------------

def test_uber_graph_suggests_ride_for_known_airports(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
        reasoning="LHR departure, NRT arrival — airport transfer makes sense.",
        suggested_message="Need a ride to Heathrow before your Tokyo flight?",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LHR_NRT,
    })

    assert state["should_suggest"] is True
    assert state["origin_label"] == "London Heathrow (LHR)"
    assert state["destination_label"] == "Tokyo Narita (NRT)"
    assert state["pickup_label"] == "Current location"
    assert state["dropoff_label"] == "London Heathrow (LHR)"
    assert state["suggested_message"] == "Need a ride to Heathrow before your Tokyo flight?"
    # Deep link URLs must be produced
    assert state["uber_app_url"].startswith("uber://?")
    assert state["deep_link_url"].startswith("https://m.uber.com/ul/?")


# ---------------------------------------------------------------------------
# 2. Graph no-suggest — Claude says don't suggest
# ---------------------------------------------------------------------------

def test_uber_graph_no_suggestion_when_claude_declines(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=False,
        reasoning="Origin airport unclear — can't pre-fill pickup.",
        suggested_message="No Uber suggestion available for this trip.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_UNKNOWN,
    })

    assert state["should_suggest"] is False
    assert state["suggested_message"] == "No Uber suggestion available for this trip."
    # Graph short-circuits to END after suggest_ride when should_suggest=False —
    # build_deeplink never runs, so uber_app_url and deep_link_url are NOT in state.
    assert "uber_app_url" not in state
    assert "deep_link_url" not in state
    assert "airport_options" not in state


# ---------------------------------------------------------------------------
# 3. Graph unknown airport — coords not in map → my_location fallback
# ---------------------------------------------------------------------------

def test_uber_graph_unknown_airport_falls_back_to_my_location(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
        reasoning="Flight detected.",
        suggested_message="Book your airport Uber.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_UNKNOWN,
    })

    # Pickup coords unknown → my_location in URL
    assert "pickup=my_location" in state["uber_app_url"] or "pickup=my_location" in state["deep_link_url"]
    # No pickup[latitude] since coords are missing
    assert "pickup%5Blatitude%5D" not in state["uber_app_url"]
    assert "pickup[latitude]" not in state["uber_app_url"]


# ---------------------------------------------------------------------------
# 4. Graph city origin — user chooses from curated airport options first
# ---------------------------------------------------------------------------

def test_uber_graph_city_origin_returns_airport_options(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
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
    assert [option["label"] for option in state["airport_options"]] == [
        "London Heathrow (LHR)",
        "London Gatwick (LGW)",
    ]

    for option in state["airport_options"]:
        assert option["uber_app_url"].startswith("uber://?")
        assert option["deep_link_url"].startswith("https://m.uber.com/ul/?")
        assert "pickup=my_location" in option["uber_app_url"]
        assert "pickup=my_location" in option["deep_link_url"]


def test_uber_graph_city_origin_preserves_device_pickup_for_airport_options(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
        reasoning="London departure detected.",
        suggested_message="Choose your London airport.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LONDON_CITY,
        "device_location": DEVICE_LOCATION,
    })

    for option in state["airport_options"]:
        assert "pickup[latitude]=51.5007" in option["uber_app_url"]
        assert "pickup[longitude]=-0.1246" in option["uber_app_url"]
        assert "pickup[nickname]=Central%20London" in option["uber_app_url"]
        assert "pickup[latitude]=51.5007" in option["deep_link_url"]
        assert "pickup[longitude]=-0.1246" in option["deep_link_url"]
        assert "pickup[nickname]=Central%20London" in option["deep_link_url"]


# ---------------------------------------------------------------------------
# 5. Graph known airports — current location + LHR dropoff appear in the URL
# ---------------------------------------------------------------------------

def test_uber_graph_known_airports_include_coordinates_in_url(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
        reasoning="Known airports.",
        suggested_message="Your Heathrow ride awaits.",
    ))

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "calendar_event": CALENDAR_EVENT_LHR_NRT,
        "device_location": DEVICE_LOCATION,
    })

    # Pickup should use the rider's device coordinates when available.
    for url in (state["uber_app_url"], state["deep_link_url"]):
        assert "pickup[latitude]=51.5007" in url
        assert "pickup[longitude]=-0.1246" in url
        assert "pickup[nickname]=Central%20London" in url
        assert "pickup=my_location" not in url

    # LHR lat/lng (51.47, -0.4543) must appear as the dropoff in both URLs.
    for url in (state["uber_app_url"], state["deep_link_url"]):
        assert "51.47" in url
        assert "0.4543" in url   # longitude (negative sign encoded/stripped)
        assert "London+Heathrow" in url or "LHR" in url
        assert "35.772" not in url
        assert "140.3929" not in url


def test_uber_graph_adds_connect_url_when_mcp_needs_auth(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
        reasoning="Airport transfer makes sense.",
        suggested_message="Need a ride to Heathrow?",
    ))
    monkeypatch.setattr(uber_graph_module, "uber_mcp_is_configured", lambda: True)
    monkeypatch.setattr(
        uber_graph_module,
        "maybe_get_ride_quote",
        lambda **_kwargs: {
            "mcp_available": True,
            "connect_uber_url": "https://auth.example.test/uber",
            "quote_status": "Connect Uber to unlock live ride estimates.",
        },
    )

    state = uber_graph.invoke({
        "customer": CUSTOMER,
        "customer_id": CUSTOMER["id"],
        "calendar_event": CALENDAR_EVENT_LHR_NRT,
    })

    assert state["connect_uber_url"] == "https://auth.example.test/uber"
    assert state["quote_status"] == "Connect Uber to unlock live ride estimates."
    assert state["live_quote"] is None


# ---------------------------------------------------------------------------
# 6. UberAgent.execute() suggest=True → recommendation_ready + done emitted
# ---------------------------------------------------------------------------

def test_uber_agent_execute_emits_recommendation_ready_and_done(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=True,
        reasoning="Airport transfer makes sense.",
        suggested_message="Need a ride to Heathrow?",
    ))
    monkeypatch.setattr(uber_graph_module, "uber_mcp_is_configured", lambda: True)
    monkeypatch.setattr(
        uber_graph_module,
        "maybe_get_ride_quote",
        lambda **_kwargs: {
            "mcp_available": True,
            "live_quote": {
                "product_name": "UberX",
                "estimate": "£24-30",
                "currency_code": "GBP",
                "eta_minutes": 18,
            },
            "quote_status": "Live Uber quote via MCP from 2 product option(s).",
        },
    )

    emitted = []
    ctx = _make_ctx(CALENDAR_EVENT_LHR_NRT, emit=emitted.append, device_location=DEVICE_LOCATION)

    agent = UberAgent()
    result = agent.execute(ctx)

    event_types = [e["type"] for e in emitted]
    assert "recommendation_ready" in event_types
    assert "done" in event_types
    assert event_types[-1] == "done"

    # Card shape validation
    assert result.status == "ok"
    assert len(result.cards) == 1
    card = result.cards[0]
    assert card["kind"] == "uber_ride"
    assert card["should_suggest"] is True
    assert card["pickup_label"] == "Central London"
    assert card["dropoff_label"] == "London Heathrow (LHR)"
    assert card["uber_app_url"].startswith("uber://?")
    assert "pickup[latitude]=51.5007" in card["uber_app_url"]
    assert "pickup[longitude]=-0.1246" in card["uber_app_url"]
    assert card["deep_link_url"].startswith("https://m.uber.com/ul/?")
    assert "pickup[latitude]=51.5007" in card["deep_link_url"]
    assert "pickup[longitude]=-0.1246" in card["deep_link_url"]
    assert card["live_quote"] == {
        "product_name": "UberX",
        "estimate": "£24-30",
        "currency_code": "GBP",
        "eta_minutes": 18,
    }
    assert card["quote_status"] == "Live Uber quote via MCP from 2 product option(s)."
    assert result.proposed_actions == []   # no commit action — deep link only


# ---------------------------------------------------------------------------
# 7. UberAgent.execute() suggest=False → error + done, no card
# ---------------------------------------------------------------------------

def test_uber_agent_execute_no_suggestion_emits_error_and_done(monkeypatch):
    _patch_llm(monkeypatch, RideSuggestion(
        should_suggest=False,
        reasoning="Origin unclear.",
        suggested_message="No Uber suggestion for this trip.",
    ))

    emitted = []
    ctx = _make_ctx(CALENDAR_EVENT_UNKNOWN, emit=emitted.append)

    agent = UberAgent()
    result = agent.execute(ctx)

    event_types = [e["type"] for e in emitted]
    assert "error" in event_types
    assert "done" in event_types
    assert "recommendation_ready" not in event_types

    assert result.status == "ok"
    assert result.cards == []
    assert result.proposed_actions == []


# ---------------------------------------------------------------------------
# 8. execute_action() → UnsupportedActionError (no commit actions declared)
# ---------------------------------------------------------------------------

def test_uber_agent_execute_action_raises_unsupported(monkeypatch):
    ctx = _make_ctx(CALENDAR_EVENT_LHR_NRT)
    agent = UberAgent()

    with pytest.raises(UnsupportedActionError):
        agent.execute_action(ctx, "activate_anything")


# ---------------------------------------------------------------------------
# 9. Manifest smoke check — correct fields declared
# ---------------------------------------------------------------------------

def test_uber_agent_manifest_fields():
    agent = UberAgent()
    m = agent.manifest

    assert m.name == "uber_agent"
    assert m.enabled is True
    assert "uber" in m.capabilities
    assert "trip.detected" in m.triggers.events
    assert "uber.get_auth_url" in m.tools
    assert "uber.get_price_estimates" in m.tools
    assert "uber.get_deeplink" in m.tools
    assert "device_location" in m.required_context
    assert m.actions == []   # no commit-risk actions
