"""Builds Uber Universal Link URLs for handing a rider off to the Uber app.

No Uber OAuth token or account approval is needed for deep links — verified against
the real Uber API on 2026-08-19. `https://m.uber.com/ul/` is the working endpoint;
the docs' `m.uber.com/looking` URL 404s in practice.
"""
from __future__ import annotations

import logging
import math
from typing import Optional, TypedDict
from urllib.parse import quote, urlencode

from app.config import get_settings

logger = logging.getLogger(__name__)

KNOWN_AIRPORT_COORDINATES: dict[str, tuple[float, float]] = {
    # UK / Europe
    "London Heathrow (LHR)": (51.4700, -0.4543),
    "London Gatwick (LGW)": (51.1537, -0.1821),
    "Paris Charles de Gaulle (CDG)": (49.0097, 2.5479),
    "Marrakesh Menara (RAK)": (31.6069, -8.0363),
    "Frankfurt Airport (FRA)": (50.0379, 8.5622),
    "Tokyo Narita (NRT)": (35.7720, 140.3929),
    # US
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
    # IATA short-codes
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

KNOWN_STATION_COORDINATES: dict[str, tuple[float, float]] = {
    "London St Pancras": (51.5322, -0.1235),
    "London St Pancras International": (51.5322, -0.1235),
    "Paris Gare du Nord": (48.8809, 2.3553),
    "Gare du Nord": (48.8809, 2.3553),
    "Amsterdam Centraal": (52.3791, 4.9003),
    "Brussels-Midi": (50.8357, 4.3359),
    "Brussels Midi": (50.8357, 4.3359),
    "London Waterloo": (51.5031, -0.1132),
    "London Victoria": (51.4952, -0.1439),
    "London Paddington": (51.5154, -0.1755),
    "New York Penn Station": (40.7506, -73.9971),
    "Grand Central Terminal": (40.7527, -73.9772),
    "Union Station Washington DC": (38.8973, -77.0063),
    "Union Station Chicago": (41.8789, -87.6400),
    "Los Angeles Union Station": (34.0561, -118.2360),
    "San Francisco Caltrain": (37.7762, -122.3942),
    "Boston South Station": (42.3519, -71.0552),
}

ALL_KNOWN_COORDINATES: dict[str, tuple[float, float]] = {
    **KNOWN_AIRPORT_COORDINATES,
    **KNOWN_STATION_COORDINATES,
}

# City-level origins without a specific terminal selected yet.
CITY_AIRPORT_OPTIONS: dict[str, tuple[str, ...]] = {
    "london": ("London Heathrow (LHR)", "London Gatwick (LGW)"),
    "paris": ("Paris Charles de Gaulle (CDG)",),
}


class AirportDeeplinkOption(TypedDict):
    label: str
    uber_app_url: str
    deep_link_url: str


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def find_nearest_airports(latitude: float, longitude: float, limit: int = 2) -> list[tuple[str, tuple[float, float]]]:
    distances = [
        (label, coords, _haversine_km(latitude, longitude, coords[0], coords[1]))
        for label, coords in KNOWN_AIRPORT_COORDINATES.items()
        if len(label) > 4
    ]
    distances.sort(key=lambda x: x[2])
    return [(label, coords) for label, coords, _ in distances[:limit]]


def is_far_from_user(origin_lat: float, origin_lon: float, user_lat: float, user_lon: float, threshold_km: float = 200.0) -> bool:
    return _haversine_km(user_lat, user_lon, origin_lat, origin_lon) > threshold_km


def _normalize(label: str) -> str:
    return " ".join(label.strip().lower().replace(",", " ").split())


def lookup_airport_coordinates(label: Optional[str]) -> Optional[tuple[float, float]]:
    if not label:
        return None
    coords = ALL_KNOWN_COORDINATES.get(label)
    if coords:
        logger.info("[uber] coords HIT %r -> %s", label, coords)
        return coords
    normalized = _normalize(label)
    for known, known_coords in ALL_KNOWN_COORDINATES.items():
        if _normalize(known) == normalized:
            logger.info("[uber] coords NORMALIZED HIT %r -> %r", label, known)
            return known_coords
    logger.warning("[uber] coords MISS %r", label)
    return None


def lookup_airport_options(label: Optional[str]) -> list[str]:
    if not label:
        return []
    options = list(CITY_AIRPORT_OPTIONS.get(_normalize(label), ()))
    if options:
        logger.info("[uber] city options HIT %r -> %s", label, options)
    else:
        logger.info("[uber] city options MISS %r", label)
    return options


def _location_params(prefix: str, latitude: Optional[float], longitude: Optional[float], nickname: Optional[str]) -> dict:
    if latitude is None or longitude is None:
        return {}
    params: dict = {f"{prefix}[latitude]": latitude, f"{prefix}[longitude]": longitude}
    if nickname:
        params[f"{prefix}[nickname]"] = nickname
    return params


def _build_query(params: dict) -> str:
    # quote_via=quote with safe='[]' keeps bracket characters literal.
    # Default urlencode encodes them as %5B/%5D which Uber silently ignores.
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
    """Return (uber_app_url, web_fallback_url) for the given pickup/dropoff."""
    settings = get_settings()
    params: dict = {"client_id": settings.uber_client_id, "action": "setPickup"}
    pickup = _location_params("pickup", pickup_latitude, pickup_longitude, pickup_nickname)
    params.update(pickup or {"pickup": "my_location"})
    params.update(_location_params("dropoff", dropoff_latitude, dropoff_longitude, dropoff_nickname))
    query = _build_query(params)
    uber_app_url = f"uber://?{query}"
    web_fallback_url = f"https://m.uber.com/ul/?{query}"
    logger.info("[uber] built deeplink pickup=%r dropoff=%r", pickup_nickname or "my_location", dropoff_nickname)
    return uber_app_url, web_fallback_url


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
            continue
        app_url, web_url = build_uber_deeplink(
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_nickname,
            dropoff_latitude=coords[0],
            dropoff_longitude=coords[1],
            dropoff_nickname=airport_label,
        )
        options.append({"label": airport_label, "uber_app_url": app_url, "deep_link_url": web_url})
    return options
