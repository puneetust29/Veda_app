"""Hotel booking detection logic."""
from datetime import datetime, timedelta, timezone
from typing import Optional
import re

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
) -> Optional[HotelBooking]:
    """Detect if a hotel booking exists for a flight's destination.

    Priority order:
    1. Check hotel_bookings table for confirmed reservations
    2. Check calendar_events for hotel events
    3. Check gmail_messages for hotel confirmation emails

    Args:
        customer_id: Customer UUID
        destination: Airport code or city name
        arrival_date: Flight arrival datetime

    Returns:
        HotelBooking if found, None otherwise
    """
    if not destination:
        return None

    supabase = get_supabase()

    # 1. Check hotel_bookings table for confirmed reservations (highest priority)
    hotel_from_bookings = _check_hotel_bookings_table(supabase, customer_id, destination, arrival_date)
    if hotel_from_bookings:
        return hotel_from_bookings

    # 2. Check calendar_events for hotel bookings
    hotel_from_calendar = _check_calendar_for_hotel(supabase, customer_id, destination, arrival_date)
    if hotel_from_calendar:
        return hotel_from_calendar

    # 3. Check gmail_messages for hotel confirmations
    hotel_from_email = _check_email_for_hotel(supabase, customer_id, destination, arrival_date)
    if hotel_from_email:
        return hotel_from_email

    return None


def _check_hotel_bookings_table(
    supabase,
    customer_id: str,
    destination: str,
    arrival_date: datetime,
) -> Optional[HotelBooking]:
    """Search hotel_bookings table for confirmed reservations.

    Looks for bookings where check_in is within ±1 day of flight arrival.
    """
    try:
        # Check for booking within ±1 day of arrival
        start_window = (arrival_date - timedelta(days=1)).replace(hour=0, minute=0, second=0)
        end_window = (arrival_date + timedelta(days=1)).replace(hour=23, minute=59, second=59)

        result = (
            supabase.table("hotel_bookings")
            .select("*")
            .eq("customer_id", str(customer_id))
            .gte("check_in", start_window.isoformat())
            .lte("check_in", end_window.isoformat())
            .order("check_in", desc=False)
            .limit(1)
            .execute()
        )

        if result.data:
            booking = result.data[0]
            return HotelBooking(
                found=True,
                hotel_name=booking.get("hotel_name"),
                check_in=booking.get("check_in"),
                check_out=booking.get("check_out"),
                location=destination,
                source="booking",
                confidence=1.0,
            )
    except Exception as e:
        import sys

        print(f"[WARN] Error checking hotel_bookings table: {e}", file=sys.stderr)

    return None


def _check_calendar_for_hotel(
    supabase,
    customer_id: str,
    destination: str,
    arrival_date: datetime,
) -> Optional[HotelBooking]:
    """Search calendar_events for hotel bookings near arrival date."""
    try:
        # Check for events with 'hotel' in title in the ±1 day window
        start_window = (arrival_date - timedelta(days=1)).replace(hour=0, minute=0, second=0)
        end_window = (arrival_date + timedelta(days=2)).replace(hour=23, minute=59, second=59)

        result = (
            supabase.table("calendar_events")
            .select("*")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "other")
            .gte("start_datetime", start_window.isoformat())
            .lte("start_datetime", end_window.isoformat())
            .execute()
        )

        for event in result.data:
            title = event.get("title", "").lower()
            # Look for hotel keywords
            if any(keyword in title for keyword in ["hotel", "accommodation", "booking", "stay", "room"]):
                # Additional check: destination should be mentioned somewhere
                # (simplified: just check if hotel keywords exist)
                return HotelBooking(
                    found=True,
                    hotel_name=event.get("title"),
                    check_in=event.get("start_datetime"),
                    check_out=event.get("end_datetime"),
                    location=destination,
                    source="calendar",
                    confidence=0.9,
                )
    except Exception as e:
        import sys

        print(f"[WARN] Error checking calendar for hotel: {e}", file=sys.stderr)

    return None


def _check_email_for_hotel(
    supabase,
    customer_id: str,
    destination: str,
    arrival_date: datetime,
) -> Optional[HotelBooking]:
    """Search gmail_messages for hotel confirmation emails near arrival date."""
    try:
        # Look for recent emails with hotel keywords
        start_window = (arrival_date - timedelta(days=7)).replace(hour=0, minute=0, second=0)
        end_window = (arrival_date + timedelta(days=2)).replace(hour=23, minute=59, second=59)

        result = (
            supabase.table("gmail_messages")
            .select("*")
            .eq("customer_id", str(customer_id))
            .gte("received_at", start_window.isoformat())
            .lte("received_at", end_window.isoformat())
            .execute()
        )

        for email in result.data:
            subject = email.get("subject", "").lower()
            body = email.get("body", "").lower()
            combined = f"{subject}\n{body}"

            # Look for hotel booking keywords
            hotel_keywords = [
                "hotel",
                "booking confirmation",
                "reservation confirmed",
                "your stay",
                "check-in",
                "confirmation number",
            ]
            has_hotel_keyword = any(keyword in combined for keyword in hotel_keywords)

            # Look for hotel brands
            hotel_brands = [
                "marriott",
                "hilton",
                "hyatt",
                "ritz-carlton",
                "four seasons",
                "sheraton",
                "westin",
                "starwood",
                "accor",
                "ihg",
            ]
            has_hotel_brand = any(brand in combined for brand in hotel_brands)

            if has_hotel_keyword or has_hotel_brand:
                # Extract hotel name and dates if possible
                hotel_name = _extract_hotel_name(combined)
                check_in_date = _extract_date_from_email(combined)

                confidence = 0.95 if (has_hotel_keyword and has_hotel_brand) else 0.75

                return HotelBooking(
                    found=True,
                    hotel_name=hotel_name or "Hotel booking detected",
                    check_in=check_in_date or arrival_date.isoformat(),
                    check_out=None,
                    location=destination,
                    source="email",
                    confidence=confidence,
                )
    except Exception as e:
        import sys

        print(f"[WARN] Error checking email for hotel: {e}", file=sys.stderr)

    return None


def _extract_hotel_name(text: str) -> Optional[str]:
    """Try to extract hotel name from email text."""
    # Look for common patterns like "Hotel Name" or "Your booking at Hotel Name"
    patterns = [
        r"(?:your booking at|booked at|reservation at|staying at)\s+([A-Za-z\s]+?)(?:\.|,|\n|$)",
        r"(?:confirmed at|confirmed booking:)\s+([A-Za-z\s]+?)(?:\.|,|\n|$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return None


def _extract_date_from_email(text: str) -> Optional[str]:
    """Try to extract check-in date from email text."""
    # Look for date patterns like "Check-in: Aug 25" or "August 25, 2026"
    patterns = [
        r"check[- ]?in[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"arriving[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"(\d{1,2}\s+[A-Za-z]+\s+\d{4})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                date_str = match.group(1)
                # Try to parse the date
                for fmt in ["%b %d, %Y", "%B %d, %Y", "%b %d", "%B %d", "%d %B %Y"]:
                    try:
                        parsed = datetime.strptime(date_str, fmt)
                        if parsed.year == 1900:
                            parsed = parsed.replace(year=datetime.now().year)
                        return parsed.isoformat()
                    except ValueError:
                        continue
            except Exception:
                pass

    return None


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
