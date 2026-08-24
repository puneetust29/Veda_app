"""Hotel booking detection logic."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.client import get_supabase
from .schemas import HotelBooking


# Sample hotels by destination code
SAMPLE_HOTELS = {
    "LON": [
        {"name": "The Ritz-Carlton London", "rating": 5.0, "price": 400, "location": "London"},
        {"name": "Claridge's", "rating": 5.0, "price": 350, "location": "London"},
        {"name": "Four Seasons Park Lane", "rating": 5.0, "price": 380, "location": "London"},
    ],
    "NYC": [
        {"name": "The Plaza Hotel", "rating": 5.0, "price": 450, "location": "New York"},
        {"name": "The St. Regis New York", "rating": 5.0, "price": 420, "location": "New York"},
        {"name": "Peninsula New York", "rating": 5.0, "price": 400, "location": "New York"},
    ],
    "DUB": [
        {"name": "The Merrion Hotel", "rating": 5.0, "price": 300, "location": "Dublin"},
        {"name": "Shelbourne Hotel", "rating": 4.5, "price": 250, "location": "Dublin"},
        {"name": "Dylan Hotel", "rating": 4.5, "price": 280, "location": "Dublin"},
    ],
    "PAR": [
        {"name": "Hotel Plaza Athénée", "rating": 5.0, "price": 500, "location": "Paris"},
        {"name": "Le Bristol Paris", "rating": 5.0, "price": 480, "location": "Paris"},
        {"name": "Four Seasons Hotel George V", "rating": 5.0, "price": 460, "location": "Paris"},
    ],
}


def detect_hotel_for_flight(
    customer_id: str,
    destination: Optional[str],
    arrival_date: datetime,
) -> HotelBooking:
    """Detect if a hotel booking exists for a flight's destination.

    Checks ONLY calendar_events where event_type='hotel' and start_datetime
    matches flight arrival (±1 day). No fallback to calendar/email keyword detection.

    Args:
        customer_id: Customer UUID
        destination: Airport code or city name
        arrival_date: Flight arrival datetime

    Returns:
        HotelBooking with found=True if explicit booking found, else suggestions
    """
    if not destination:
        return HotelBooking(
            found=False,
            suggestion="No destination provided",
            recommendations=[],
        )

    supabase = get_supabase()

    # Check calendar_events for explicit hotel bookings (event_type='hotel' only)
    start_window = (arrival_date - timedelta(days=1)).replace(hour=0, minute=0, second=0)
    end_window = (arrival_date + timedelta(days=1)).replace(hour=23, minute=59, second=59)

    try:
        result = (
            supabase.table("calendar_events")
            .select("*")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "hotel")
            .gte("start_datetime", start_window.isoformat())
            .lte("start_datetime", end_window.isoformat())
            .order("start_datetime", desc=False)
            .limit(1)
            .execute()
        )

        if result.data:
            booking = result.data[0]
            return HotelBooking(
                found=True,
                hotel_name=booking.get("title"),
                check_in=booking.get("start_datetime"),
                check_out=booking.get("end_datetime"),
                location=destination,
                source="calendar",
                confidence=1.0,
            )
    except Exception as e:
        import sys
        print(f"[WARN] Error checking calendar for hotel booking: {e}", file=sys.stderr)

    # No explicit hotel booking found, return suggestions
    return HotelBooking(
        found=False,
        suggestion=f"No hotel booking found for {destination}. Would you like to search for hotels?",
        recommendations=get_sample_hotels(destination, count=3),
    )


def get_sample_hotels(destination: str, count: int = 3) -> list[dict]:
    """Get sample hotel recommendations for a destination.

    Args:
        destination: Airport code (LON, NYC, etc.) or city name
        count: Number of hotels to return

    Returns:
        List of hotel dicts with name, rating, price, location
    """
    # Extract airport code from destination (first 3 chars if all caps)
    code = destination.upper()[:3] if len(destination) >= 3 else destination.upper()

    hotels = SAMPLE_HOTELS.get(code, [])
    return hotels[:count] if hotels else []
