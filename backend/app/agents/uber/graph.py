"""UberAgent LangGraph — 3-node graph: extract_trip_context → suggest_ride → build_deeplink → END."""
from __future__ import annotations

import logging
from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.maps.maps_client import geocode, get_route, reverse_geocode
from app.agents.uber.prompts import suggest_ride_prompt
from app.agents.uber.schemas import RideSuggestion
from app.agents.uber.state import UberAgentState
from app.config import get_settings
from app.tools.uber_deeplink import (
    build_airport_deeplink_options,
    build_uber_deeplink,
    find_nearest_airports,
    is_far_from_user,
    lookup_airport_coordinates,
)

logger = logging.getLogger(__name__)


def _llm():
    settings = get_settings()
    if settings.anthropic_api_key:
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key, temperature=0)
    if settings.openai_api_key:
        return ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, temperature=0)
    raise RuntimeError("No LLM key configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY in backend/.env")


def _trip_duration_days(calendar_event: dict) -> int:
    try:
        start = datetime.fromisoformat(calendar_event["start_datetime"])
        end = datetime.fromisoformat(calendar_event["end_datetime"])
        return max(1, (end - start).days)
    except (KeyError, ValueError):
        return 1


def node_extract_trip_context(state: UberAgentState, writer: StreamWriter) -> dict:
    writer({"kind": "status", "text": "Checking your flight details for an Uber ride…"})
    calendar_event = state.get("calendar_event", {})
    origin_label = calendar_event.get("origin")
    destination_label = calendar_event.get("destination")
    writer({
        "kind": "status",
        "text": f"Flight from {origin_label or 'your location'} to {destination_label or 'your destination'} detected.",
    })
    logger.info(
        "uber graph extract context | customer_id=%s | origin=%r | destination=%r",
        state.get("customer_id"), origin_label, destination_label,
    )
    return {"origin_label": origin_label, "destination_label": destination_label}


def node_suggest_ride(state: UberAgentState, writer: StreamWriter) -> dict:
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
        "uber graph suggest ride | customer_id=%s | origin_type=%s | message=%r",
        state.get("customer_id"), result.origin_type, result.suggested_message,
    )
    writer({"kind": "tool_completed", "tool": "uber.suggest_ride"})
    return {
        "origin_type": result.origin_type,
        "reasoning": result.reasoning,
        "suggested_message": result.suggested_message,
    }


def node_build_deeplink(state: UberAgentState, writer: StreamWriter) -> dict:
    writer({"kind": "tool_started", "tool": "uber.get_deeplink"})

    settings = get_settings()
    api_key = settings.google_maps_api_key
    origin_label = state.get("origin_label")
    origin_type = state.get("origin_type", "airport")
    device_location = state.get("device_location") or {}
    pickup_latitude = device_location.get("latitude")
    pickup_longitude = device_location.get("longitude")

    # ── Pickup label: reverse geocode GPS → "Shoreditch, London" ────────────
    pickup_label = device_location.get("label") or "Current location"
    if pickup_latitude and pickup_longitude and api_key:
        label = reverse_geocode(pickup_latitude, pickup_longitude, api_key)
        if label:
            pickup_label = label
            logger.info("uber graph pickup reverse-geocoded → %r", pickup_label)

    # ── Dropoff coords: hardcoded dict first, then geocoding fallback ────────
    dropoff_coords = lookup_airport_coordinates(origin_label)
    if not dropoff_coords and origin_label and api_key:
        logger.info("uber graph coords MISS for %r — trying geocoding fallback", origin_label)
        raw = geocode(origin_label, api_key)
        if raw:
            dropoff_coords = (raw["lat"], raw["lng"])
            logger.info("uber graph geocoding fallback OK → %s", dropoff_coords)

    airport_options: list = []
    alternative_options: list = []
    uber_app_url = None
    web_fallback_url = None
    drive_mins_to_airport: int | None = None

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

        # ── Drive time to airport ────────────────────────────────────────────
        if pickup_latitude and pickup_longitude and api_key:
            pickup_addr = f"{pickup_latitude},{pickup_longitude}"
            dropoff_addr = f"{dropoff_lat},{dropoff_lng}"
            route = get_route(pickup_addr, dropoff_addr, api_key, "DRIVE")
            if route:
                drive_mins_to_airport = max(1, round(route["duration_secs"] / 60))
                logger.info("uber graph drive time to airport: %d min", drive_mins_to_airport)

        if origin_type in ("train_station", "ferry") and pickup_latitude and pickup_longitude:
            if is_far_from_user(dropoff_lat, dropoff_lng, pickup_latitude, pickup_longitude):
                for alt_label, (alt_lat, alt_lng) in find_nearest_airports(pickup_latitude, pickup_longitude):
                    alt_app_url, alt_web_url = build_uber_deeplink(
                        pickup_latitude=pickup_latitude,
                        pickup_longitude=pickup_longitude,
                        pickup_nickname=pickup_label,
                        dropoff_latitude=alt_lat,
                        dropoff_longitude=alt_lng,
                        dropoff_nickname=alt_label,
                    )
                    alternative_options.append({
                        "label": alt_label,
                        "uber_app_url": alt_app_url,
                        "deep_link_url": alt_web_url,
                    })
    else:
        airport_options = build_airport_deeplink_options(
            origin_label,
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
        )
        if not airport_options:
            uber_app_url, web_fallback_url = build_uber_deeplink(
                pickup_latitude=pickup_latitude,
                pickup_longitude=pickup_longitude,
                pickup_nickname=pickup_label,
            )

    writer({"kind": "tool_completed", "tool": "uber.get_deeplink"})
    logger.info(
        "uber graph deeplink complete | customer_id=%s | has_url=%s | airport_options=%d | alternatives=%d | drive_mins=%s",
        state.get("customer_id"), bool(uber_app_url), len(airport_options), len(alternative_options), drive_mins_to_airport,
    )
    return {
        "pickup_label": pickup_label,
        "dropoff_label": origin_label,
        "uber_app_url": uber_app_url,
        "deep_link_url": web_fallback_url,
        "airport_options": airport_options,
        "alternative_options": alternative_options,
        "drive_mins_to_airport": drive_mins_to_airport,
    }


def build_uber_graph():
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
