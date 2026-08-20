"""Builds Uber Universal Link URLs for handing a rider off to the Uber app.

No Uber OAuth token or account approval is needed for this -- verified against the real
Uber API on 2026-08-19 (see the `uber-connection-test-log.md` Test 4 in the Uber
integration research). Every other Uber capability (real product/price data, in-app
booking) is currently blocked pending Uber access approval, so this deep link is the
only working way to get a rider into an Uber ride today.

Uses `https://m.uber.com/ul/` -- the docs' `m.uber.com/looking` URL 404s in practice.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlencode

from app.config import get_settings

# Veda's calendar_events.destination is free text (e.g. "Tokyo Narita (NRT)"), never
# coordinates -- there's no geocoding step in this POC. This is a small, hand-maintained
# lookup for the seeded demo destinations only, so the deep link can default pickup to
# the actual arrival airport instead of the device's current location. Real coordinates,
# not placeholders.
KNOWN_DESTINATION_COORDINATES: dict[str, tuple[float, float]] = {
    "Tokyo Narita (NRT)": (35.7720, 140.3929),
    "Marrakesh Menara (RAK)": (31.6069, -8.0363),
    "Paris Gare du Nord": (48.8809, 2.3553),
}


def lookup_destination_coordinates(destination: Optional[str]) -> Optional[tuple[float, float]]:
    if not destination:
        return None
    return KNOWN_DESTINATION_COORDINATES.get(destination)


def _location_params(prefix: str, latitude: Optional[float], longitude: Optional[float], nickname: Optional[str]) -> dict:
    if latitude is None or longitude is None:
        return {}
    params: dict = {f"{prefix}[latitude]": latitude, f"{prefix}[longitude]": longitude}
    if nickname:
        params[f"{prefix}[nickname]"] = nickname
    return params


def build_uber_deeplink(
    *,
    pickup_latitude: Optional[float] = None,
    pickup_longitude: Optional[float] = None,
    pickup_nickname: Optional[str] = None,
    dropoff_latitude: Optional[float] = None,
    dropoff_longitude: Optional[float] = None,
    dropoff_nickname: Optional[str] = None,
) -> str:
    """Build a verified-working Uber Universal Link for `Linking.openURL()`.

    Pickup defaults to the device's current location (`pickup=my_location`) when no
    coordinates are given -- the common case here, since a traveler tapping this has
    just landed and *is* the pickup point. Dropoff is only included when real
    coordinates are known; Veda doesn't currently geocode destination addresses (no
    "hotel" concept in the calendar_events schema), so most calls omit it and let the
    rider set their destination inside the Uber app.
    """
    settings = get_settings()
    params: dict = {"client_id": settings.uber_client_id}

    pickup = _location_params("pickup", pickup_latitude, pickup_longitude, pickup_nickname)
    params.update(pickup or {"pickup": "my_location"})
    params.update(_location_params("dropoff", dropoff_latitude, dropoff_longitude, dropoff_nickname))

    return f"https://m.uber.com/ul/?{urlencode(params)}"
