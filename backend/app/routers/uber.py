import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import get_current_customer
from app.routers._shared import get_owned_calendar_event
from app.tools.uber_deeplink import (
    build_airport_deeplink_options,
    build_uber_deeplink,
    lookup_airport_coordinates,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/uber", tags=["uber"])


class AirportOption(BaseModel):
    label: str
    uber_app_url: str
    deep_link_url: str


class DeeplinkResponse(BaseModel):
    uber_app_url: Optional[str] = None       # uber:// scheme — opens native app, reliably pre-fills fields
    deep_link_url: Optional[str] = None      # https://m.uber.com/ul/ — web fallback if app not installed
    destination_label: Optional[str] = None  # Uber dropoff label (normally the departure airport)
    airport_options: list[AirportOption] = Field(default_factory=list)


class UberAuthUrlResponse(BaseModel):
    available: bool
    auth_url: Optional[str] = None
    message: str


@router.get("/auth-url", response_model=UberAuthUrlResponse)
def get_auth_url(customer: dict = Depends(get_current_customer)) -> UberAuthUrlResponse:
    """Uber OAuth is not available in this implementation (uses deep links only)."""
    logger.info("[uber] auth-url request | customer_id=%s | reason=not_available", customer.get("id"))
    return UberAuthUrlResponse(
        available=False,
        message="Uber integration uses deep links. OAuth not available.",
    )


@router.get("/deeplink", response_model=DeeplinkResponse)
def get_deeplink(
    calendar_event_id: str,
    pickup_latitude: Optional[float] = None,
    pickup_longitude: Optional[float] = None,
    pickup_label: Optional[str] = None,
    customer: dict = Depends(get_current_customer),
) -> DeeplinkResponse:
    """Deep link to hand a rider off to the Uber app for the departure leg of a trip.

    Pickup = rider's live device location when the mobile app provides coordinates,
    otherwise Uber resolves it from `pickup=my_location`.
    Dropoff = the trip's departure airport/station (the calendar event origin).

    This is intentional: when a user taps Uber from a London → Tokyo trip, they need a
    ride from where they are now to Heathrow — not an Uber route from London to Tokyo.

    The dropoff is looked up from the known-coordinates map. If the origin is only a
    city (for example "London"), we return curated airport options like Heathrow and
    Gatwick so the user can choose the right departure airport first.

    If the origin isn't in the map and no city-level airport options are known, Uber
    still opens with current location as the pickup and the rider can choose the
    destination manually in the app.

    No Uber account connection or OAuth is required -- see app/tools/uber_deeplink.py.
    """
    event = get_owned_calendar_event(calendar_event_id, customer["id"])
    origin_label = event.get("origin")
    destination_label = event.get("destination")

    logger.info(
        "[uber] deeplink request | event=%s | origin=%r | destination=%r | pickup_coords_present=%s | pickup_label=%r",
        calendar_event_id,
        origin_label,
        destination_label,
        pickup_latitude is not None and pickup_longitude is not None,
        pickup_label,
    )

    # Dropoff = departure airport / station (where the trip leaves from)
    dropoff_coords = lookup_airport_coordinates(origin_label)
    if dropoff_coords:
        dropoff_lat, dropoff_lng = dropoff_coords
        logger.info("[uber] dropoff_coords for departure %r -> %s", origin_label, dropoff_coords)

        uber_app_url, web_fallback_url = build_uber_deeplink(
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
            dropoff_latitude=dropoff_lat,
            dropoff_longitude=dropoff_lng,
            dropoff_nickname=origin_label,
        )

        response = DeeplinkResponse(
            uber_app_url=uber_app_url,
            deep_link_url=web_fallback_url,
            destination_label=origin_label,
        )
        logger.info("[uber] response sent | uber_app_url=%s", response.uber_app_url)
        return response

    airport_options = [
        AirportOption(**option)
        for option in build_airport_deeplink_options(
            origin_label,
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
        )
    ]
    if airport_options:
        response = DeeplinkResponse(
            destination_label=origin_label,
            airport_options=airport_options,
        )
        logger.info("[uber] response sent with %d airport options", len(airport_options))
        return response

    uber_app_url, web_fallback_url = build_uber_deeplink(
        pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude,
        pickup_nickname=pickup_label,
    )

    response = DeeplinkResponse(
        uber_app_url=uber_app_url,
        deep_link_url=web_fallback_url,
        destination_label=origin_label,
    )
    logger.info("[uber] response sent | uber_app_url=%s", response.uber_app_url)
    return response
