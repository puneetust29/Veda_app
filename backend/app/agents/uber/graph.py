"""UberAgent LangGraph — three nodes, no retries needed for a deeplink flow.

  extract_trip_context  →  suggest_ride  →  build_deeplink  →  END

Node responsibilities:
  extract_trip_context : pull origin/destination labels + trip metadata from the
                         calendar event; emit a status event so the mobile client
                         sees activity immediately (before any LLM call).
  suggest_ride         : the LLM decides whether a ride makes sense and writes the
                         suggested_message the mobile UI will display.
  build_deeplink       : call the verified-working uber_deeplink tool to produce the
                         uber:// and m.uber.com/ul/ URLs; no Uber OAuth needed.
"""
from __future__ import annotations

from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.uber.prompts import suggest_ride_prompt
from app.agents.uber.schemas import RideSuggestion
from app.agents.uber.state import UberAgentState
from app.config import get_settings
from app.tools.uber_deeplink import build_uber_deeplink, lookup_airport_coordinates


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

    writer({"kind": "tool_completed", "tool": "uber.suggest_ride"})

    return {
        "should_suggest": result.should_suggest,
        "reasoning": result.reasoning,
        "suggested_message": result.suggested_message,
    }


def node_build_deeplink(state: UberAgentState, writer: StreamWriter) -> dict:
    """Build the verified-working Uber deep link URLs using the existing tool.

    Uses app.tools.uber_deeplink — the only currently approved Uber integration path.
    No OAuth token or Uber API approval required (verified live 2026-08-19).
    """
    writer({"kind": "tool_started", "tool": "uber.get_deeplink"})

    origin_label = state.get("origin_label")
    destination_label = state.get("destination_label")

    pickup_coords = lookup_airport_coordinates(origin_label)
    dropoff_coords = lookup_airport_coordinates(destination_label)

    pickup_lat, pickup_lng = pickup_coords if pickup_coords else (None, None)
    dropoff_lat, dropoff_lng = dropoff_coords if dropoff_coords else (None, None)

    uber_app_url, web_fallback_url = build_uber_deeplink(
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lng,
        pickup_nickname=origin_label,
        dropoff_latitude=dropoff_lat,
        dropoff_longitude=dropoff_lng,
        dropoff_nickname=destination_label,
    )

    writer({"kind": "tool_completed", "tool": "uber.get_deeplink"})

    return {
        "uber_app_url": uber_app_url,
        "deep_link_url": web_fallback_url,
    }


def build_uber_graph():
    """Three-node linear graph: extract → suggest → deeplink."""
    graph = StateGraph(UberAgentState)

    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("suggest_ride", node_suggest_ride)
    graph.add_node("build_deeplink", node_build_deeplink)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "suggest_ride")
    graph.add_edge("suggest_ride", "build_deeplink")
    graph.add_edge("build_deeplink", END)

    return graph.compile()


uber_graph = build_uber_graph()
