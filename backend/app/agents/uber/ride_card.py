"""Builds an Uber ride card straight from pickup/dropoff text -- no flight/calendar
context needed. Shared between master_agent's handoff path and the
`/places/uber-ride-card` endpoint (the fast, keyword-routed path the mobile client
uses instead of going through chat at all)."""
from __future__ import annotations

from typing import Optional

from app.agents.maps.maps_client import geocode, reverse_geocode
from app.agents.uber.schemas import UberRideSuggestionCard
from app.config import get_settings
from app.tools.uber_deeplink import build_uber_deeplink


def build_ride_card(
    pickup_label: Optional[str],
    dropoff_label: str,
    device_location: Optional[dict] = None,
) -> Optional[dict]:
    """Returns a UberRideSuggestionCard dict, or None if `dropoff_label` couldn't be
    geocoded to a real location."""
    settings = get_settings()
    api_key = settings.google_maps_api_key

    dropoff_coords = geocode(dropoff_label, api_key) if api_key else None
    if not dropoff_coords:
        return None

    device_location = device_location or {}
    pickup_latitude = device_location.get("latitude")
    pickup_longitude = device_location.get("longitude")
    resolved_pickup_label = pickup_label or device_location.get("label") or "Current location"

    if pickup_label:
        pickup_coords = geocode(pickup_label, api_key) if api_key else None
        if pickup_coords:
            pickup_latitude, pickup_longitude = pickup_coords["lat"], pickup_coords["lng"]
    elif pickup_latitude and pickup_longitude and api_key:
        label = reverse_geocode(pickup_latitude, pickup_longitude, api_key)
        if label:
            resolved_pickup_label = label

    uber_app_url, deep_link_url = build_uber_deeplink(
        pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude,
        pickup_nickname=resolved_pickup_label,
        dropoff_latitude=dropoff_coords["lat"],
        dropoff_longitude=dropoff_coords["lng"],
        dropoff_nickname=dropoff_label,
    )

    return UberRideSuggestionCard(
        origin_type="custom",
        reasoning="Pickup/dropoff taken from your message.",
        suggested_message=f"Ride from {resolved_pickup_label} to {dropoff_label}",
        pickup_label=resolved_pickup_label,
        dropoff_label=dropoff_label,
        uber_app_url=uber_app_url,
        deep_link_url=deep_link_url,
    ).model_dump()
