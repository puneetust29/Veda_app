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
from typing import Optional, TypedDict
from urllib.parse import quote, urlencode

from app.config import get_settings

logger = logging.getLogger(__name__)

# Veda's calendar_events.origin/destination are free text (e.g. "London Heathrow (LHR)"),
# never coordinates -- there's no geocoding step in this POC. This is a small,
# hand-maintained lookup covering the seeded demo airports + common IATA codes that
# appear in auto-created test accounts. Real coordinates, not placeholders.
KNOWN_AIRPORT_COORDINATES: dict[str, tuple[float, float]] = {
    # --- UK / Europe departure airports ---
    "London Heathrow (LHR)": (51.4700, -0.4543),
    "London Gatwick (LGW)": (51.1537, -0.1821),
    # NOTE: "London St Pancras" and "Paris Gare du Nord" are intentionally NOT
    # listed here -- they are train stations, not airports. The LLM's suggest_ride
    # node should return should_suggest=False for those trips, so the deeplink node
    # is never reached. If coordinates were listed here, we'd build a deeplink to a
    # train station, which is wrong.
    "Paris Charles de Gaulle (CDG)": (49.0097, 2.5479),
    "Marrakesh Menara (RAK)": (31.6069, -8.0363),
    "Frankfurt Airport (FRA)": (50.0379, 8.5622),
    "Tokyo Narita (NRT)": (35.7720, 140.3929),
    # --- US departure airports (seeded US test data) ---
    "Seattle-Tacoma International Airport (SEA)": (47.4502, -122.3088),
    "San Francisco International Airport (SFO)":  (37.6213, -122.3790),
    "Los Angeles International Airport (LAX)":    (33.9425, -118.4081),
    "John F. Kennedy International Airport (JFK)": (40.6413, -73.7781),
    "O'Hare International Airport (ORD)":         (41.9742, -87.9073),
    "Miami International Airport (MIA)":          (25.7959, -80.2870),
    "Dallas/Fort Worth International Airport (DFW)": (32.8998, -97.0403),
    "Denver International Airport (DEN)":         (39.8561, -104.6737),
    "Hartsfield-Jackson Atlanta Airport (ATL)":   (33.6407, -84.4277),
    "Boston Logan International Airport (BOS)":   (42.3656, -71.0096),
    # --- IATA short-codes (common alternative format in calendar events) ---
    "LHR": (51.4700, -0.4543),
    "LGW": (51.1537, -0.1821),
    "CDG": (49.0097, 2.5479),
    "NRT": (35.7720, 140.3929),
    "RAK": (31.6069, -8.0363),
    "FRA": (50.0379, 8.5622),
    "SEA": (47.4502, -122.3088),
    "SFO": (37.6213, -122.3790),
    "LAX": (33.9425, -118.4081),
    "JFK": (40.6413, -73.7781),
    "ORD": (41.9742, -87.9073),
    "MIA": (25.7959, -80.2870),
    "DFW": (32.8998, -97.0403),
    "DEN": (39.8561, -104.6737),
    "ATL": (33.6407, -84.4277),
    "BOS": (42.3656, -71.0096),
}

# City-level trip origins sometimes arrive without a specific airport selected yet
# (e.g. "London" instead of "London Heathrow (LHR)"). In those cases we offer a
# small curated list of likely departure airports so the user can choose.
CITY_AIRPORT_OPTIONS: dict[str, tuple[str, ...]] = {
    "london": ("London Heathrow (LHR)", "London Gatwick (LGW)"),
    "paris": ("Paris Charles de Gaulle (CDG)",),
}


class AirportDeeplinkOption(TypedDict):
    label: str
    uber_app_url: str
    deep_link_url: str


def _normalize_location_label(label: str) -> str:
    return " ".join(label.strip().lower().replace(",", " ").split())


def lookup_airport_coordinates(label: Optional[str]) -> Optional[tuple[float, float]]:
    if not label:
        logger.debug("[uber] lookup_airport_coordinates called with empty label")
        return None

    # Exact match first — fast path for the common case.
    coords = KNOWN_AIRPORT_COORDINATES.get(label)
    if coords:
        logger.info("[uber] coords HIT  %r -> %s", label, coords)
    return coords

    # Normalised fallback: case-insensitive, strips extra whitespace and commas.
    # Handles variations like "london heathrow (lhr)" or "London Heathrow, LHR".
    normalized_label = _normalize_location_label(label)
    for known_label, known_coords in KNOWN_AIRPORT_COORDINATES.items():
        if _normalize_location_label(known_label) == normalized_label:
            logger.info("[uber] coords NORMALIZED HIT %r -> %r -> %s", label, known_label, known_coords)
            return known_coords

    logger.warning("[uber] coords MISS %r -> not in KNOWN_AIRPORT_COORDINATES", label)
    return None


def _pickup_log_label(pickup_nickname: Optional[str], pickup_latitude: Optional[float], pickup_longitude: Optional[float]) -> str:
    if pickup_nickname:
        return pickup_nickname
    if pickup_latitude is not None and pickup_longitude is not None:
        return f"{pickup_latitude:.4f},{pickup_longitude:.4f}"
    return "my_location"


def _dropoff_log_label(dropoff_nickname: Optional[str], dropoff_latitude: Optional[float], dropoff_longitude: Optional[float]) -> str:
    if dropoff_nickname:
        return dropoff_nickname
    if dropoff_latitude is not None and dropoff_longitude is not None:
        return f"{dropoff_latitude:.4f},{dropoff_longitude:.4f}"
    return "none"


def lookup_airport_options(label: Optional[str]) -> list[str]:
    if not label:
        logger.debug("[uber] lookup_airport_options called with empty label")
        return []

    options = list(CITY_AIRPORT_OPTIONS.get(_normalize_location_label(label), ()))
    if options:
        logger.info("[uber] airport options HIT  %r -> %s", label, options)
    else:
        logger.info("[uber] airport options MISS %r", label)
    return options


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


def build_airport_deeplink_options(
    label: Optional[str],
    *,
    pickup_latitude: Optional[float] = None,
    pickup_longitude: Optional[float] = None,
    pickup_nickname: Optional[str] = None,
) -> list[AirportDeeplinkOption]:
    options: list[AirportDeeplinkOption] = []
    for airport_label in lookup_airport_options(label):
        coords = KNOWN_AIRPORT_COORDINATES.get(airport_label)
        if not coords:
            logger.warning("[uber] missing coords for airport option %r", airport_label)
            continue
        dropoff_latitude, dropoff_longitude = coords
        uber_app_url, deep_link_url = build_uber_deeplink(
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_nickname,
            dropoff_latitude=dropoff_latitude,
            dropoff_longitude=dropoff_longitude,
            dropoff_nickname=airport_label,
        )
        logger.info(
            "[uber] airport option deeplink built pickup=%s dropoff=%s",
            _pickup_log_label(pickup_nickname, pickup_latitude, pickup_longitude),
            _dropoff_log_label(airport_label, dropoff_latitude, dropoff_longitude),
        )
        options.append({
            "label": airport_label,
            "uber_app_url": uber_app_url,
            "deep_link_url": deep_link_url,
        })
    return options


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
