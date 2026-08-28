from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def geocode(address: str, api_key: str) -> Optional[dict]:
    """Return {"lat": float, "lng": float} for address, or None on failure."""
    try:
        r = httpx.get(
            _GEOCODE_URL,
            params={"address": address, "key": api_key},
            timeout=8,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            logger.warning("Geocode returned no results for: %s", address)
            return None
        loc = results[0]["geometry"]["location"]
        logger.info("Geocoded '%s' → lat=%.4f lng=%.4f", address, loc["lat"], loc["lng"])
        return {"lat": loc["lat"], "lng": loc["lng"]}
    except Exception as exc:
        logger.warning("Geocode failed for '%s': %s", address, exc)
        return None


def get_route(origin: str, destination: str, api_key: str) -> Optional[dict]:
    """
    Call Routes API (POST). Returns a dict with:
      duration_secs, distance_m, encoded_polyline
    or None on failure.
    """
    try:
        payload = {
            "origin": {"address": origin},
            "destination": {"address": destination},
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE",
        }
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": (
                "routes.duration,routes.distanceMeters,"
                "routes.polyline.encodedPolyline"
            ),
            "Content-Type": "application/json",
        }
        r = httpx.post(_ROUTES_URL, json=payload, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        routes = data.get("routes", [])
        if not routes:
            logger.warning("Routes API returned no routes for %s → %s", origin, destination)
            return None

        route = routes[0]
        duration_str = route.get("duration", "0s")
        duration_secs = int(duration_str.rstrip("s")) if duration_str else 0
        distance_m = route.get("distanceMeters", 0)
        polyline = route.get("polyline", {}).get("encodedPolyline", "")

        logger.info(
            "Route %s → %s: %dm, %ds, polyline len=%d",
            origin, destination, distance_m, duration_secs, len(polyline),
        )
        return {
            "duration_secs": duration_secs,
            "distance_m": distance_m,
            "encoded_polyline": polyline,
        }
    except Exception as exc:
        logger.warning("Routes API failed for %s → %s: %s", origin, destination, exc)
        return None
