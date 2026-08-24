from dateutil.parser import isoparse


def extract_trip_context(calendar_event: dict) -> tuple[str, int]:
    """Derive destination country + trip length (days) from a mocked flight event."""
    destination_country = calendar_event.get("raw_details", {}).get("destination_country")
    if not destination_country:
        destination_country = calendar_event.get("destination", "Unknown")

    start = isoparse(calendar_event["start_datetime"])
    end = isoparse(calendar_event["end_datetime"])
    duration_days = max(1, (end - start).days)
    return destination_country, duration_days
