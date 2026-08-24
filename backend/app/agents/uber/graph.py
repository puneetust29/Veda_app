"""UberAgent LangGraph — uber-mcp integration (branch: feature/uber-integration).

Uses the unofficial uber-mcp local server for real price/ETA data.
Falls back to the official Uber deep-link when the MCP server is unavailable.

  extract_trip_context  ->  suggest_ride  ->  get_uber_options  ->  END

Node responsibilities:
  extract_trip_context : pull trip metadata from the calendar event and device location.
  suggest_ride         : LLM classifies origin and writes the user-facing message.
  get_uber_options     : call uber-mcp (PUDO search + ranked offers) for real prices.
                         Falls back to deeplink when MCP is not configured/reachable.
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
from app.tools import uber_mcp_client
from app.tools import uber_session as _uber_session

# ── deeplink imports kept for fallback ──────────────────────────────────────
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
    """LLM classifies the origin type and writes the user-facing message.

    Always suggests a ride — origin_type determines the message and deeplink strategy.
    """
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
        "uber graph suggest ride | customer_id=%s | origin_type=%s | reasoning=%r | message=%r",
        state.get("customer_id"),
        result.origin_type,
        result.reasoning,
        result.suggested_message,
    )

    writer({"kind": "tool_completed", "tool": "uber.suggest_ride"})

    return {
        "origin_type": result.origin_type,
        "reasoning": result.reasoning,
        "suggested_message": result.suggested_message,
    }


def node_get_uber_options(state: UberAgentState, writer: StreamWriter) -> dict:
    """Get ride options via uber-mcp (real prices/ETAs) with deeplink fallback.

    Tries the MCP path first:
      1. uber_pudo_search  — resolve pickup (device coords) and dropoff (origin label)
      2. uber_offers_ranked — get ranked offers with prices and ETAs

    If MCP is not configured or the call fails, falls back to the original deeplink path.
    """
    writer({"kind": "tool_started", "tool": "uber.get_options"})

    origin_label = state.get("origin_label")
    origin_type = state.get("origin_type", "airport")
    device_location = state.get("device_location") or {}
    pickup_latitude = device_location.get("latitude")
    pickup_longitude = device_location.get("longitude")
    pickup_label = state.get("pickup_label") or device_location.get("label") or "Current location"
    airport_options: list = []
    alternative_options: list = []
    uber_app_url = None
    web_fallback_url = None
    ride_offers: list = []

    logger.info(
        "uber graph get_options start | customer_id=%s | mcp_configured=%s | origin_label=%r | pickup_coords=%s",
        state.get("customer_id"),
        uber_mcp_client.is_configured(),
        origin_label,
        pickup_latitude is not None and pickup_longitude is not None,
    )

    import json as _json

    mcp_success = False
    live_quote: dict | None = None
    connect_uber_url: str | None = None

    # Resolve per-user access token; fall back to global dev token if none stored.
    customer_id = state.get("customer_id")
    user_access_token: str | None = None
    if customer_id:
        user_access_token = _uber_session.get_valid_access_token(str(customer_id))

    def _call(name: str, arguments: dict, timeout: float = 20.0) -> dict:
        if user_access_token:
            return uber_mcp_client.call_tool_as(user_access_token, name, arguments, timeout)
        return uber_mcp_client.call_tool(name, arguments, timeout)

    mcp_ready = (user_access_token is not None) or uber_mcp_client.is_configured()

    # Always prompt the user to connect their own Uber account when they have no
    # personal session — even if the global dev token can still fetch prices.
    if not user_access_token:
        connect_uber_url = f"{get_settings().uber_mcp_url}/login/preview"

    if not mcp_ready:
        pass  # no MCP at all — deeplink fallback below handles it

    if mcp_ready and origin_label and pickup_latitude and pickup_longitude:
        try:
            writer({"kind": "status", "text": "Checking Uber prices for your trip…"})

            # Use coordinates from our static airport lookup first (fast, no API call)
            dropoff_coords = lookup_airport_coordinates(origin_label)
            if dropoff_coords:
                dropoff_lat, dropoff_lng = dropoff_coords
            else:
                # Fall back to PUDO search for unknown origins
                pudo_resp = _call("uber_pudo_search", {
                    "query": origin_label,
                    "latitude": pickup_latitude,
                    "longitude": pickup_longitude,
                    "sessionType": "destination",
                })
                pudo_text = (pudo_resp.get("result", {}).get("content") or [{}])[0].get("text", "{}")
                pudo_data = _json.loads(pudo_text) if isinstance(pudo_text, str) else pudo_text
                locations = pudo_data.get("locations") or pudo_data.get("results") or []
                if not locations:
                    raise ValueError(f"PUDO search returned no results for {origin_label!r}")
                loc = locations[0]
                dropoff_lat = loc.get("latitude") or loc.get("lat")
                dropoff_lng = loc.get("longitude") or loc.get("lng")
                if not dropoff_lat or not dropoff_lng:
                    raise ValueError("PUDO result missing coordinates")

            # If the device is far from the departure airport (>200 km), Uber won't
            # quote a cross-city ride from the actual device coords. Use a synthetic
            # pickup ~3 km south of the airport so we still get a local price estimate.
            device_far = is_far_from_user(
                dropoff_lat, dropoff_lng, pickup_latitude, pickup_longitude
            )
            if device_far:
                mcp_pickup_lat = dropoff_lat - 0.027   # ≈3 km south
                mcp_pickup_lng = dropoff_lng
                logger.info(
                    "uber graph: device >200 km from airport, using nearby pickup for price estimate | customer_id=%s",
                    state.get("customer_id"),
                )
            else:
                mcp_pickup_lat = pickup_latitude
                mcp_pickup_lng = pickup_longitude

            # Get real-time products list with prices and ETAs
            products_resp = _call("uber_products_list", {
                "pickup": {"latitude": mcp_pickup_lat, "longitude": mcp_pickup_lng},
                "destinations": [{"latitude": dropoff_lat, "longitude": dropoff_lng}],
            })
            products_text = (products_resp.get("result", {}).get("content") or [{}])[0].get("text", "{}")
            products_data = _json.loads(products_text) if isinstance(products_text, str) else products_text

            # Walk tiers → products → fares to find the cheapest UberX-class product
            tiers = (products_data.get("data") or {}).get("products", {}).get("tiers") or []
            best = None
            for tier in tiers:
                for product in tier.get("products") or []:
                    fares = product.get("fares") or []
                    if not fares:
                        continue
                    fare = fares[0]
                    if best is None or fare.get("fareAmountE5", 999_999_999) < best["fareAmountE5"]:
                        best = {
                            "product_name": product.get("displayName", "Uber"),
                            "estimate": fare.get("fare", ""),
                            "currency_code": product.get("currencyCode"),
                            "eta_minutes": product.get("etaInMin"),
                            "fareAmountE5": fare.get("fareAmountE5", 999_999_999),
                        }

            # Flatten all products across tiers into ride_products
            ride_offers = []
            for tier in tiers:
                for product in tier.get("products") or []:
                    fares = product.get("fares") or []
                    if not fares:
                        continue
                    fare = fares[0]
                    ride_offers.append({
                        "display_name": product.get("displayName", "Uber"),
                        "estimate": fare.get("fare", ""),
                        "currency_code": product.get("currencyCode"),
                        "eta_minutes": product.get("etaInMin"),
                        "capacity": fare.get("capacity", 4),
                    })

            if best:
                live_quote = {
                    "product_name": best["product_name"],
                    "estimate": best["estimate"],
                    "currency_code": best["currency_code"],
                    "eta_minutes": best["eta_minutes"],
                }

            logger.info(
                "uber graph mcp success | customer_id=%s | live_quote=%r | dropoff_lat=%s | dropoff_lng=%s",
                state.get("customer_id"),
                live_quote,
                dropoff_lat,
                dropoff_lng,
            )

            # Still build a deeplink so user can tap to open the Uber app
            uber_app_url, web_fallback_url = build_uber_deeplink(
                pickup_latitude=pickup_latitude,
                pickup_longitude=pickup_longitude,
                pickup_nickname=pickup_label,
                dropoff_latitude=dropoff_lat,
                dropoff_longitude=dropoff_lng,
                dropoff_nickname=origin_label,
            )
            mcp_success = True

        except Exception as exc:
            logger.warning(
                "uber graph mcp call failed, falling back to deeplink | customer_id=%s | error=%s",
                state.get("customer_id"),
                exc,
            )
            # If this user has no linked Uber account, surface the connect URL
            if not user_access_token and not uber_mcp_client.is_configured():
                connect_uber_url = f"{get_settings().uber_mcp_url}/login/preview"

    # ── deeplink fallback (original node_build_deeplink logic) ──────────────
    if not mcp_success:
        dropoff_coords = lookup_airport_coordinates(origin_label)
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

    writer({"kind": "tool_completed", "tool": "uber.get_options"})
    logger.info(
        "uber graph get_options complete | customer_id=%s | mcp=%s | has_app_url=%s | offers=%d",
        state.get("customer_id"),
        mcp_success,
        bool(uber_app_url),
        len(ride_offers),
    )

    return {
        "pickup_label": pickup_label,
        "dropoff_label": origin_label,
        "uber_app_url": uber_app_url,
        "deep_link_url": web_fallback_url,
        "airport_options": airport_options,
        "alternative_options": alternative_options,
        "ride_offers": ride_offers,
        "live_quote": live_quote,
        "connect_uber_url": connect_uber_url,
    }


# ── original deeplink node — kept for reference, not wired into the graph ───
def _node_build_deeplink_original(state: UberAgentState, writer: StreamWriter) -> dict:
    """Original deeplink-only node. Superseded by node_get_uber_options."""
    writer({"kind": "tool_started", "tool": "uber.get_deeplink"})
    origin_label = state.get("origin_label")
    origin_type = state.get("origin_type", "airport")
    dropoff_coords = lookup_airport_coordinates(origin_label)
    device_location = state.get("device_location") or {}
    pickup_latitude = device_location.get("latitude")
    pickup_longitude = device_location.get("longitude")
    pickup_label = state.get("pickup_label") or device_location.get("label") or "Current location"
    airport_options: list = []
    alternative_options: list = []
    uber_app_url = None
    web_fallback_url = None
    if dropoff_coords:
        dropoff_lat, dropoff_lng = dropoff_coords
        uber_app_url, web_fallback_url = build_uber_deeplink(
            pickup_latitude=pickup_latitude, pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label, dropoff_latitude=dropoff_lat,
            dropoff_longitude=dropoff_lng, dropoff_nickname=origin_label,
        )
        if origin_type in ("train_station", "ferry") and pickup_latitude and pickup_longitude:
            if is_far_from_user(dropoff_lat, dropoff_lng, pickup_latitude, pickup_longitude):
                for alt_label, (alt_lat, alt_lng) in find_nearest_airports(pickup_latitude, pickup_longitude):
                    alt_app_url, alt_web_url = build_uber_deeplink(
                        pickup_latitude=pickup_latitude, pickup_longitude=pickup_longitude,
                        pickup_nickname=pickup_label, dropoff_latitude=alt_lat,
                        dropoff_longitude=alt_lng, dropoff_nickname=alt_label,
                    )
                    alternative_options.append({"label": alt_label, "uber_app_url": alt_app_url, "deep_link_url": alt_web_url})
    else:
        airport_options = build_airport_deeplink_options(origin_label, pickup_latitude=pickup_latitude, pickup_longitude=pickup_longitude, pickup_nickname=pickup_label)
        if not airport_options:
            uber_app_url, web_fallback_url = build_uber_deeplink(pickup_latitude=pickup_latitude, pickup_longitude=pickup_longitude, pickup_nickname=pickup_label)
    writer({"kind": "tool_completed", "tool": "uber.get_deeplink"})
    return {
        "pickup_label": pickup_label, "dropoff_label": origin_label,
        "uber_app_url": uber_app_url, "deep_link_url": web_fallback_url,
        "airport_options": airport_options, "alternative_options": alternative_options,
    }


def build_uber_graph():
    """Graph: extract -> suggest -> get_uber_options -> END."""
    graph = StateGraph(UberAgentState)

    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("suggest_ride", node_suggest_ride)
    graph.add_node("get_uber_options", node_get_uber_options)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "suggest_ride")
    graph.add_edge("suggest_ride", "get_uber_options")
    graph.add_edge("get_uber_options", END)

    return graph.compile()


uber_graph = build_uber_graph()
