"""Gmail email flight confirmation extraction.

Parses synced Gmail emails to identify flight confirmations and extract
flight details (origin, destination, dates) for automatic calendar sync.
Uses the existing flight_classifier module for detection.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.client import get_supabase
from app.integrations import flight_classifier


class FlightEmailParsing:
    """Parsed flight data extracted from a Gmail email."""

    def __init__(
        self,
        *,
        gmail_message_id: str,
        customer_id: str,
        origin: str,
        destination: str,
        title: str,
        start_datetime: datetime,
        end_datetime: Optional[datetime],
        confidence: float,
        email_sender: str,
        email_subject: str,
        email_received_at: datetime,
    ):
        self.gmail_message_id = gmail_message_id
        self.customer_id = customer_id
        self.origin = origin
        self.destination = destination
        self.title = title
        self.start_datetime = start_datetime
        self.end_datetime = end_datetime or (start_datetime + timedelta(hours=6))
        self.confidence = confidence
        self.email_sender = email_sender
        self.email_subject = email_subject
        self.email_received_at = email_received_at

    def to_calendar_event(self) -> dict:
        """Convert to calendar_events table row format."""
        return {
            "customer_id": self.customer_id,
            "title": self.title,
            "event_type": "flight",
            "origin": self.origin,
            "destination": self.destination,
            "start_datetime": self.start_datetime.isoformat(),
            "end_datetime": self.end_datetime.isoformat(),
            "source": "gmail",
            "raw_details": {
                "email_sender": self.email_sender,
                "email_subject": self.email_subject,
                "email_received_at": self.email_received_at.isoformat(),
                "flight_confidence": self.confidence,
                "parsed_from": "email_body",
                "gmail_message_id": self.gmail_message_id,
            },
        }


def parse_flight_email(email: dict, customer_id: str) -> Optional[FlightEmailParsing]:
    """Parse an email and extract flight details if it's a flight confirmation.

    Args:
        email: Row from gmail_messages table with id, subject, body, sender, received_at
        customer_id: Customer UUID for context

    Returns:
        FlightEmailParsing if flight detected with confidence > 0.85, else None
    """
    subject = email.get("subject") or ""
    body = email.get("body") or ""
    sender = email.get("sender") or ""
    received_at_str = email.get("received_at")

    # Parse received_at timestamp
    try:
        received_at = (
            datetime.fromisoformat(received_at_str)
            if isinstance(received_at_str, str)
            else received_at_str
        )
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        received_at = datetime.now(timezone.utc)

    # Classify the email as a flight
    combined_text = f"{subject}\n{body}"
    classification = flight_classifier.classify_event(
        title=subject,
        location="",
        notes=body,
    )

    # Only accept flights with high confidence
    if not classification.is_flight or classification.confidence < 0.85:
        return None

    # Extract origin and destination
    origin = classification.origin or _extract_origin_from_email(subject, body)
    destination = (
        classification.destination or _extract_destination_from_email(subject, body)
    )

    if not origin or not destination:
        return None

    # Extract flight dates
    start_datetime, end_datetime = _extract_dates_from_email(subject, body, received_at)

    # Build title from subject or flight info
    title = subject.strip() or f"Flight {origin} → {destination}"

    return FlightEmailParsing(
        gmail_message_id=email.get("gmail_message_id", ""),
        customer_id=customer_id,
        origin=origin,
        destination=destination,
        title=title,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        confidence=classification.confidence,
        email_sender=sender,
        email_subject=subject,
        email_received_at=received_at,
    )


def _extract_origin_from_email(subject: str, body: str) -> Optional[str]:
    """Extract origin airport code from email subject/body.

    Looks for patterns like "LAX → JFK", "LAX-JFK", "from LAX", etc.
    """
    # Pattern: XXX → YYY or XXX-YYY or from XXX
    patterns = [
        r"^([A-Z]{3})\s*[→→-]\s*[A-Z]{3}",  # Start of subject: LAX → JFK
        r"from\s+([A-Z]{3})(?:\s|$)",  # from LAX
        r"depart(?:ing|s)?\s+from\s+([A-Z]{3})",  # departing from LAX
    ]

    for pattern in patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    # Try body as fallback
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


def _extract_destination_from_email(subject: str, body: str) -> Optional[str]:
    """Extract destination airport code from email subject/body.

    Looks for patterns like "LAX → JFK", "LAX-JFK", "to JFK", etc.
    """
    # Pattern: XXX → YYY or XXX-YYY or to YYY
    patterns = [
        r"[A-Z]{3}\s*[→→-]\s*([A-Z]{3})(?:\s|$)",  # LAX → JFK
        r"to\s+([A-Z]{3})(?:\s|$)",  # to JFK
        r"arriv(?:ing|es)?\s+(?:at|in)\s+([A-Z]{3})",  # arriving at JFK
    ]

    for pattern in patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    # Try body as fallback
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


def _extract_dates_from_email(
    subject: str, body: str, email_received_at: datetime
) -> tuple[datetime, datetime]:
    """Extract flight dates from email subject/body.

    Looks for patterns like "Aug 25-28", "08/25/2026", "2026-08-25", etc.
    Falls back to email received_at if no dates found.

    Returns: (start_datetime, end_datetime)
    """
    combined = f"{subject}\n{body}"

    # Try to find date ranges like "Aug 25-28" or "Aug 25 - Aug 28"
    date_patterns = [
        # "Aug 25-28" (month and date range)
        r"([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})",
        # "08/25/2026" or "8/25/2026"
        r"(\d{1,2})/(\d{1,2})/(\d{4})",
        # "2026-08-25"
        r"(\d{4})-(\d{2})-(\d{2})",
        # "25 Aug 2026"
        r"(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})",
    ]

    # Try the first pattern (month + date range)
    month_range_match = re.search(
        r"([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})", combined
    )
    if month_range_match:
        month_str, start_day_str, end_day_str = month_range_match.groups()
        year = email_received_at.year
        try:
            start_dt = datetime.strptime(
                f"{month_str} {start_day_str} {year}", "%b %d %Y"
            )
            end_dt = datetime.strptime(f"{month_str} {end_day_str} {year}", "%b %d %Y")
            if end_dt < start_dt:
                end_dt = end_dt.replace(year=year + 1)
            return (start_dt.replace(tzinfo=timezone.utc), end_dt.replace(tzinfo=timezone.utc))
        except ValueError:
            pass

    # Try ISO date pattern
    iso_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", combined)
    if iso_match:
        year, month, day = iso_match.groups()
        try:
            dt = datetime(int(year), int(month), int(day), tzinfo=timezone.utc)
            return (dt, dt + timedelta(days=1))
        except ValueError:
            pass

    # Try MM/DD/YYYY pattern
    slash_match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", combined)
    if slash_match:
        month, day, year = slash_match.groups()
        try:
            dt = datetime(int(year), int(month), int(day), tzinfo=timezone.utc)
            return (dt, dt + timedelta(days=1))
        except ValueError:
            pass

    # Try DD Mon YYYY pattern
    dmy_match = re.search(r"(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})", combined)
    if dmy_match:
        day, month_str, year = dmy_match.groups()
        try:
            dt = datetime.strptime(f"{day} {month_str} {year}", "%d %b %Y")
            return (dt.replace(tzinfo=timezone.utc), dt.replace(tzinfo=timezone.utc) + timedelta(days=1))
        except ValueError:
            pass

    # Fallback: use email received_at as start date
    return (email_received_at, email_received_at + timedelta(days=1))


def check_duplicate_flight(
    customer_id: str,
    origin: str,
    destination: str,
    start_datetime: datetime,
) -> bool:
    """Check if a flight with same origin/destination/time already exists.

    Uses time-window matching (±30 min) instead of date-only to handle:
    - Same-day flights at different times (8am vs 2pm)
    - Timezone parsing variance
    - Connecting flights same day

    Returns True if duplicate found, False otherwise.
    """
    supabase = get_supabase()

    try:
        # Parse datetime and create ±30 minute window
        from dateutil.parser import isoparse

        if isinstance(start_datetime, str):
            flight_time = isoparse(start_datetime)
        else:
            flight_time = start_datetime

        window_start = (flight_time - timedelta(minutes=30)).isoformat()
        window_end = (flight_time + timedelta(minutes=30)).isoformat()

        result = (
            supabase.table("calendar_events")
            .select("id")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "flight")
            .eq("origin", origin)
            .eq("destination", destination)
            .gte("start_datetime", window_start)
            .lte("start_datetime", window_end)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception as e:
        # Log error but don't fail the entire sync
        import sys

        print(f"[WARN] Error checking duplicate flight: {e}", file=sys.stderr)
        return False


class HotelEmailParsing:
    """Parsed hotel booking data extracted from a Gmail email."""

    def __init__(
        self,
        *,
        gmail_message_id: str,
        customer_id: str,
        hotel_name: str,
        check_in: datetime,
        check_out: Optional[datetime],
        confidence: float,
        email_sender: str,
        email_subject: str,
        email_received_at: datetime,
    ):
        self.gmail_message_id = gmail_message_id
        self.customer_id = customer_id
        self.hotel_name = hotel_name
        self.check_in = check_in
        self.check_out = check_out or (check_in + timedelta(days=1))
        self.confidence = confidence
        self.email_sender = email_sender
        self.email_subject = email_subject
        self.email_received_at = email_received_at

    def to_calendar_event(self) -> dict:
        """Convert to calendar_events table row format."""
        return {
            "customer_id": self.customer_id,
            "title": self.hotel_name,
            "event_type": "hotel",
            "start_datetime": self.check_in.isoformat(),
            "end_datetime": self.check_out.isoformat(),
            "source": "gmail",
            "raw_details": {
                "email_sender": self.email_sender,
                "email_subject": self.email_subject,
                "email_received_at": self.email_received_at.isoformat(),
                "hotel_confidence": self.confidence,
                "parsed_from": "email_body",
                "gmail_message_id": self.gmail_message_id,
            },
        }


def parse_hotel_email(email: dict, customer_id: str) -> Optional[HotelEmailParsing]:
    """Parse an email and extract hotel booking details if it's a hotel confirmation.

    Looks for keywords like "booking confirmation", "reservation", "check-in", etc.

    Args:
        email: Row from gmail_messages table with id, subject, body, sender, received_at
        customer_id: Customer UUID for context

    Returns:
        HotelEmailParsing if hotel booking detected with confidence > 0.7, else None
    """
    subject = email.get("subject") or ""
    body = email.get("body") or ""
    sender = email.get("sender") or ""
    received_at_str = email.get("received_at")

    # Parse received_at timestamp
    try:
        received_at = (
            datetime.fromisoformat(received_at_str)
            if isinstance(received_at_str, str)
            else received_at_str
        )
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        received_at = datetime.now(timezone.utc)

    combined_text = f"{subject}\n{body}".lower()

    # Hotel detection keywords
    hotel_keywords = [
        "booking confirmation",
        "hotel reservation",
        "check-in",
        "check in",
        "check-out",
        "check out",
        "confirmation number",
        "booking reference",
        "reservation confirmed",
        "your stay",
        "hotel booking",
        "room reservation",
    ]

    # Check if this looks like a hotel confirmation
    has_hotel_keyword = any(keyword in combined_text for keyword in hotel_keywords)
    if not has_hotel_keyword:
        return None

    # Extract hotel name from email
    hotel_name = _extract_hotel_name_from_email(subject, body)
    if not hotel_name:
        return None

    # Extract check-in and check-out dates
    check_in, check_out = _extract_hotel_dates_from_email(subject, body, received_at)
    if not check_in:
        return None

    # Calculate confidence based on what we found
    confidence = 0.9 if check_out else 0.75

    return HotelEmailParsing(
        gmail_message_id=email.get("gmail_message_id", ""),
        customer_id=customer_id,
        hotel_name=hotel_name,
        check_in=check_in,
        check_out=check_out,
        confidence=confidence,
        email_sender=sender,
        email_subject=subject,
        email_received_at=received_at,
    )


def _extract_hotel_name_from_email(subject: str, body: str) -> Optional[str]:
    """Extract hotel name from email subject/body.

    Looks for patterns like:
    - "Your booking at Hotel Name"
    - "Reservation confirmed: Hotel Name"
    - "Check-in Hotel Name"
    """
    combined = f"{subject}\n{body}"
    patterns = [
        r"(?:booking|reservation|check[- ]?in)\s+(?:at|:)\s+([A-Za-z\s&'-]+?)(?:\.|,|\n|$)",
        r"(?:confirmed at|booked at|staying at)\s+([A-Za-z\s&'-]+?)(?:\.|,|\n|$)",
        r"(?:hotel|property):\s+([A-Za-z\s&'-]+?)(?:\.|,|\n|$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            hotel_name = match.group(1).strip()
            # Filter out common non-hotel text
            if len(hotel_name) > 2 and len(hotel_name) < 100 and hotel_name.lower() not in ["the", "your", "this", "that", "our"]:
                return hotel_name

    return None


def _extract_hotel_dates_from_email(
    subject: str, body: str, email_received_at: datetime
) -> tuple[Optional[datetime], Optional[datetime]]:
    """Extract check-in and check-out dates from hotel confirmation email.

    Looks for patterns like:
    - "Check-in: Aug 25, 2026"
    - "Aug 25-28"
    - "08/25/2026"

    Returns: (check_in_datetime, check_out_datetime) or (None, None) if not found
    """
    combined = f"{subject}\n{body}"

    # Try to find check-in date
    check_in_patterns = [
        r"check[- ]?in[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"arrival[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"^([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)[\s-]*(?:to|through|-)",
    ]

    check_in = None
    for pattern in check_in_patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            check_in = _parse_date_string(date_str, email_received_at)
            if check_in:
                break

    if not check_in:
        return None, None

    # Try to find check-out date
    check_out_patterns = [
        r"check[- ]?out[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"departure[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"(?:through|to|until)[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
    ]

    check_out = None
    for pattern in check_out_patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            check_out = _parse_date_string(date_str, email_received_at)
            if check_out:
                break

    # Try date range pattern (Aug 25-28)
    if not check_out:
        range_match = re.search(
            r"([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})(?:,?\s+(\d{4}))?", combined
        )
        if range_match:
            month_str, start_day, end_day, year = range_match.groups()
            year = year or str(email_received_at.year)
            try:
                check_out_str = f"{month_str} {end_day}, {year}"
                check_out = _parse_date_string(check_out_str, email_received_at)
            except Exception:
                pass

    return check_in, check_out


def _parse_date_string(date_str: str, fallback_date: datetime) -> Optional[datetime]:
    """Parse a date string into a datetime object.

    Tries multiple formats and falls back to a default if parsing fails.
    """
    if not date_str:
        return None

    formats = [
        "%b %d, %Y",
        "%B %d, %Y",
        "%b %d",
        "%B %d",
        "%m/%d/%Y",
        "%m/%d",
        "%d %b %Y",
        "%d %B %Y",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str.strip(), fmt)
            # Add year if missing
            if parsed.year == 1900:
                parsed = parsed.replace(year=fallback_date.year)
            # Add timezone
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def check_duplicate_hotel(
    customer_id: str,
    hotel_name: str,
    check_in: datetime,
) -> bool:
    """Check if a hotel booking already exists.

    Checks by hotel_name and check_in date (±1 day window) to handle:
    - Timezone parsing variance
    - Date format variations

    Returns True if duplicate found, False otherwise.
    """
    supabase = get_supabase()

    try:
        # Create ±1 day window around check-in date
        check_in_dt = check_in if isinstance(check_in, datetime) else datetime.fromisoformat(check_in)
        window_start = (check_in_dt - timedelta(days=1)).replace(hour=0, minute=0, second=0)
        window_end = (check_in_dt + timedelta(days=1)).replace(hour=23, minute=59, second=59)

        result = (
            supabase.table("calendar_events")
            .select("id")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "hotel")
            .gte("start_datetime", window_start.isoformat())
            .lte("start_datetime", window_end.isoformat())
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception as e:
        # Log error but don't fail the entire sync
        import sys

        print(f"[WARN] Error checking duplicate hotel: {e}", file=sys.stderr)
        return False
