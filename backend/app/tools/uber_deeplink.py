"""Builds Uber Universal Link URLs for handing a rider off to the Uber app.

No Uber OAuth token or account approval is needed for this -- verified against the real
Uber API on 2026-08-19 (see the `uber-connection-test-log.md` Test 4 in the Uber
integration research). Every other Uber capability (real product/price data, in-app
booking) is currently blocked pending Uber access approval, so this deep link is the
only working way to get a rider into an Uber ride today.

Uses `https://m.uber.com/ul/` -- the docs' `m.uber.com/looking` URL 404s in practice.
"""
from __future__ import annotations

import logging
from typing import Optional
from urllib.parse import quote, urlencode

from app.config import get_settings

logger = logging.getLogger(__name__)

# Veda's calendar_events.origin/destination are free text (e.g. "London Heathrow (LHR)"),
# never coordinates -- there's no geocoding step in this POC. This is a small,
# hand-maintained lookup covering the seeded demo airports + common IATA codes that
# appear in auto-created test accounts. Real coordinates, not placeholders.
KNOWN_AIRPORT_COORDINATES: dict[str, tuple[float, float]] = {
    # Seeded demo origins
    "London Heathrow (LHR)": (51.4700, -0.4543),
    "London Gatwick (LGW)": (51.1537, -0.1821),
    "London St Pancras": (51.5320, -0.1230),
    # Seeded demo destinations (kept for reverse-trip lookups)
    "Tokyo Narita (NRT)": (35.7720, 140.3929),
    "Marrakesh Menara (RAK)": (31.6069, -8.0363),
    "Paris Gare du Nord": (48.8809, 2.3553),
    # Common IATA short-codes that appear in auto-created test accounts
    "LHR": (51.4700, -0.4543),
    "LGW": (51.1537, -0.1821),
    "NRT": (35.7720, 140.3929),
    "JFK": (40.6413, -73.7781),
    "SEA": (47.4502, -122.3088),
    "Seattle-Tacoma International Airport (SEA)": (47.4502, -122.3088),
}


def lookup_airport_coordinates(label: Optional[str]) -> Optional[tuple[float, float]]:
    if not label:
        logger.debug("[uber] lookup_airport_coordinates called with empty label")
        return None
    coords = KNOWN_AIRPORT_COORDINATES.get(label)
    if coords:
        logger.info("[uber] coords HIT  %r -> %s", label, coords)
    else:
        logger.warning("[uber] coords MISS %r -> not in KNOWN_AIRPORT_COORDINATES", label)
    return coords


def _location_params(prefix: str, latitude: Optional[float], longitude: Optional[float], nickname: Optional[str]) -> dict:
    if latitude is None or longitude is None:
        return {}
    params: dict = {f"{prefix}[latitude]": latitude, f"{prefix}[longitude]": longitude}
    if nickname:
        params[f"{prefix}[nickname]"] = nickname
    return params


def _build_query(params: dict) -> str:
    # quote_via=quote with safe='[]' keeps bracket characters literal so Uber's app
    # recognises pickup[latitude] / dropoff[latitude] -- the default urlencode encodes
    # them as %5B/%5D which the Uber app silently ignores, leaving fields blank.
    return urlencode(params, quote_via=quote, safe="[]")


def build_uber_deeplink(
    *,
    pickup_latitude: Optional[float] = None,
    pickup_longitude: Optional[float] = None,
    pickup_nickname: Optional[str] = None,
    dropoff_latitude: Optional[float] = None,
    dropoff_longitude: Optional[float] = None,
    dropoff_nickname: Optional[str] = None,
) -> tuple[str, str]:
    """Build Uber deep link URLs for `Linking.openURL()`.

    Returns (uber_app_url, web_fallback_url):
    - uber_app_url:      uber:// custom scheme -- opens the native Uber app directly
                        and reliably pre-fills pickup/dropoff fields.
    - web_fallback_url: https://m.uber.com/ul/ -- universal link used when the Uber
                        app is not installed (falls through to the App Store / web).

    Both URLs include action=setPickup which is required by Uber's deep link spec
    to actually pre-fill the pickup and dropoff fields in the app.

    Pickup defaults to the device's current location (`pickup=my_location`) when no
    coordinates are given.
    """
    settings = get_settings()

    logger.info(
        "[uber] build_deeplink pickup=(%.4f, %.4f, %r) dropoff=(%.4f, %.4f, %r)",
        pickup_latitude or 0, pickup_longitude or 0, pickup_nickname,
        dropoff_latitude or 0, dropoff_longitude or 0, dropoff_nickname,
    )

    # action=setPickup is required by Uber's spec to pre-fill fields in the native app.
    params: dict = {"client_id": settings.uber_client_id, "action": "setPickup"}
    pickup = _location_params("pickup", pickup_latitude, pickup_longitude, pickup_nickname)
    params.update(pickup or {"pickup": "my_location"})
    params.update(_location_params("dropoff", dropoff_latitude, dropoff_longitude, dropoff_nickname))

    query = _build_query(params)
    uber_app_url = f"uber://?{query}"
    web_fallback_url = f"https://m.uber.com/ul/?{query}"

    logger.info("[uber] uber_app_url:      %s", uber_app_url)
    logger.info("[uber] web_fallback_url:  %s", web_fallback_url)
    return uber_app_url, web_fallback_url
