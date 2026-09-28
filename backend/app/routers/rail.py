"""Rail ticket search and booking via All Aboard GraphQL API.

Exposes the search → offers flow today. Booking endpoints (create_booking,
create_order, finalize_order) are wired up but not yet called from mobile —
they'll be enabled once the Wallet mutation flow is tested against the test env.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.config import get_settings
from app.integrations.allaboard import AllAboardClient, AllAboardError

router = APIRouter(prefix="/rail", tags=["rail"])


def _client() -> AllAboardClient:
    if not get_settings().allaboard_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Rail booking not configured (ALLABOARD_API_KEY)",
        )
    return AllAboardClient()


def _handle_error(e: AllAboardError) -> None:
    raise HTTPException(status_code=e.status_code, detail=e.message) from e


# ------------------------------------------------------------------
# Locations
# ------------------------------------------------------------------

@router.get("/locations")
def search_locations(q: str = Query(..., min_length=2)):
    """Search for stations by name. Returns uid, name, countryCode, isMeta."""
    try:
        with _client() as c:
            return c.search_locations(q)
    except AllAboardError as e:
        _handle_error(e)


# ------------------------------------------------------------------
# Journey search
# ------------------------------------------------------------------

@router.get("/journeys")
def search_journeys(
    origin: str = Query(..., description="Origin station uid"),
    destination: str = Query(..., description="Destination station uid"),
    date: str = Query(..., description="Travel date YYYY-MM-DD"),
    passengers: int = Query(1, ge=1, le=9),
    currency: str = Query("GBP"),
):
    """Search journeys between two stations. Returns journey IDs and segment info."""
    try:
        with _client() as c:
            pax = [{"type": "ADULT"}] * passengers
            return c.search_journeys(origin, destination, date, pax, currency)
    except AllAboardError as e:
        _handle_error(e)


# ------------------------------------------------------------------
# Offers (pricing)
# ------------------------------------------------------------------

@router.get("/journeys/{journey_id}/offers")
def get_journey_offers(
    journey_id: str,
    passengers: int = Query(1, ge=1, le=9),
    currency: str = Query("GBP"),
):
    """Get priced fare offers for a specific journey."""
    try:
        with _client() as c:
            pax = [{"type": "ADULT"}] * passengers
            return c.get_journey_offer(journey_id, pax, currency)
    except AllAboardError as e:
        _handle_error(e)


# ------------------------------------------------------------------
# Booking (Wallet flow)
# ------------------------------------------------------------------

class BookingRequest(BaseModel):
    offer_ids: list[str]
    currency: str = "GBP"


class PassengerDetailsRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    tel: str


@router.put("/bookings/{booking_id}/passengers")
def update_booking_passengers(booking_id: str, body: PassengerDetailsRequest):
    """Add passenger details to a booking (required before createOrder)."""
    try:
        with _client() as c:
            # All Aboard requires an id per passenger; get it from the booking first
            passengers = [
                {
                    "id": "1",
                    "firstName": body.first_name,
                    "lastName": body.last_name,
                    "email": body.email,
                    "tel": body.tel,
                    "isContactPerson": True,
                }
            ]
            return c.update_booking(booking_id, passengers)
    except AllAboardError as e:
        _handle_error(e)


@router.post("/bookings")
def create_booking(body: BookingRequest):
    """Reserve offers. Returns a booking hold — not yet charged."""
    try:
        with _client() as c:
            return c.create_booking(body.offer_ids, body.currency)
    except AllAboardError as e:
        _handle_error(e)


@router.post("/bookings/{booking_id}/order")
def create_order(booking_id: str):
    """Convert a booking hold to a confirmed order."""
    try:
        with _client() as c:
            return c.create_order(booking_id)
    except AllAboardError as e:
        _handle_error(e)


@router.post("/orders/{order_id}/finalize")
def finalize_order(order_id: str):
    """Finalize the order — deducts Wallet balance and issues the ticket."""
    try:
        with _client() as c:
            return c.finalize_order(order_id)
    except AllAboardError as e:
        _handle_error(e)
