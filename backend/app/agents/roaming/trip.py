from datetime import datetime
from app.services.trip_service import get_trip_duration_for_roaming, get_round_trips


def extract_trip_context(calendar_event: dict) -> tuple[str, int, dict]:
    """Derive destination country + trip length + trip details from flight event.

    For round-trip flights, detects the return flight and uses actual trip duration.
    For one-way flights, uses the flight duration or defaults to 1 day.

    Returns: (destination_country, duration_days, trip_details)
    """
    destination_country = calendar_event.get("raw_details", {}).get("destination_country")
    if not destination_country:
        destination_country = calendar_event.get("destination", "Unknown")

    # Get trip duration (detects matching return flight within 60 days)
    try:
        duration_days = get_trip_duration_for_roaming(
            calendar_event["customer_id"],
            calendar_event["id"]
        )
    except Exception:
        # Fallback: use flight duration if trip lookup fails
        try:
            start = datetime.fromisoformat(calendar_event["start_datetime"])
            end = datetime.fromisoformat(calendar_event["end_datetime"])
            duration_days = max(1, (end - start).days)
        except Exception:
            duration_days = 1

    # Get full trip details for display
    trip_details = {
        "departure_city": calendar_event.get("origin", "Unknown"),
        "destination_city": calendar_event.get("destination", "Unknown"),
        "departure_date": calendar_event.get("start_datetime", ""),
        "return_date": None,
        "is_round_trip": False,
    }

    # Look for matching return flight to show return date
    try:
        trips = get_round_trips(calendar_event["customer_id"])
        for trip in trips:
            if (trip.outbound_flight.flight_id == calendar_event["id"] and
                trip.is_round_trip and trip.return_flight):
                trip_details["return_date"] = trip.return_flight.date.isoformat()
                trip_details["is_round_trip"] = True
                break
    except Exception:
        pass

    return destination_country, duration_days, trip_details
