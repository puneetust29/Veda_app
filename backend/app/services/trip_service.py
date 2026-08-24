"""Service functions for grouping and analyzing round-trip flights."""
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional

from app.db.client import get_supabase
from app.models.trip import RoundTrip, FlightLeg


def get_round_trips(customer_id: str) -> List[RoundTrip]:
    """Get all round-trip flights grouped together.

    Detects flights where:
    - Outbound: A → B on date D1
    - Return: B → A on date D2 (where D2 > D1 and D2 <= D1 + 60 days)
    """
    supabase = get_supabase()

    # Get all flights for this customer
    flights = (
        supabase.table("calendar_events")
        .select("id, origin, destination, start_datetime, raw_details")
        .eq("customer_id", customer_id)
        .eq("event_type", "flight")
        .order("start_datetime", desc=False)
        .execute()
    )

    if not flights.data:
        return []

    flights_list = flights.data
    trips = []
    seen_flight_ids = set()

    # Find matching return flights
    for i, outbound in enumerate(flights_list):
        if outbound["id"] in seen_flight_ids:
            continue

        outbound_date = datetime.fromisoformat(
            outbound["start_datetime"].replace("Z", "+00:00")
        )
        max_return_date = outbound_date + timedelta(days=60)

        # Find matching return flight
        return_flight = None
        for return_candidate in flights_list[i + 1 :]:
            return_date = datetime.fromisoformat(
                return_candidate["start_datetime"].replace("Z", "+00:00")
            )

            # Check if this is a return flight
            if (
                return_candidate["origin"] == outbound["destination"]
                and return_candidate["destination"] == outbound["origin"]
                and return_date <= max_return_date
            ):
                return_flight = return_candidate
                break

        # Create trip ID (hash of flight IDs for consistency)
        if return_flight:
            flight_ids = sorted([outbound["id"], return_flight["id"]])
            seen_flight_ids.add(return_flight["id"])
        else:
            flight_ids = [outbound["id"]]

        trip_id = hashlib.md5("|".join(flight_ids).encode()).hexdigest()[:12]
        seen_flight_ids.add(outbound["id"])

        # Extract destination country
        destination_country = (
            outbound.get("raw_details", {}).get("destination_country") or "Unknown"
        )

        # Calculate trip duration
        if return_flight:
            return_date = datetime.fromisoformat(
                return_flight["start_datetime"].replace("Z", "+00:00")
            )
            trip_duration_days = max(1, (return_date.date() - outbound_date.date()).days)
        else:
            trip_duration_days = 1

        trip = RoundTrip(
            trip_id=trip_id,
            outbound_flight=FlightLeg(
                flight_id=outbound["id"],
                city=outbound["destination"],
                airport_code=outbound["destination"],
                date=outbound_date,
            ),
            return_flight=(
                FlightLeg(
                    flight_id=return_flight["id"],
                    city=return_flight["destination"],
                    airport_code=return_flight["destination"],
                    date=datetime.fromisoformat(
                        return_flight["start_datetime"].replace("Z", "+00:00")
                    ),
                )
                if return_flight
                else None
            ),
            destination_country=destination_country,
            trip_duration_days=trip_duration_days,
            is_round_trip=bool(return_flight),
        )

        trips.append(trip)

    return trips


def get_trip_duration_for_roaming(customer_id: str, flight_id: str) -> int:
    """Get trip duration in days for roaming agent (finds matching return flight).

    If a return flight exists within 60 days, returns the duration.
    Otherwise returns 1 day (one-way flight).
    """
    supabase = get_supabase()

    # Get the outbound flight details
    outbound_result = (
        supabase.table("calendar_events")
        .select("id, origin, destination, start_datetime")
        .eq("id", flight_id)
        .eq("customer_id", customer_id)
        .single()
        .execute()
    )

    if not outbound_result.data:
        return 1  # Default to 1 day if flight not found

    flight = outbound_result.data
    outbound_date = datetime.fromisoformat(
        flight["start_datetime"].replace("Z", "+00:00")
    )
    max_return_date = outbound_date + timedelta(days=60)

    # Look for matching return flight
    return_flights = (
        supabase.table("calendar_events")
        .select("start_datetime")
        .eq("customer_id", customer_id)
        .eq("origin", flight["destination"])
        .eq("destination", flight["origin"])
        .eq("event_type", "flight")
        .gt("start_datetime", flight["start_datetime"])
        .lte("start_datetime", max_return_date.isoformat())
        .limit(1)
        .execute()
    )

    if return_flights.data:
        return_date = datetime.fromisoformat(
            return_flights.data[0]["start_datetime"].replace("Z", "+00:00")
        )
        return max(1, (return_date.date() - outbound_date.date()).days)

    return 1  # No return flight found, assume 1-day trip
