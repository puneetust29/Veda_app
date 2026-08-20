import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import get_current_customer
from app.routers._shared import get_owned_calendar_event
from app.tools.uber_deeplink import build_uber_deeplink, lookup_airport_coordinates

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/uber", tags=["uber"])


class DeeplinkResponse(BaseModel):
    uber_app_url: str       # uber:// scheme — opens native app, reliably pre-fills fields
    deep_link_url: str      # https://m.uber.com/ul/ — web fallback if app not installed
    destination_label: Optional[str] = None


@router.get("/deeplink", response_model=DeeplinkResponse)
def get_deeplink(calendar_event_id: str, customer: dict = Depends(get_current_customer)) -> DeeplinkResponse:
    """Deep link to hand a rider off to the Uber app for a ride around this trip.

    Pickup = flight origin airport (e.g. London Heathrow).
    Dropoff = flight destination airport (e.g. Tokyo Narita).

    Both are looked up from the known-coordinates map. If an airport isn't in the map
    its field is omitted and the rider sets it themselves inside the Uber app.

    No Uber account connection or OAuth is required -- see app/tools/uber_deeplink.py.
    """
    event = get_owned_calendar_event(calendar_event_id, customer["id"])
    origin_label = event.get("origin")
    destination_label = event.get("destination")

    logger.info(
        "[uber] deeplink request | event=%s | origin=%r | destination=%r",
        calendar_event_id, origin_label, destination_label,
    )

    # Pickup = departure airport (where the flight leaves from)
    pickup_coords = lookup_airport_coordinates(origin_label)
    pickup_lat, pickup_lng = pickup_coords if pickup_coords else (None, None)
    logger.info("[uber] pickup_coords for %r -> %s", origin_label, pickup_coords)

    # Dropoff = arrival airport (where the flight lands)
    dropoff_coords = lookup_airport_coordinates(destination_label)
    dropoff_lat, dropoff_lng = dropoff_coords if dropoff_coords else (None, None)
    logger.info("[uber] dropoff_coords for %r -> %s", destination_label, dropoff_coords)

    uber_app_url, web_fallback_url = build_uber_deeplink(
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lng,
        pickup_nickname=origin_label,
        dropoff_latitude=dropoff_lat,
        dropoff_longitude=dropoff_lng,
        dropoff_nickname=destination_label,
    )

    response = DeeplinkResponse(
        uber_app_url=uber_app_url,
        deep_link_url=web_fallback_url,
        destination_label=destination_label,
    )
    logger.info("[uber] response sent | uber_app_url=%s", response.uber_app_url)
    return response
