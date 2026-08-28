from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"


def geocode(address: str, api_key: str) -> Optional[dict]:
    """Return {"lat": float, "lng": float} for address, or None on failure."""
    try:
        r = httpx.get(
            _GEOCODE_URL,
            params={"address": address, "key": api_key},
            timeout=8,
        )
        logger.info("    geocode HTTP %s for '%s'", r.status_code, address)
        r.raise_for_status()
        data = r.json()
        status = data.get("status", "UNKNOWN")
        results = data.get("results", [])
        logger.info("    geocode API status=%s  results=%d", status, len(results))
        if not results:
            logger.warning("    geocode no results for: '%s' (status=%s)", address, status)
            return None
        loc = results[0]["geometry"]["location"]
        return {"lat": loc["lat"], "lng": loc["lng"]}
    except Exception as exc:
        logger.warning("    geocode exception for '%s': %s", address, exc)
        return None


def get_route(origin: str, destination: str, api_key: str, mode: str = "DRIVE") -> Optional[dict]:
    """
    Call Routes API (POST) for a given travel mode.
    mode: "DRIVE" | "TRANSIT" | "WALK"
    Returns dict with duration_secs, distance_m, encoded_polyline or None.
    """
    try:
        payload: dict = {
            "origin": {"address": origin},
            "destination": {"address": destination},
            "travelMode": mode,
        }
        if mode == "DRIVE":
            payload["routingPreference"] = "TRAFFIC_AWARE"

        field_mask = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
            "Content-Type": "application/json",
        }
        r = httpx.post(_ROUTES_URL, json=payload, headers=headers, timeout=10)
        logger.info("    routes [%s] HTTP %s for '%s' → '%s'", mode, r.status_code, origin, destination)
        r.raise_for_status()
        data = r.json()
        routes = data.get("routes", [])
        logger.info("    routes [%s] returned %d route(s)", mode, len(routes))
        if not routes:
            return None

        route = routes[0]
        duration_str = route.get("duration", "0s")
        duration_secs = int(duration_str.rstrip("s")) if duration_str else 0
        distance_m = route.get("distanceMeters", 0)
        polyline = route.get("polyline", {}).get("encodedPolyline", "")

        return {
            "duration_secs": duration_secs,
            "distance_m": distance_m,
            "encoded_polyline": polyline,
        }
    except Exception as exc:
        logger.warning("    routes [%s] exception: %s", mode, exc)
        return None


def get_nearby_places(lat: float, lng: float, api_key: str) -> list[dict]:
    """
    Use Places API (New) to fetch nearby hotels, restaurants, and attractions
    at the destination. Returns a list of place dicts.
    """
    all_places: list[dict] = []
    categories = [
        ("lodging", "hotel"),
        ("restaurant", "restaurant"),
        ("tourist_attraction", "attraction"),
    ]

    for place_type, category in categories:
        try:
            payload = {
                "includedTypes": [place_type],
                "maxResultCount": 3,
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lng},
                        "radius": 2000.0,
                    }
                },
            }
            headers = {
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.displayName,places.rating,places.formattedAddress",
                "Content-Type": "application/json",
            }
            r = httpx.post(_PLACES_URL, json=payload, headers=headers, timeout=8)
            logger.info("    places [%s] HTTP %s", place_type, r.status_code)
            if r.status_code != 200:
                logger.warning("    places [%s] error: %s", place_type, r.text[:200])
                continue
            data = r.json()
            places = data.get("places", [])
            logger.info("    places [%s] returned %d results", place_type, len(places))
            for p in places:
                all_places.append({
                    "name": p.get("displayName", {}).get("text", ""),
                    "category": category,
                    "rating": p.get("rating"),
                    "address": p.get("formattedAddress"),
                })
        except Exception as exc:
            logger.warning("    places [%s] exception: %s", place_type, exc)

    return all_places
