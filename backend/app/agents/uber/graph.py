"""UberAgent LangGraph — Official Uber deep-link integration.

Uses Uber's official deep-link API (m.uber.com/ul/) which requires no auth token.
No third-party dependencies.

  extract_trip_context  ->  suggest_ride  --(True)-->  build_deeplink  ->  END
                                          --(False)--> END

Node responsibilities:
  extract_trip_context : pull trip metadata from the calendar event and device location.
  suggest_ride         : the LLM decides whether a ride to the departure airport
                         makes sense and writes the suggested_message.
  build_deeplink       : build the deep-link handoff into the Uber app.
                         Only reached when should_suggest=True.
"""
from __future__ import annotations

import logging
from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.uber.prompts import suggest_ride_prompt
from app.agents.uber.schemas import RideSuggestion
from app.agents.uber.state import UberAgentState
from app.config import get_settings
from app.tools.uber_deeplink import (
    build_airport_deeplink_options,
    build_uber_deeplink,
    lookup_airport_coordinates,
)

logger = logging.getLogger(__name__)


def _llm():
    settings = get_settings()
    provider = (settings.llm_provider or "openai").strip().lower()

    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("OpenAI is the default LLM provider, but OPENAI_API_KEY is missing")
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing")
        return ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
            temperature=0,
        )

    raise RuntimeError(f"Unsupported LLM_PROVIDER: {provider}")


def _trip_duration_days(calendar_event: dict) -> int:
    try:
        start = datetime.fromisoformat(calendar_event["start_datetime"])
        end = datetime.fromisoformat(calendar_event["end_datetime"])
        return max(1, (end - start).days)
    except (KeyError, ValueError):
        return 1


def node_extract_trip_context(state: UberAgentState, writer: StreamWriter) -> dict:
    """Pull origin/destination from the calendar event and emit an early status event.

    Mirrors roaming/graph.py's node_extract_trip_context: dependency-free, runs first,
    gives the mobile client something to show well within any inactivity timeout.
    The ride suggestion itself is for the departure leg: current location -> origin.
    """
    writer({"kind": "status", "text": "Checking your flight details for an Uber ride…"})

    calendar_event = state.get("calendar_event", {})
    origin_label = calendar_event.get("origin")
    destination_label = calendar_event.get("destination")
    destination_country = (
        calendar_event.get("raw_details", {}).get("destination_country")
        or destination_label
        or "your destination"
    )

    writer({
        "kind": "status",
        "text": f"Flight from {origin_label or 'your location'} to {destination_label or 'your destination'} detected.",
    })
    logger.info(
        "uber graph extract context | customer_id=%s | origin=%r | destination=%r | destination_country=%r | has_device_location=%s",
        state.get("customer_id"),
        origin_label,
        destination_label,
        destination_country,
        bool(state.get("device_location")),
    )

    return {
        "origin_label": origin_label,
        "destination_label": destination_label,
        # Stash destination_country in context for the prompt — not a top-level state
        # key so we carry it via the calendar_event reference already in state.
    }


def node_suggest_ride(state: UberAgentState, writer: StreamWriter) -> dict:
    """The LLM decides whether to suggest a ride and writes the user-facing message."""
    writer({"kind": "tool_started", "tool": "uber.suggest_ride"})

    calendar_event = state.get("calendar_event", {})
    destination_country = (
        calendar_event.get("raw_details", {}).get("destination_country")
        or state.get("destination_label")
        or "your destination"
    )
    duration_days = _trip_duration_days(calendar_event)

    llm = _llm().with_structured_output(RideSuggestion)
    prompt = suggest_ride_prompt(
        origin_label=state.get("origin_label") or "unknown",
        destination_label=state.get("destination_label") or "unknown",
        trip_duration_days=duration_days,
        destination_country=destination_country,
    )
    result: RideSuggestion = llm.invoke(prompt)
    logger.info(
        "uber graph suggest ride complete | customer_id=%s | should_suggest=%s | reasoning=%r | suggested_message=%r",
        state.get("customer_id"),
        result.should_suggest,
        result.reasoning,
        result.suggested_message,
    )

    writer({"kind": "tool_completed", "tool": "uber.suggest_ride"})

    return {
        "should_suggest": result.should_suggest,
        "reasoning": result.reasoning,
        "suggested_message": result.suggested_message,
    }


def node_build_deeplink(state: UberAgentState, writer: StreamWriter) -> dict:
    """Build the Uber deep link for current location -> departure airport.

    Uses app.tools.uber_deeplink — the only currently approved Uber integration path.
    No OAuth token or Uber API approval required (verified live 2026-08-19).

    When the mobile app provides a device location, we bake those pickup coordinates
    into the link so the native Uber app pre-fills both ends more reliably. If not,
    we fall back to Uber's `pickup=my_location` behavior.
    """
    writer({"kind": "tool_started", "tool": "uber.get_deeplink"})

    origin_label = state.get("origin_label")
    dropoff_coords = lookup_airport_coordinates(origin_label)
    device_location = state.get("device_location") or {}
    pickup_latitude = device_location.get("latitude")
    pickup_longitude = device_location.get("longitude")
    pickup_label = state.get("pickup_label") or device_location.get("label") or "Current location"
    airport_options = []
    logger.info(
        "uber graph deeplink start | customer_id=%s | origin_label=%r | pickup_coords_present=%s | dropoff_coords_present=%s",
        state.get("customer_id"),
        origin_label,
        pickup_latitude is not None and pickup_longitude is not None,
        bool(dropoff_coords),
    )

    if dropoff_coords:
        dropoff_lat, dropoff_lng = dropoff_coords
        uber_app_url, web_fallback_url = build_uber_deeplink(
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
            dropoff_latitude=dropoff_lat,
            dropoff_longitude=dropoff_lng,
            dropoff_nickname=origin_label,
        )
    else:
        airport_options = build_airport_deeplink_options(
            origin_label,
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
        )
        if airport_options:
            uber_app_url = None
            web_fallback_url = None
        else:
            uber_app_url, web_fallback_url = build_uber_deeplink(
                pickup_latitude=pickup_latitude,
                pickup_longitude=pickup_longitude,
                pickup_nickname=pickup_label,
            )

    writer({"kind": "tool_completed", "tool": "uber.get_deeplink"})
    logger.info(
        "uber graph deeplink complete | customer_id=%s | has_uber_app_url=%s | has_deep_link_url=%s | airport_option_count=%d",
        state.get("customer_id"),
        bool(uber_app_url),
        bool(web_fallback_url),
        len(airport_options),
    )

    return {
        "pickup_label": pickup_label,
        "dropoff_label": origin_label,
        "uber_app_url": uber_app_url,
        "deep_link_url": web_fallback_url,
        "airport_options": airport_options,
    }


def _route_after_suggest(state: UberAgentState) -> str:
    """Conditional edge: skip deeplink when the LLM says don't suggest."""
    if state.get("should_suggest"):
        return "build_deeplink"
    return END


def build_uber_graph():
    """Graph: extract -> suggest -> [conditional] -> deeplink -> END.

    suggest_ride branches:
      should_suggest=True  -> build_deeplink -> END
      should_suggest=False -> END
    """
    graph = StateGraph(UberAgentState)

    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("suggest_ride", node_suggest_ride)
    graph.add_node("build_deeplink", node_build_deeplink)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "suggest_ride")
    graph.add_conditional_edges("suggest_ride", _route_after_suggest)
    graph.add_edge("build_deeplink", END)

    return graph.compile()


uber_graph = build_uber_graph()
