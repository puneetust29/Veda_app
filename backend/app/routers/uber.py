from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import get_current_customer
from app.routers._shared import get_owned_calendar_event
from app.tools.uber_deeplink import build_uber_deeplink

router = APIRouter(prefix="/uber", tags=["uber"])


class DeeplinkResponse(BaseModel):
    deep_link_url: str
    destination_label: Optional[str] = None


@router.get("/deeplink", response_model=DeeplinkResponse)
def get_deeplink(calendar_event_id: str, customer: dict = Depends(get_current_customer)) -> DeeplinkResponse:
    """Deep link to hand a rider off to the Uber app for a ride around this trip.

    No Uber account connection or OAuth is required -- see
    `app/tools/uber_deeplink.py`. Pickup defaults to the device's current location;
    dropoff is left for the rider to set inside the Uber app, since Veda doesn't have
    real coordinates for the trip's destination (only a free-text airport/city name).
    """
    event = get_owned_calendar_event(calendar_event_id, customer["id"])
    destination_label = event.get("destination")

    return DeeplinkResponse(
        deep_link_url=build_uber_deeplink(),
        destination_label=destination_label,
    )
