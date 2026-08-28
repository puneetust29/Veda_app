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
        logger.info("    routes HTTP %s for '%s' → '%s'", r.status_code, origin, destination)
        r.raise_for_status()
        data = r.json()
        routes = data.get("routes", [])
        logger.info("    routes API returned %d route(s)", len(routes))
        if not routes:
            logger.warning(
                "    routes: 0 results — likely no drive path exists (international/ocean route)"
            )
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
        logger.warning("    routes exception for '%s' → '%s': %s", origin, destination, exc)
        return None
