"""Dev-only endpoints for the mobile integrations catalog — lightweight wrappers
around the underlying agent clients so each integration can be tested in isolation
without a full calendar event / streaming session."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.agents.maps.maps_client import geocode, get_nearby_places, get_route
from app.agents.transport.tfl_client import LONDON_AIRPORTS, get_line_status, get_journey, CENTRAL_LONDON
from app.config import get_settings
from app.deps import get_current_customer
from app.integrations.deliveroo_auth import get_auth_headers, get_deliveroo_token, token_info


router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/maps/route")
def dev_maps_route(
    origin: str = Query(..., description="Origin place name"),
    destination: str = Query(..., description="Destination place name"),
    _customer: dict = Depends(get_current_customer),
):
    """Geocode origin + destination and return routes for DRIVE, TRANSIT, WALK."""
    settings = get_settings()
    api_key = settings.google_maps_api_key

    origin_latlng = geocode(origin, api_key)
    destination_latlng = geocode(destination, api_key)

    routes = []
    for mode in ("DRIVE", "TRANSIT", "WALK"):
        try:
            r = get_route(origin, destination, api_key, mode=mode)
            if r:
                routes.append({
                    "mode": mode,
                    "duration_mins": round(r["duration_secs"] / 60) if r.get("duration_secs") else None,
                    "distance_km": round(r["distance_m"] / 1000, 1) if r.get("distance_m") else None,
                    "encoded_polyline": r.get("encoded_polyline"),
                })
        except Exception:
            pass

    nearby = []
    if destination_latlng:
        try:
            nearby = [
                {
                    "name": p["name"],
                    "category": p["category"],
                    "rating": p["rating"],
                    "address": p["address"],
                }
                for p in get_nearby_places(destination_latlng["lat"], destination_latlng["lng"], api_key)
            ]
        except Exception:
            pass

    drive = next((r for r in routes if r["mode"] == "DRIVE"), None)
    return {
        "origin": origin,
        "destination": destination,
        "origin_latlng": origin_latlng,
        "destination_latlng": destination_latlng,
        "geocode_ok": origin_latlng is not None and destination_latlng is not None,
        "route_ok": len(routes) > 0,
        "distance_km": drive["distance_km"] if drive else None,
        "duration_mins": drive["duration_mins"] if drive else None,
        "encoded_polyline": drive["encoded_polyline"] if drive else None,
        "summary": f"{origin} → {destination}",
        "routes": routes,
        "nearby_places": nearby,
    }


@router.get("/transport/status")
def dev_transport_status(
    airport: str = Query("heathrow", description="Airport keyword e.g. heathrow, gatwick, stansted"),
    _customer: dict = Depends(get_current_customer),
):
    """Return TfL line statuses and a sample journey from the given airport to central London."""
    line_statuses_raw = get_line_status()
    line_statuses = [
        {
            "line": ls.get("name"),
            "status": (ls.get("lineStatuses") or [{}])[0].get("statusSeverityDescription", "Unknown"),
            "severity": (ls.get("lineStatuses") or [{}])[0].get("statusSeverity", 10),
        }
        for ls in line_statuses_raw
    ]

    airport_info = LONDON_AIRPORTS.get(airport.lower().strip())
    journey = None
    if airport_info:
        try:
            raw_journeys = get_journey(airport_info["journey_loc"], CENTRAL_LONDON)
            if raw_journeys:
                j = raw_journeys[0]
                legs = j.get("legs", [])
                journey = {
                    "airport": airport_info["name"],
                    "duration_mins": j.get("duration"),
                    "legs": [
                        {
                            "mode": leg.get("mode", {}).get("name", ""),
                            "instruction": leg.get("instruction", {}).get("summary", ""),
                            "duration_mins": leg.get("duration"),
                        }
                        for leg in legs
                    ],
                }
        except Exception:
            pass

    return {
        "line_statuses": line_statuses,
        "journey": journey,
    }


@router.get("/uber/deeplink")
def dev_uber_deeplink(
    destination: str = Query("London Heathrow Airport", description="Destination name"),
    _customer: dict = Depends(get_current_customer),
):
    """Return an Uber deeplink for a ride to the given destination."""
    from app.agents.maps.maps_client import geocode
    from app.tools.uber_deeplink import build_uber_deeplink

    settings = get_settings()
    api_key = settings.google_maps_api_key

    latlng = geocode(destination, api_key)
    if not latlng:
        return {"error": f"Could not geocode destination: {destination}"}

    app_url, web_url = build_uber_deeplink(
        dropoff_latitude=latlng["lat"],
        dropoff_longitude=latlng["lng"],
        dropoff_nickname=destination,
    )

    return {
        "destination": destination,
        "dropoff_latlng": latlng,
        "uber_app_url": app_url,
        "deep_link_url": web_url,
    }


# ---------------------------------------------------------------------------
# Deliveroo
# ---------------------------------------------------------------------------

@router.get("/deliveroo/auth")
def dev_deliveroo_auth(_customer: dict = Depends(get_current_customer)):
    """Test Deliveroo OAuth2 credentials and return token metadata."""
    settings = get_settings()
    if not settings.deliveroo_configured:
        raise HTTPException(503, "Deliveroo credentials not configured")
    try:
        get_deliveroo_token()
        info = token_info()
        return {
            "ok": True,
            "env": settings.deliveroo_env,
            "client_id": settings.deliveroo_client_id,
            **info,
        }
    except Exception as e:
        raise HTTPException(502, f"Deliveroo auth failed: {e}") from e


@router.get("/deliveroo/scenarios")
def dev_deliveroo_scenarios(
    api: str = Query("picking", description="API name: pos_orders | signature | picking | order_status_updates"),
    _customer: dict = Depends(get_current_customer),
):
    """List available sandbox test scenarios from the Deliveroo Developer Portal."""
    settings = get_settings()
    if not settings.deliveroo_configured:
        raise HTTPException(503, "Deliveroo credentials not configured")
    try:
        resp = httpx.get(
            f"{settings.deliveroo_api_base_url}/dev-portal/scenarios",
            params={"api": api},
            headers=get_auth_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text) from e
    except Exception as e:
        raise HTTPException(502, str(e)) from e


@router.post("/deliveroo/scenarios/{scenario_id}/run")
def dev_deliveroo_trigger_scenario(
    scenario_id: str = Path(..., description="Scenario ID from /dev/deliveroo/scenarios"),
    _customer: dict = Depends(get_current_customer),
):
    """Trigger a Deliveroo sandbox scenario run."""
    settings = get_settings()
    if not settings.deliveroo_configured:
        raise HTTPException(503, "Deliveroo credentials not configured")
    try:
        resp = httpx.post(
            f"{settings.deliveroo_api_base_url}/dev-portal/scenarios/{scenario_id}/runs",
            json={},
            headers={**get_auth_headers(), "Content-Type": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, e.response.text) from e
    except Exception as e:
        raise HTTPException(502, str(e)) from e
