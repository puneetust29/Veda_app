"""Places API endpoints for autocomplete and place search."""
from __future__ import annotations

import httpx
from anthropic import Anthropic
from fastapi import APIRouter, Depends, Query

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


@router.post("/extract-destination")
def extract_destination(
    message: str = Query(..., description="User message to extract destination from"),
    _customer: dict = Depends(get_current_customer),
):
    """Extract destination from user message using Claude."""
    settings = get_settings()
    api_key = settings.anthropic_api_key

    if not api_key:
        return {"destination": "", "error": "Anthropic API key not configured"}

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=100,
            system="You are a helpful assistant that extracts destination city names from user messages. Extract only the destination city name, nothing else. If no destination is found, respond with 'NONE'.",
            messages=[
                {
                    "role": "user",
                    "content": f"Extract the destination from this message: '{message}'"
                }
            ]
        )

        destination = response.content[0].text.strip()
        if destination.upper() == "NONE":
            destination = ""

        print(f"[Places] Extracted destination: '{destination}' from message: '{message}'")
        return {"destination": destination}
    except Exception as e:
        print(f"[Places] Extraction error: {str(e)}")
        return {"destination": "", "error": str(e)}
