"""Places API endpoints for autocomplete and place search."""
from __future__ import annotations

import httpx
from langchain_anthropic import ChatAnthropic
from fastapi import APIRouter, Depends, Query

from app.agents.uber.schemas import DestinationExtraction
from app.config import get_settings
from app.deps import get_current_customer

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/autocomplete")
def places_autocomplete(
    input: str = Query(..., description="Input text to autocomplete"),
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
    _customer: dict = Depends(get_current_customer),
):
    """Return coordinates for a given destination."""
    from app.agents.maps.maps_client import geocode

    settings = get_settings()
    api_key = settings.google_maps_api_key

    if not api_key:
        return {"error": "geocode_failed", "message": "Google Maps API key not configured"}

    try:
        latlng = geocode(destination, api_key)
        if not latlng:
            return {"error": "geocode_failed", "message": f"Could not geocode destination: {destination}"}

        return {
            "latitude": latlng["lat"],
            "longitude": latlng["lng"],
        }
    except Exception as e:
        print(f"[Places] Geocode error: {str(e)}")
        return {"error": "geocode_failed", "message": str(e)}


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
        llm = ChatAnthropic(model=settings.anthropic_model, api_key=api_key, temperature=0)
        structured_llm = llm.with_structured_output(DestinationExtraction)

        prompt = (
            "You are a taxi/Uber booking assistant. Your role is to help users book rides to specific destinations.\n\n"
            "For each user message:\n"
            "1. Determine if it's relevant to booking a taxi/ride (on-topic)\n"
            "2. Extract the destination city if mentioned\n\n"
            "If the message is off-topic (e.g., asking about weather, restaurants, general questions unrelated to booking), "
            "set is_relevant=false and provide a brief redirect message like: "
            "'I can only help with taxi bookings. Please tell me where you'd like to go.'\n"
            "If on-topic but no destination found, set destination='' but keep is_relevant=true.\n"
            "If on-topic and destination found, set is_relevant=true and destination to the city name, redirect_message=null.\n\n"
            f"User message: '{message}'"
        )

        result = structured_llm.invoke(prompt)
        print(f"[Places] Extracted: destination='{result.destination}' is_relevant={result.is_relevant}")
        return result.model_dump()
    except Exception as e:
        print(f"[Places] Extraction error: {str(e)}")
        return {
            "destination": "",
            "is_relevant": False,
            "error": str(e),
            "redirect_message": "I can only help with taxi/ride bookings. Please tell me where you'd like to go."
        }
