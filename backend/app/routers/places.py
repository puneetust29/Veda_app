"""Places API endpoints: autocomplete, nearby search, and saved places."""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

import httpx
from langchain_anthropic import ChatAnthropic
from fastapi import APIRouter, Depends, HTTPException, Query

from app.agents.uber.schemas import DestinationExtraction
from app.config import get_settings
from app.db.client import get_supabase
from app.deps import get_current_customer
from app.schemas.location import (
    CATEGORY_TO_GOOGLE_TYPE,
    NearbyPlaceResult,
    NearbySearchRequest,
    NearbySearchResponse,
    SavedPlaceRequest,
    SavedPlaceResponse,
)

router = APIRouter(prefix="/places", tags=["places"])

# In-memory rate limiter: customer_id → list of UNIX timestamps for recent requests.
# Resets on process restart; sufficient for single-worker deployment.
# For multi-worker: replace with Redis INCR + EXPIRE.
_rate_limit_window: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_MAX = 10
_RATE_LIMIT_WINDOW_S = 60.0


def _check_rate_limit(customer_id: str) -> None:
    now = time.monotonic()
    window = _rate_limit_window[customer_id]
    _rate_limit_window[customer_id] = [t for t in window if now - t < _RATE_LIMIT_WINDOW_S]
    if len(_rate_limit_window[customer_id]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail={"error": "rate_limit_exceeded", "retry_after_seconds": int(_RATE_LIMIT_WINDOW_S)},
        )
    _rate_limit_window[customer_id].append(now)


@router.get("/autocomplete")
def places_autocomplete(
    input: str = Query(..., description="Input text to autocomplete"),
    latitude: float | None = Query(None, description="User latitude for location bias"),
    longitude: float | None = Query(None, description="User longitude for location bias"),
    _customer: dict = Depends(get_current_customer),
):
    """Return Google Places autocomplete predictions for the given input."""
    settings = get_settings()
    api_key = settings.google_maps_api_key

    if not api_key:
        return {"error": "Google Maps API key not configured", "predictions": []}

    url = "https://places.googleapis.com/v1/places:autocomplete"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
    }
    payload = {
        "input": input,
    }

    if latitude is not None and longitude is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {
                    "latitude": latitude,
                    "longitude": longitude,
                },
                "radius": 50000.0,
            }
        }

    try:
        with httpx.Client() as client:
            response = client.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()

        predictions = []
        if "suggestions" in data:
            for suggestion in data.get("suggestions", []):
                place_prediction = suggestion.get("placePrediction", {})
                predictions.append({
                    "place_id": place_prediction.get("placeId", ""),
                    "description": place_prediction.get("text", {}).get("text", ""),
                })

        print(f"[Places] Got {len(predictions)} predictions for '{input}'")
        return {"predictions": predictions}
    except Exception as e:
        print(f"[Places] Error: {str(e)}")
        return {"error": str(e), "predictions": []}


@router.get("/coordinates")
def get_place_coordinates(
    destination: str = Query(..., description="Destination name to geocode"),
    latitude: float | None = Query(None, description="Optional latitude for location bias"),
    longitude: float | None = Query(None, description="Optional longitude for location bias"),
    _customer: dict = Depends(get_current_customer),
):
    """Return coordinates for a given destination."""
    from app.agents.maps.maps_client import geocode

    settings = get_settings()
    api_key = settings.google_maps_api_key

    if not api_key:
        return {"error": "geocode_failed", "message": "Google Maps API key not configured"}

    try:
        print(f"[Places] geocoding '{destination}' with bias: lat={latitude}, lng={longitude}")
        latlng = geocode(destination, api_key, latitude, longitude)
        print(f"[Places] geocode result: {latlng}")
        if not latlng:
            return {"error": "geocode_failed", "message": f"Could not geocode destination: {destination}"}

        return {
            "latitude": latlng["lat"],
            "longitude": latlng["lng"],
        }
    except Exception as e:
        print(f"[Places] Geocode error: {str(e)}")
        return {"error": "geocode_failed", "message": str(e)}


@router.post("/nearby", response_model=NearbySearchResponse)
def nearby_places(
    req: NearbySearchRequest,
    customer: dict = Depends(get_current_customer),
):
    """Return nearby places for a given category.

    Coordinates are never logged or stored — only used to query Google Places.
    The response contains semantic place names and distances only.
    """
    settings = get_settings()
    api_key = settings.google_maps_api_key
    if not api_key:
        return NearbySearchResponse(places=[], searched_at=datetime.now(timezone.utc).isoformat(), cache_hit=False)

    _check_rate_limit(str(customer.get("id", "unknown")))

    field_mask = (
        "places.id,places.displayName,places.formattedAddress,"
        "places.currentOpeningHours,places.rating,places.location"
    )
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": field_mask,
    }

    if req.keyword:
        # Name/brand search — use Text Search for accurate brand matching
        url = "https://places.googleapis.com/v1/places:searchText"
        payload: dict = {
            "textQuery": req.keyword,
            "maxResultCount": req.max_results,
            "locationBias": {
                "circle": {
                    "center": {"latitude": req.latitude, "longitude": req.longitude},
                    "radius": float(req.radius_metres),
                }
            },
        }
        if req.open_now:
            payload["openNow"] = True
    else:
        # Category search — use Nearby Search
        google_types = CATEGORY_TO_GOOGLE_TYPE.get(req.category, [req.category])
        url = "https://places.googleapis.com/v1/places:searchNearby"
        payload = {
            "includedTypes": google_types,
            "maxResultCount": req.max_results,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": req.latitude, "longitude": req.longitude},
                    "radius": float(req.radius_metres),
                }
            },
        }
        if req.open_now:
            payload["openNow"] = True

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        places: list[NearbyPlaceResult] = []
        for p in data.get("places", []):
            loc = p.get("location", {})
            dist: Optional[float] = None
            if loc.get("latitude") and loc.get("longitude"):
                dist = _haversine_metres(
                    req.latitude, req.longitude,
                    loc["latitude"], loc["longitude"],
                )
            is_open: Optional[bool] = None
            oh = p.get("currentOpeningHours")
            if oh is not None:
                is_open = oh.get("openNow")

            places.append(NearbyPlaceResult(
                place_id=p.get("id", ""),
                name=p.get("displayName", {}).get("text", ""),
                address=p.get("formattedAddress", ""),
                distance_metres=round(dist, 0) if dist is not None else None,
                is_open=is_open,
                rating=p.get("rating"),
                category=req.category,
            ))

        places.sort(key=lambda x: x.distance_metres or 9999)
        print(f"[Places/nearby] {len(places)} results for category={req.category}")
        return NearbySearchResponse(
            places=places,
            searched_at=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Places/nearby] Error: {e}")
        return NearbySearchResponse(places=[], searched_at=datetime.now(timezone.utc).isoformat())


def _haversine_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("/saved", response_model=list[SavedPlaceResponse])
def list_saved_places(customer: dict = Depends(get_current_customer)):
    """Return all saved places for the authenticated customer."""
    supabase = get_supabase()
    customer_id = str(customer["id"])
    try:
        res = supabase.table("saved_places").select("*").eq("customer_id", customer_id).order("added_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print(f"[Places/saved] list error: {e}")
        return []


@router.post("/saved", response_model=SavedPlaceResponse, status_code=201)
def create_saved_place(req: SavedPlaceRequest, customer: dict = Depends(get_current_customer)):
    """Save a new place for the authenticated customer."""
    supabase = get_supabase()
    customer_id = str(customer["id"])
    try:
        row = {
            "customer_id": customer_id,
            "label": req.label,
            "category": req.category,
            "place_id": req.place_id,
            "geofence_id": req.geofence_id,
            "is_favorite": req.is_favorite,
        }
        res = supabase.table("saved_places").insert(row).execute()
        return res.data[0]
    except Exception as e:
        print(f"[Places/saved] create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save place")


@router.delete("/saved/{place_id}", status_code=204)
def delete_saved_place(place_id: str, customer: dict = Depends(get_current_customer)):
    """Delete a saved place (customer-scoped — cannot delete another customer's places)."""
    supabase = get_supabase()
    customer_id = str(customer["id"])
    try:
        supabase.table("saved_places").delete().eq("id", place_id).eq("customer_id", customer_id).execute()
    except Exception as e:
        print(f"[Places/saved] delete error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete place")


@router.post("/extract-destination")
def extract_destination(
    message: str = Query(..., description="User message to extract destination from"),
    _customer: dict = Depends(get_current_customer),
):
    """Extract destination from user message and validate relevance using Claude."""
    settings = get_settings()
    api_key = settings.anthropic_api_key

    if not api_key:
        return {"destination": "", "is_relevant": False, "error": "Anthropic API key not configured"}

    try:
        llm = ChatAnthropic(model=settings.anthropic_model, api_key=api_key)
        structured_llm = llm.with_structured_output(DestinationExtraction)

        prompt = (
            "You are a taxi/Uber booking assistant. Your role is to help users book rides.\n\n"
            "For each user message:\n"
            "1. Determine if it's relevant to booking a taxi/ride (on-topic)\n"
            "2. Extract both pickup location and destination if mentioned\n\n"
            "Patterns to handle:\n"
            "- 'from X to Y' → pickup_location='X', destination='Y'\n"
            "- 'to Y' or 'I want to go to Y' → pickup_location=null (use current location), destination='Y'\n"
            "- Just 'Y' when context is clear → pickup_location=null, destination='Y'\n\n"
            "If the message is off-topic (e.g., asking about weather, restaurants, general questions unrelated to booking), "
            "set is_relevant=false and provide a brief redirect message.\n"
            "If on-topic but no destination found, set destination='' but keep is_relevant=true.\n"
            "If on-topic and destination found, set is_relevant=true and destination to the location name.\n"
            "If pickup location is explicitly mentioned, extract it; otherwise set to null.\n\n"
            f"User message: '{message}'"
        )

        result = structured_llm.invoke(prompt)
        print(f"[Places] Extracted: pickup='{result.pickup_location}' destination='{result.destination}' is_relevant={result.is_relevant}")
        return result.model_dump()
    except Exception as e:
        print(f"[Places] Extraction error: {str(e)}")
        return {
            "destination": "",
            "is_relevant": False,
            "error": str(e),
            "redirect_message": "I can only help with taxi/ride bookings. Please tell me where you'd like to go."
        }
